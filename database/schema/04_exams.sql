-- Packages and attempts: taking a past paper as a timed exam or as practice.
--
-- A package is a fixed, ordered set of questions taken as an exam (timed, keys hidden until the
-- end, best score kept) or as practice (instant feedback). A package with a track is only for
-- that class; null means both.
--
-- Rules the functions enforce (the browser is never trusted with them):
-- - One attempt in progress per student, across all packages and bank practice.
-- - An attempt freezes its questions, their order, each question's option order and revision
--   when it starts (one `attempt_items` row per question), so editing a package or a question
--   later never rewrites someone's attempt.
-- - The deadline is started_at + time limit, on the server's clock. Answers saved more than GRACE
--   seconds after it are refused; a late submit is graded on the answers saved before it. An
--   expired attempt is graded the next time its owner touches it (no scheduled job needed).
-- - One browser tab holds an attempt at a time (`holder`, a random id per tab). Another tab can
--   take it over, but a tab that isn't the holder can't save or submit.
-- - Exam attempts never send answer keys before they're finished. Practice attempts send them
--   with the questions, for instant feedback.
-- - Short answers are graded by the student's own mark in practice and not graded in exams (a
--   self-mark can't count toward a best score).
-- - A finished attempt can't be changed. Grading happens only in app.finish_attempt().

create type app.package_mode as enum ('exam', 'practice');
create type app.attempt_status as enum ('in_progress', 'finished', 'abandoned');

create table app.packages (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(btrim(title)) between 1 and 160),
  block              text references app.blocks(id),
  source             text check (length(source) <= 60),
  year               int check (year between 2000 and 2100),
  mode               app.package_mode not null,
  time_limit_minutes int check (time_limit_minutes between 1 and 300),
  track_best         boolean not null default false,
  track              app.track,
  status             app.publish_status not null default 'draft',
  created_by         uuid references app.accounts(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint packages_exam_timed check (mode <> 'exam' or time_limit_minutes is not null),
  constraint packages_best_only_exam check (not track_best or mode = 'exam')
);

create index packages_block on app.packages (block) where deleted_at is null;
create index packages_created_by on app.packages (created_by);

create trigger packages_touch before update on app.packages
  for each row execute function app.touch_updated_at();

create table app.package_questions (
  package_id  uuid not null references app.packages(id) on delete cascade,
  question_id uuid not null references app.questions(id),
  position    int not null,
  primary key (package_id, question_id)
);

create index package_questions_order on app.package_questions (package_id, position);
create index package_questions_question on app.package_questions (question_id);

create table app.attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references app.accounts(id) on delete cascade,
  -- Null for practice drawn from the bank (05_practice.sql), which has its own title.
  package_id         uuid references app.packages(id),
  title              text check (length(title) <= 160),
  mode               app.package_mode not null,
  time_limit_minutes int check (time_limit_minutes between 1 and 300),
  holder             uuid,
  tab_leaves         int not null default 0,
  status             app.attempt_status not null default 'in_progress',
  -- Set by app.finish_attempt only.
  score              numeric(5, 1),
  correct_count      int,
  wrong_count        int,
  blank_count        int,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  constraint attempts_package_or_title check (package_id is not null or title is not null)
);

create index attempts_user on app.attempts (user_id, started_at desc);
create unique index attempts_one_running on app.attempts (user_id) where status = 'in_progress';
create index attempts_package on app.attempts (package_id) where package_id is not null;

-- One row per question in an attempt: what was shown, what was answered, and how it was graded.
create table app.attempt_items (
  attempt_id     uuid not null references app.attempts(id) on delete cascade,
  position       int not null,               -- 1 = first question shown
  question_id    uuid not null references app.questions(id),
  revision       int not null,                -- the question's revision when the attempt started
  -- Single choice: option_order[k] = the print position shown at display position k (0-based).
  option_order   int[],
  choice         int,                         -- the display position picked
  answer_text    text check (length(answer_text) <= 2000),
  self_mark      boolean,
  flagged        boolean not null default false,
  -- Set by app.finish_attempt: the display position of the right option, and the outcome.
  correct_choice int,
  is_correct     boolean,
  graded         boolean,
  primary key (attempt_id, position),
  unique (attempt_id, question_id)
);

create index attempt_items_question on app.attempt_items (question_id);

alter table app.packages enable row level security;
alter table app.package_questions enable row level security;
alter table app.attempts enable row level security;
alter table app.attempt_items enable row level security;

create policy packages_read on app.packages for select to authenticated
  using ((status = 'published' and deleted_at is null and app.track_visible(track)) or (select public.is_admin()));
create policy package_questions_admin on app.package_questions for select to authenticated
  using ((select public.is_admin()));
create policy attempts_read on app.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy attempt_items_admin on app.attempt_items for select to authenticated
  using ((select public.is_admin()));

grant select on app.packages, app.package_questions, app.attempts, app.attempt_items to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Internals

-- Seconds past the deadline a save is still accepted (a debounced save already on its way).
create function app.attempt_grace_seconds()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

create function app.attempt_deadline(a app.attempts)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when a.time_limit_minutes is null then null
              else a.started_at + make_interval(mins => a.time_limit_minutes) end;
$$;

create function app.attempt_expired(a app.attempts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.attempt_deadline(a) is not null
     and now() > app.attempt_deadline(a) + make_interval(secs => app.attempt_grace_seconds());
$$;

-- Freezes a list of questions into a new attempt: their order as given, a shuffled option order
-- for each single-choice question, and each question's revision.
create function app.create_attempt(p_user_id uuid, p_package_id uuid, p_title text, p_mode app.package_mode,
                                   p_time_limit int, p_holder uuid, p_question_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into app.attempts (user_id, package_id, title, mode, time_limit_minutes, holder)
  values (p_user_id, p_package_id, p_title, p_mode, p_time_limit, p_holder)
  returning id into new_id;

  insert into app.attempt_items (attempt_id, position, question_id, revision, option_order)
  select new_id, ord.n, q.id, q.revision,
         case when q.kind = 'single_choice' then
           (select array_agg(o.position order by random()) from app.question_options o where o.question_id = q.id)
         end
    from unnest(p_question_ids) with ordinality as ord(id, n)
    join app.questions q on q.id = ord.id;
  return new_id;
end;
$$;

-- Writes a tab's answers into an attempt's items. p_answers is
-- { "<question id>": { "choice": <display position> } | { "text": "...", "self_mark": true|false } }.
create function app.apply_answers(p_attempt_id uuid, p_answers jsonb, p_flagged uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  update app.attempt_items i set
    choice = case when jsonb_typeof(p_answers -> i.question_id::text -> 'choice') = 'number'
                       and (p_answers -> i.question_id::text ->> 'choice')::numeric between 0 and coalesce(cardinality(i.option_order), 0) - 1
                  then (p_answers -> i.question_id::text ->> 'choice')::int end,
    answer_text = left(p_answers -> i.question_id::text ->> 'text', 2000),
    self_mark = case when jsonb_typeof(p_answers -> i.question_id::text -> 'self_mark') = 'boolean'
                     then (p_answers -> i.question_id::text ->> 'self_mark')::boolean end,
    flagged = coalesce(i.question_id = any(p_flagged), false)
  where i.attempt_id = p_attempt_id;
end;
$$;

-- An attempt's answers and flags in the shape the app sends them.
create function app.attempt_answers(p_attempt_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(i.question_id::text, jsonb_strip_nulls(jsonb_build_object(
           'choice', i.choice, 'text', i.answer_text, 'self_mark', i.self_mark)))
           filter (where i.choice is not null or i.answer_text is not null or i.self_mark is not null), '{}')
    from app.attempt_items i where i.attempt_id = p_attempt_id;
$$;

-- Grades an in-progress attempt and freezes it. Internal: callers check ownership first.
create function app.finish_attempt(p_attempt_id uuid, p_answers jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a app.attempts;
  c int;
  w int;
  b int;
begin
  select * into a from app.attempts where id = p_attempt_id for update;
  if a.status <> 'in_progress' then return; end if;

  -- Late: grade what was saved before the deadline, not what the browser sends now.
  if p_answers is not null and not app.attempt_expired(a) then
    perform app.apply_answers(a.id, p_answers,
      array(select i.question_id from app.attempt_items i where i.attempt_id = a.id and i.flagged));
  end if;

  update app.attempt_items i set
    correct_choice = g.correct_choice,
    graded = g.graded,
    is_correct = g.is_correct
  from (
    select i2.position,
           k.correct_choice,
           not (q.kind = 'short_answer' and a.mode = 'exam') as graded,
           case when q.kind = 'single_choice' then
                  case when i2.choice is null then null else i2.choice = k.correct_choice end
                when a.mode = 'practice' then i2.self_mark
           end as is_correct
      from app.attempt_items i2
      join app.questions q on q.id = i2.question_id
      left join lateral (
        select array_position(i2.option_order, app.question_correct_index(q.id)) - 1 as correct_choice
      ) k on q.kind = 'single_choice'
     where i2.attempt_id = a.id
  ) g
  where i.attempt_id = a.id and i.position = g.position;

  select count(*) filter (where graded and is_correct),
         count(*) filter (where graded and not is_correct),
         count(*) filter (where graded and is_correct is null)
    into c, w, b
    from app.attempt_items where attempt_id = a.id;

  update app.attempts set
    status = 'finished',
    holder = null,
    correct_count = c,
    wrong_count = w,
    blank_count = b,
    score = case when c + w + b = 0 then null else round(100.0 * c / (c + w + b), 1) end,
    finished_at = now()
  where id = a.id;
end;
$$;

-- Questions as the student sees them in this attempt: options in the attempt's order, and the keys
-- only when `with_keys`.
create function app.attempt_questions(p_attempt_id uuid, with_keys boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'type', q.kind,
      'subject', q.subject,
      'stem', q.stem,
      'stem_image', q.stem_image,
      'stem_image_alt', q.stem_image_alt,
      'revision', q.revision,
      'options', (
        select jsonb_agg(jsonb_build_object('text', o.text, 'image', o.image) order by s.n)
          from unnest(i.option_order) with ordinality s(p, n)
          join app.question_options o on o.question_id = q.id and o.position = s.p
      )
    ) || case when with_keys then jsonb_build_object(
      'correct', array_position(i.option_order, app.question_correct_index(q.id)) - 1,
      'accepted_answers', to_jsonb(app.question_accepted(q.id)),
      'explanation', q.explanation
    ) else '{}'::jsonb end
    order by i.position
  ), '[]')
  from app.attempt_items i
  join app.questions q on q.id = i.question_id
  where i.attempt_id = p_attempt_id;
$$;

-- Finishes the caller's attempts that ran out of time (lazily, whenever they come back).
create function app.finish_my_expired_attempts()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r app.attempts;
begin
  for r in select * from app.attempts where user_id = auth.uid() and status = 'in_progress' loop
    if app.attempt_expired(r) then perform app.finish_attempt(r.id, null); end if;
  end loop;
end;
$$;

-- Common start: signed in, one start at a time, expired attempts finished, and the attempt
-- already running if there is one.
create function app.begin_start()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from app.accounts where id = uid) then raise exception 'no_profile'; end if;
  -- One student, one start at a time: two clicks can't create two attempts.
  perform pg_advisory_xact_lock(hashtextextended('attempt:' || uid::text, 0));
  perform app.finish_my_expired_attempts();
  return (select id from app.attempts where user_id = uid and status = 'in_progress');
end;
$$;

-- How many live questions a package has.
create function app.package_question_count(p_package_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from app.package_questions pq
    join app.questions q on q.id = pq.question_id and q.deleted_at is null
   where pq.package_id = p_package_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- Packages with how many live questions each has. The packages policies decide which rows each
-- student sees (published, their class's); admins see all of them, drafts included.
create view public.package_summaries
with (security_invoker = on) as
select p.id, p.title, p.block, p.source, p.year, p.mode::text as mode, p.time_limit_minutes, p.track_best,
       p.status::text as status, p.created_at, p.updated_at, app.package_question_count(p.id) as question_count,
       p.track::text as track
  from app.packages p
 where p.deleted_at is null;

-- The caller's attempts (an admin's policy shows everyone's).
create view public.attempts
with (security_invoker = on) as
select a.id, a.user_id, a.package_id, a.title, a.mode::text as mode, a.status::text as status, a.score,
       a.correct_count, a.wrong_count, a.blank_count, a.tab_leaves, a.time_limit_minutes, a.started_at, a.finished_at
  from app.attempts a;

-- A package's questions in order, for Admin → Packages.
create view public.admin_package_questions
with (security_invoker = on) as
select pq.package_id, pq.position, q.id, q.kind::text as type, q.subject, q.stem, q.stem_image, q.stem_image_alt,
       app.question_options_json(q.id) as options, app.question_correct_index(q.id) as correct_index,
       app.question_accepted(q.id) as accepted_answers, q.explanation, q.revision, q.status::text as status
  from app.package_questions pq
  join app.questions q on q.id = pq.question_id and q.deleted_at is null;

-- The question bank as Admin → Questions shows it, with the titles of the live packages using each question.
create view public.admin_questions
with (security_invoker = on) as
select q.id, q.block, q.source, q.year, q.kind::text as type, q.subject, q.stem, q.stem_image, q.stem_image_alt,
       app.question_options_json(q.id) as options,
       app.question_correct_index(q.id) as correct_index,
       app.question_accepted(q.id) as accepted_answers,
       q.explanation, q.revision, q.status::text as status, q.import_id, q.import_position, q.created_at,
       array(select p.title from app.package_questions pq join app.packages p on p.id = pq.package_id and p.deleted_at is null
              where pq.question_id = q.id order by p.title) as packages
  from app.questions q
 where q.deleted_at is null;

revoke all on public.admin_questions from public, anon, authenticated;
grant select on public.admin_questions to authenticated;

revoke all on public.package_summaries, public.attempts, public.admin_package_questions from public, anon, authenticated;
grant select on public.package_summaries, public.attempts, public.admin_package_questions to authenticated;

-- Starts an attempt on a published package of the student's class, or returns the attempt
-- already running. Returns { attempt_id, resumed }.
create function public.start_attempt(p_package_id uuid, p_holder uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  running uuid := app.begin_start();
  pkg app.packages;
  ids uuid[];
begin
  if running is not null then return jsonb_build_object('attempt_id', running, 'resumed', true); end if;

  select * into pkg from app.packages
   where id = p_package_id and status = 'published' and deleted_at is null and app.track_visible(track);
  if pkg.id is null then raise exception 'package_not_found'; end if;

  -- Question order is shuffled for each attempt (and option order, in app.create_attempt).
  select array_agg(q.id order by random()) into ids
    from app.package_questions pq
    join app.questions q on q.id = pq.question_id and q.deleted_at is null
   where pq.package_id = pkg.id;
  if ids is null then raise exception 'package_empty'; end if;

  return jsonb_build_object(
    'attempt_id', app.create_attempt(auth.uid(), pkg.id, null, pkg.mode, pkg.time_limit_minutes, p_holder, ids),
    'resumed', false);
end;
$$;

-- Everything a tab needs to show an in-progress attempt. A finished attempt returns only its status.
-- holder_state: 'you' (this tab holds it), 'other' (another tab does), 'free'.
create function public.get_attempt(p_attempt_id uuid, p_holder uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a app.attempts;
  holder_state text;
begin
  select * into a from app.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null then raise exception 'attempt_not_found'; end if;

  if a.status = 'in_progress' and app.attempt_expired(a) then
    perform app.finish_attempt(a.id, null);
    select * into a from app.attempts where id = a.id;
  end if;
  if a.status <> 'in_progress' then
    return jsonb_build_object('id', a.id, 'status', a.status);
  end if;

  if a.holder is null and p_holder is not null then
    update app.attempts set holder = p_holder where id = a.id;
    a.holder := p_holder;
  end if;
  holder_state := case when a.holder is null then 'free' when a.holder = p_holder then 'you' else 'other' end;

  return jsonb_build_object(
    'id', a.id,
    'status', a.status,
    'mode', a.mode,
    'package_id', a.package_id,
    'title', coalesce(a.title, (select title from app.packages where id = a.package_id)),
    'holder_state', holder_state,
    'seconds_left', case when a.time_limit_minutes is null then null
                         else greatest(0, floor(extract(epoch from app.attempt_deadline(a) - now())))::int end,
    'answers', app.attempt_answers(a.id),
    'flagged', (select coalesce(jsonb_agg(i.question_id order by i.position), '[]')
                  from app.attempt_items i where i.attempt_id = a.id and i.flagged),
    'tab_leaves', a.tab_leaves,
    -- Only the holding tab gets the questions; another tab shows "continue here" instead.
    'questions', case when holder_state = 'other' then null
                      else app.attempt_questions(a.id, a.mode = 'practice') end
  );
end;
$$;

create function public.save_attempt(
  p_attempt_id uuid,
  p_holder uuid,
  p_answers jsonb,
  p_flagged uuid[] default '{}',
  p_tab_leaves int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a app.attempts;
begin
  select * into a from app.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null or a.status <> 'in_progress' then raise exception 'attempt_not_running'; end if;
  if app.attempt_expired(a) then raise exception 'time_up'; end if;
  if a.holder is not null and a.holder is distinct from p_holder then raise exception 'held_elsewhere'; end if;
  perform app.apply_answers(a.id, p_answers, coalesce(p_flagged, '{}'));
  update app.attempts set
    holder = coalesce(holder, p_holder),
    -- Leaving the tab only counts up.
    tab_leaves = greatest(tab_leaves, coalesce(p_tab_leaves, 0))
  where id = a.id;
end;
$$;

-- "Continue here": always allowed for the attempt's owner, so a dead laptop can't lock them out.
create function public.take_over_attempt(p_attempt_id uuid, p_holder uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_holder is null then raise exception 'holder_required'; end if;
  update app.attempts set holder = p_holder
   where id = p_attempt_id and user_id = auth.uid() and status = 'in_progress';
end;
$$;

create function public.submit_attempt(p_attempt_id uuid, p_holder uuid, p_answers jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a app.attempts;
begin
  select * into a from app.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null then raise exception 'attempt_not_found'; end if;
  if a.status <> 'in_progress' then return; end if;
  if a.holder is not null and a.holder is distinct from p_holder then raise exception 'held_elsewhere'; end if;
  perform app.finish_attempt(a.id, p_answers);
end;
$$;

-- Practice attempts can be thrown away; exams can only be submitted.
create function public.abandon_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.attempts set status = 'abandoned', holder = null, finished_at = now()
   where id = p_attempt_id and user_id = auth.uid() and status = 'in_progress' and mode = 'practice';
  if not found then raise exception 'cannot_abandon'; end if;
end;
$$;

-- A finished attempt with its questions and keys, for the result page (owner or admin).
create function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a app.attempts;
begin
  select * into a from app.attempts where id = p_attempt_id and (user_id = auth.uid() or public.is_admin());
  if a.id is null then raise exception 'attempt_not_found'; end if;
  if a.status <> 'finished' then raise exception 'attempt_not_finished'; end if;
  return jsonb_build_object(
    'id', a.id,
    'mode', a.mode,
    'package_id', a.package_id,
    'title', coalesce(a.title, (select title from app.packages where id = a.package_id)),
    'score', a.score,
    'correct_count', a.correct_count,
    'wrong_count', a.wrong_count,
    'blank_count', a.blank_count,
    'tab_leaves', a.tab_leaves,
    'started_at', a.started_at,
    'finished_at', a.finished_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'question_id', i.question_id, 'chosen', i.choice, 'text', i.answer_text, 'correct', i.correct_choice,
                'is_correct', i.is_correct, 'graded', i.graded) order by i.position), '[]')
                from app.attempt_items i where i.attempt_id = a.id),
    'question_revisions', (select coalesce(jsonb_object_agg(i.question_id::text, i.revision), '{}')
                             from app.attempt_items i where i.attempt_id = a.id),
    'questions', app.attempt_questions(a.id, true)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- API (admins)

-- Makes an exam package and a practice package from one import's questions, both as drafts.
create function public.admin_packages_from_import(
  p_import_id uuid,
  p_exam_title text,
  p_practice_title text,
  p_block text,
  p_source text,
  p_year int,
  p_time_limit_minutes int,
  p_track_best boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  exam_id uuid;
  practice_id uuid;
  n int;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  select count(*) into n from app.questions where import_id = p_import_id and deleted_at is null;
  if n = 0 then raise exception 'import_has_no_questions'; end if;

  insert into app.packages (title, block, source, year, mode, time_limit_minutes, track_best, created_by)
  values (btrim(p_exam_title), app.ensure_block(p_block), p_source, p_year, 'exam', p_time_limit_minutes,
          coalesce(p_track_best, false), me)
  returning id into exam_id;
  insert into app.packages (title, block, source, year, mode, created_by)
  values (btrim(p_practice_title), p_block, p_source, p_year, 'practice', me)
  returning id into practice_id;

  insert into app.package_questions (package_id, question_id, position)
  select pk.id, q.id, row_number() over (partition by pk.id order by q.import_position, q.id)
    from app.questions q
   cross join (values (exam_id), (practice_id)) as pk(id)
   where q.import_id = p_import_id and q.deleted_at is null;

  perform app.audit('packages.create', p_import_id::text, jsonb_build_object('exam', exam_id, 'practice', practice_id));
  return jsonb_build_object('exam_id', exam_id, 'practice_id', practice_id, 'question_count', n);
end;
$$;

-- Publishing a package publishes its questions too; unpublishing leaves the questions as they are
-- (another package may use them).
create function public.admin_set_package_status(p_package_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  if p_status not in ('draft', 'published') then raise exception 'bad_status'; end if;
  if p_status = 'published' and app.package_question_count(p_package_id) = 0 then raise exception 'package_empty'; end if;
  update app.packages set status = p_status::app.publish_status where id = p_package_id and deleted_at is null;
  if not found then raise exception 'package_not_found'; end if;
  if p_status = 'published' then
    update app.questions set status = 'published'
     where id in (select question_id from app.package_questions where package_id = p_package_id)
       and status <> 'published';
  end if;
  perform app.audit('package.' || p_status, p_package_id::text);
end;
$$;

-- Changes a package's settings. p_patch: any of { title, time_limit_minutes, track_best, track }.
create function public.admin_update_package(p_package_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  update app.packages set
    title = case when p_patch ? 'title' then btrim(p_patch ->> 'title') else title end,
    time_limit_minutes = case when p_patch ? 'time_limit_minutes' then (p_patch ->> 'time_limit_minutes')::int else time_limit_minutes end,
    track_best = case when p_patch ? 'track_best' then (p_patch ->> 'track_best')::boolean else track_best end,
    track = case when p_patch ? 'track' then nullif(p_patch ->> 'track', '')::app.track else track end
  where id = p_package_id and deleted_at is null;
  if not found then raise exception 'package_not_found'; end if;
  perform app.audit('package.edit', p_package_id::text, p_patch);
end;
$$;

-- Removes a package from lists; attempts on it keep their questions and results.
create function public.admin_delete_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  update app.packages set deleted_at = now(), status = 'draft' where id = p_package_id and deleted_at is null;
  if not found then raise exception 'package_not_found'; end if;
  perform app.audit('package.delete', p_package_id::text);
end;
$$;

-- How often each option of a question was picked in finished attempts, for spotting questions
-- most students get wrong. Options are counted in print order.
create view public.admin_question_stats
with (security_invoker = on) as
select q.id as question_id, s.answered, s.correct,
       (select coalesce(jsonb_agg(jsonb_build_object('position', o.position, 'picked', coalesce(p.picked, 0))
                                  order by o.position), '[]')
          from app.question_options o
          left join (
            select j.option_order[j.choice + 1] as pos, count(*)::int as picked
              from app.attempt_items j
              join app.attempts aj on aj.id = j.attempt_id and aj.status = 'finished'
             where j.question_id = q.id and j.choice is not null
             group by 1
          ) p on p.pos = o.position
         where o.question_id = q.id) as options
  from app.questions q
  cross join lateral (
    select count(*)::int as answered, (count(*) filter (where i.is_correct))::int as correct
      from app.attempt_items i
      join app.attempts a on a.id = i.attempt_id and a.status = 'finished'
     where i.question_id = q.id and i.graded and i.is_correct is not null  -- answered, not left blank
  ) s
 where q.deleted_at is null and s.answered > 0;

revoke all on public.admin_question_stats from public, anon, authenticated;
grant select on public.admin_question_stats to authenticated;

grant execute on function app.attempt_grace_seconds(), app.attempt_deadline(app.attempts), app.attempt_expired(app.attempts),
  app.package_question_count(uuid) to authenticated;
grant execute on function
  public.start_attempt(uuid, uuid), public.get_attempt(uuid, uuid), public.save_attempt(uuid, uuid, jsonb, uuid[], int),
  public.take_over_attempt(uuid, uuid), public.submit_attempt(uuid, uuid, jsonb), public.abandon_attempt(uuid),
  public.get_attempt_result(uuid), public.admin_packages_from_import(uuid, text, text, text, text, int, int, boolean),
  public.admin_set_package_status(uuid, text), public.admin_update_package(uuid, jsonb), public.admin_delete_package(uuid)
  to authenticated;
