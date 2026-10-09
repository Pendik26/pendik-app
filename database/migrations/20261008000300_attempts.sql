-- Taking a package: attempts and the functions that run them.
--
-- Rules the functions enforce (the browser is never trusted with them):
-- - One attempt in progress per student, across all packages.
-- - An attempt freezes its question list, option order, time limit and question revisions when it
--   starts, so editing a package later never rewrites someone's attempt.
-- - The deadline is started_at + time_limit, on the server's clock. Answers saved more than
--   GRACE seconds after it are refused; a late submit is graded on the answers saved before it.
--   An expired attempt is graded the next time its owner touches it (no scheduled job needed).
-- - One browser tab holds an attempt at a time (`holder`, a random id per tab). Another tab can
--   take it over, but a tab that isn't the holder can't save or submit.
-- - Exam attempts never send answer keys before they're finished. Practice attempts send them
--   with the questions, for instant feedback.
-- - Short answers are graded by the student's own mark in practice, and not graded in exams
--   (a self-mark can't count toward a best score).
-- - A finished attempt can't be changed. Grading happens only in finish_attempt().

create table public.attempts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  package_id         uuid not null references public.packages(id),
  mode               text not null check (mode in ('exam', 'practice')),
  question_ids       uuid[] not null,
  -- { "<question id>": [db index shown at position 0, at position 1, ...] }
  option_orders      jsonb not null default '{}',
  question_revisions jsonb not null default '{}',
  time_limit_minutes int,
  -- { "<question id>": { "choice": <display position> } | { "text": "...", "self_mark": true|false } }
  answers            jsonb not null default '{}',
  flagged            uuid[] not null default '{}',
  tab_leaves         int not null default 0,
  holder             uuid,
  status             text not null default 'in_progress' check (status in ('in_progress', 'finished', 'abandoned')),
  -- Set by finish_attempt only.
  score              numeric(5, 1),
  correct_count      int,
  wrong_count        int,
  blank_count        int,
  result             jsonb,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz
);

create index attempts_user on public.attempts (user_id, started_at desc);
create unique index attempts_one_running on public.attempts (user_id) where status = 'in_progress';

alter table public.attempts enable row level security;
revoke all on public.attempts from anon, authenticated;
create policy attempts_read on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Reading only; every change goes through the functions below.
grant select (id, user_id, package_id, mode, status, score, correct_count, wrong_count, blank_count,
  tab_leaves, time_limit_minutes, started_at, finished_at) on public.attempts to authenticated;

-- Best finished score per student per package, for packages that track it.
create view public.best_scores
with (security_invoker = on) as
select distinct on (a.user_id, a.package_id)
  a.user_id, a.package_id, a.score, a.id as attempt_id, a.finished_at
from public.attempts a
join public.packages p on p.id = a.package_id
where a.status = 'finished' and p.track_best and a.score is not null
order by a.user_id, a.package_id, a.score desc, a.finished_at;

revoke all on public.best_scores from anon, authenticated;
grant select on public.best_scores to authenticated;

-- Seconds past the deadline a save is still accepted (a debounced save already on its way).
create or replace function public.attempt_grace_seconds()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

create or replace function public.attempt_deadline(a public.attempts)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when a.time_limit_minutes is null then null
              else a.started_at + make_interval(mins => a.time_limit_minutes) end;
$$;

create or replace function public.attempt_expired(a public.attempts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.attempt_deadline(a) is not null
     and now() > public.attempt_deadline(a) + make_interval(secs => public.attempt_grace_seconds());
$$;

-- Grades an in-progress attempt and freezes it. Internal: callers check ownership first.
create or replace function public.finish_attempt(p_attempt_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempts;
  q record;
  ans jsonb;
  pos int;
  chosen int;
  correct_pos int;
  is_correct boolean;
  graded boolean;
  n_correct int := 0;
  n_wrong int := 0;
  n_blank int := 0;
  items jsonb := '[]';
begin
  select * into a from public.attempts where id = p_attempt_id for update;
  if a.status <> 'in_progress' then return; end if;

  -- Late: grade what was saved before the deadline, not what the browser sends now.
  if p_answers is not null and not public.attempt_expired(a) then
    a.answers := p_answers;
  end if;

  for q in
    select qs.*, ord.n
      from unnest(a.question_ids) with ordinality as ord(id, n)
      join public.questions qs on qs.id = ord.id
     order by ord.n
  loop
    ans := a.answers -> (q.id::text);
    is_correct := null;
    graded := true;
    chosen := null;
    correct_pos := null;

    if q.type = 'single_choice' then
      correct_pos := (
        select (o.n - 1)::int
          from jsonb_array_elements_text(coalesce(a.option_orders -> (q.id::text),
                 (select jsonb_agg(i) from generate_series(0, jsonb_array_length(q.options) - 1) i))) with ordinality o(v, n)
         where o.v::int = q.correct_index
      );
      pos := case when jsonb_typeof(ans -> 'choice') = 'number' then (ans ->> 'choice')::int end;
      if pos is not null and pos between 0 and jsonb_array_length(q.options) - 1 then
        chosen := pos;
        is_correct := (pos = correct_pos);
      end if;
    elsif a.mode = 'exam' then
      graded := false;
    elsif jsonb_typeof(ans -> 'self_mark') = 'boolean' then
      is_correct := (ans ->> 'self_mark')::boolean;
    end if;

    if graded then
      if is_correct is null then n_blank := n_blank + 1;
      elsif is_correct then n_correct := n_correct + 1;
      else n_wrong := n_wrong + 1; end if;
    end if;

    items := items || jsonb_build_object(
      'question_id', q.id,
      'chosen', chosen,
      'text', ans ->> 'text',
      'correct', correct_pos,
      'is_correct', is_correct,
      'graded', graded
    );
  end loop;

  update public.attempts set
    answers = a.answers,
    status = 'finished',
    holder = null,
    correct_count = n_correct,
    wrong_count = n_wrong,
    blank_count = n_blank,
    score = case when n_correct + n_wrong + n_blank = 0 then null
                 else round(100.0 * n_correct / (n_correct + n_wrong + n_blank), 1) end,
    result = items,
    finished_at = now()
  where id = a.id;
end;
$$;

-- Questions as the student sees them in this attempt: options in the attempt's order, and the keys
-- only when `with_keys`.
create or replace function public.attempt_questions(a public.attempts, with_keys boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'type', q.type,
      'subject', q.subject,
      'stem', q.stem,
      'stem_image', q.stem_image,
      'stem_image_alt', q.stem_image_alt,
      'revision', q.revision,
      'options', (
        select jsonb_agg(q.options -> (o.v::int) order by o.n)
          from jsonb_array_elements_text(coalesce(a.option_orders -> (q.id::text),
                 (select jsonb_agg(i) from generate_series(0, jsonb_array_length(q.options) - 1) i))) with ordinality o(v, n)
         where q.type = 'single_choice'
      )
    ) || case when with_keys then jsonb_build_object(
      'correct', (
        select (o.n - 1)::int
          from jsonb_array_elements_text(coalesce(a.option_orders -> (q.id::text),
                 (select jsonb_agg(i) from generate_series(0, jsonb_array_length(q.options) - 1) i))) with ordinality o(v, n)
         where q.type = 'single_choice' and o.v::int = q.correct_index
      ),
      'accepted_answers', to_jsonb(q.accepted_answers),
      'explanation', q.explanation
    ) else '{}'::jsonb end
    order by ord.n
  ), '[]')
  from unnest(a.question_ids) with ordinality as ord(id, n)
  join public.questions q on q.id = ord.id;
$$;

-- Finishes the caller's attempts that ran out of time (lazily, whenever they come back).
create or replace function public.finish_my_expired_attempts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.attempts;
begin
  for r in select * from public.attempts where user_id = auth.uid() and status = 'in_progress' loop
    if public.attempt_expired(r) then perform public.finish_attempt(r.id, null); end if;
  end loop;
end;
$$;

-- Starts an attempt on a published package, or returns the attempt already running.
-- Returns { attempt_id, resumed }.
create or replace function public.start_attempt(p_package_id uuid, p_holder uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pkg public.packages;
  running uuid;
  ids uuid[];
  orders jsonb;
  revisions jsonb;
  new_id uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'no_profile'; end if;
  -- One student, one start at a time: two clicks can't create two attempts.
  perform pg_advisory_xact_lock(hashtextextended('attempt:' || uid::text, 0));
  perform public.finish_my_expired_attempts();

  select id into running from public.attempts where user_id = uid and status = 'in_progress';
  if running is not null then
    return jsonb_build_object('attempt_id', running, 'resumed', true);
  end if;

  select * into pkg from public.packages
   where id = p_package_id and status = 'published' and deleted_at is null;
  if pkg.id is null then raise exception 'package_not_found'; end if;

  -- Question order is shuffled for each attempt, and so is each question's option order.
  select array_agg(q.id order by random()) into ids
    from public.package_questions pq
    join public.questions q on q.id = pq.question_id and q.deleted_at is null
   where pq.package_id = pkg.id;
  if ids is null then raise exception 'package_empty'; end if;

  select coalesce(jsonb_object_agg(q.id::text,
           (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(q.options) - 1) i))
           filter (where q.type = 'single_choice'), '{}'),
         jsonb_object_agg(q.id::text, q.revision)
    into orders, revisions
    from public.questions q where q.id = any(ids);

  insert into public.attempts (user_id, package_id, mode, question_ids, option_orders, question_revisions,
                               time_limit_minutes, holder)
  values (uid, pkg.id, pkg.mode, ids, orders, revisions, pkg.time_limit_minutes, p_holder)
  returning id into new_id;

  return jsonb_build_object('attempt_id', new_id, 'resumed', false);
end;
$$;

-- Everything a tab needs to show an in-progress attempt. A finished attempt returns only its status.
-- holder_state: 'you' (this tab holds it), 'other' (another tab does), 'free'.
create or replace function public.get_attempt(p_attempt_id uuid, p_holder uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempts;
  pkg public.packages;
  holder_state text;
begin
  select * into a from public.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null then raise exception 'attempt_not_found'; end if;

  if a.status = 'in_progress' and public.attempt_expired(a) then
    perform public.finish_attempt(a.id, null);
    select * into a from public.attempts where id = a.id;
  end if;
  if a.status <> 'in_progress' then
    return jsonb_build_object('id', a.id, 'status', a.status);
  end if;

  if a.holder is null and p_holder is not null then
    update public.attempts set holder = p_holder where id = a.id;
    a.holder := p_holder;
  end if;
  holder_state := case when a.holder is null then 'free' when a.holder = p_holder then 'you' else 'other' end;

  select * into pkg from public.packages where id = a.package_id;
  return jsonb_build_object(
    'id', a.id,
    'status', a.status,
    'mode', a.mode,
    'package_id', a.package_id,
    'title', pkg.title,
    'holder_state', holder_state,
    'seconds_left', case when a.time_limit_minutes is null then null
                         else greatest(0, floor(extract(epoch from public.attempt_deadline(a) - now())))::int end,
    'answers', a.answers,
    'flagged', to_jsonb(a.flagged),
    'tab_leaves', a.tab_leaves,
    -- Only the holding tab gets the questions; another tab shows "continue here" instead.
    'questions', case when holder_state = 'other' then null
                      else public.attempt_questions(a, a.mode = 'practice') end
  );
end;
$$;

create or replace function public.save_attempt(
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
  a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null or a.status <> 'in_progress' then raise exception 'attempt_not_running'; end if;
  if public.attempt_expired(a) then raise exception 'time_up'; end if;
  if a.holder is not null and a.holder is distinct from p_holder then raise exception 'held_elsewhere'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  update public.attempts set
    answers = p_answers,
    flagged = coalesce(p_flagged, '{}'),
    holder = coalesce(holder, p_holder),
    -- Leaving the tab only counts up.
    tab_leaves = greatest(tab_leaves, coalesce(p_tab_leaves, 0))
  where id = a.id;
end;
$$;

-- "Continue here": always allowed for the attempt's owner, so a dead laptop can't lock them out.
create or replace function public.take_over_attempt(p_attempt_id uuid, p_holder uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_holder is null then raise exception 'holder_required'; end if;
  update public.attempts set holder = p_holder
   where id = p_attempt_id and user_id = auth.uid() and status = 'in_progress';
end;
$$;

create or replace function public.submit_attempt(p_attempt_id uuid, p_holder uuid, p_answers jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a.id is null then raise exception 'attempt_not_found'; end if;
  if a.status <> 'in_progress' then return; end if;
  if a.holder is not null and a.holder is distinct from p_holder then raise exception 'held_elsewhere'; end if;
  perform public.finish_attempt(a.id, p_answers);
end;
$$;

-- Practice attempts can be thrown away; exams can only be submitted.
create or replace function public.abandon_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attempts set status = 'abandoned', holder = null, finished_at = now()
   where id = p_attempt_id and user_id = auth.uid() and status = 'in_progress' and mode = 'practice';
  if not found then raise exception 'cannot_abandon'; end if;
end;
$$;

-- A finished attempt with its questions and keys, for the result page (owner or admin).
create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempts;
  pkg public.packages;
begin
  select * into a from public.attempts
   where id = p_attempt_id and (user_id = auth.uid() or public.is_admin());
  if a.id is null then raise exception 'attempt_not_found'; end if;
  if a.status <> 'finished' then raise exception 'attempt_not_finished'; end if;
  select * into pkg from public.packages where id = a.package_id;
  return jsonb_build_object(
    'id', a.id,
    'mode', a.mode,
    'package_id', a.package_id,
    'title', pkg.title,
    'score', a.score,
    'correct_count', a.correct_count,
    'wrong_count', a.wrong_count,
    'blank_count', a.blank_count,
    'tab_leaves', a.tab_leaves,
    'started_at', a.started_at,
    'finished_at', a.finished_at,
    'items', a.result,
    'question_revisions', a.question_revisions,
    'questions', public.attempt_questions(a, true)
  );
end;
$$;

revoke execute on function
  public.attempt_grace_seconds(), public.attempt_deadline(public.attempts), public.attempt_expired(public.attempts),
  public.finish_attempt(uuid, jsonb), public.attempt_questions(public.attempts, boolean),
  public.finish_my_expired_attempts(), public.start_attempt(uuid, uuid), public.get_attempt(uuid, uuid),
  public.save_attempt(uuid, uuid, jsonb, uuid[], int), public.take_over_attempt(uuid, uuid),
  public.submit_attempt(uuid, uuid, jsonb), public.abandon_attempt(uuid), public.get_attempt_result(uuid)
  from public, anon, authenticated;
grant execute on function
  public.start_attempt(uuid, uuid), public.get_attempt(uuid, uuid), public.save_attempt(uuid, uuid, jsonb, uuid[], int),
  public.take_over_attempt(uuid, uuid), public.submit_attempt(uuid, uuid, jsonb), public.abandon_attempt(uuid),
  public.get_attempt_result(uuid)
  to authenticated;
