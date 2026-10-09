-- Practice from the question bank, and bookmarks.
--
-- A student can build their own practice set: pick a block, sources, years and subjects (or only
-- their bookmarked questions), how many questions, and an optional timer. The questions are drawn
-- at random from the bank. Only questions in a published practice package the student can see are
-- in the bank, so drilling never reveals a key that an exam-only package keeps hidden.
--
-- These attempts have no package: `package_id` is null and `title` says what was picked. Everything
-- else (timer, one tab at a time, grading) works as for packages.

alter table public.attempts alter column package_id drop not null;
alter table public.attempts add column title text;
alter table public.attempts add constraint attempts_package_or_title check (package_id is not null or title is not null);
grant select (title) on public.attempts to authenticated;

-- Questions the caller may practise: live, in a published practice package of their track.
create or replace function public.bank_question_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct q.id
    from public.questions q
    join public.package_questions pq on pq.question_id = q.id
    join public.packages p on p.id = pq.package_id
   where q.deleted_at is null
     and p.mode = 'practice' and p.status = 'published' and p.deleted_at is null
     and public.track_visible(p.track);
$$;

-- What the bank holds for the caller, for the practice setup page: how many questions per block,
-- source, year and subject, and how many of them are bookmarked.
create or replace function public.bank_options()
returns table (block text, source text, year int, subject text, questions int, bookmarked int)
language sql
stable
security definer
set search_path = ''
as $$
  select q.block, q.source, q.year, q.subject, count(*)::int,
         (count(*) filter (where b.question_id is not null))::int
    from public.questions q
    left join public.bookmarks b on b.question_id = q.id and b.user_id = (select auth.uid())
   where q.id in (select public.bank_question_ids())
   group by q.block, q.source, q.year, q.subject
   order by q.block, q.source nulls last, q.year nulls last, q.subject nulls last;
$$;

-- Starts a practice attempt drawn from the bank, or returns the attempt already running.
-- Empty filter arrays mean "any". Returns { attempt_id, resumed }.
create or replace function public.start_bank_practice(
  p_block text,
  p_sources text[] default '{}',
  p_years int[] default '{}',
  p_subjects text[] default '{}',
  p_bookmarked_only boolean default false,
  p_count int default 20,
  p_time_limit_minutes int default null,
  p_title text default null,
  p_holder uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  running uuid;
  ids uuid[];
  orders jsonb;
  revisions jsonb;
  new_id uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'no_profile'; end if;
  if p_count is null or p_count not between 1 and 200 then raise exception 'bad_count'; end if;
  if p_time_limit_minutes is not null and p_time_limit_minutes not between 1 and 300 then raise exception 'bad_time_limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attempt:' || uid::text, 0));
  perform public.finish_my_expired_attempts();

  select id into running from public.attempts where user_id = uid and status = 'in_progress';
  if running is not null then
    return jsonb_build_object('attempt_id', running, 'resumed', true);
  end if;

  select array_agg(id) into ids from (
    select q.id
      from public.questions q
     where q.id in (select public.bank_question_ids())
       and (p_block is null or q.block = p_block)
       and (cardinality(coalesce(p_sources, '{}')) = 0 or q.source = any(p_sources))
       and (cardinality(coalesce(p_years, '{}')) = 0 or q.year = any(p_years))
       and (cardinality(coalesce(p_subjects, '{}')) = 0 or q.subject = any(p_subjects))
       and (not coalesce(p_bookmarked_only, false)
            or exists (select 1 from public.bookmarks b where b.user_id = uid and b.question_id = q.id))
     order by random()
     limit p_count
  ) picked;
  if ids is null then raise exception 'no_questions_match'; end if;

  select coalesce(jsonb_object_agg(q.id::text,
           (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(q.options) - 1) i))
           filter (where q.type = 'single_choice'), '{}'),
         jsonb_object_agg(q.id::text, q.revision)
    into orders, revisions
    from public.questions q where q.id = any(ids);

  insert into public.attempts (user_id, package_id, title, mode, question_ids, option_orders, question_revisions,
                               time_limit_minutes, holder)
  values (uid, null, left(coalesce(nullif(btrim(p_title), ''), 'Practice'), 160), 'practice', ids, orders, revisions,
          p_time_limit_minutes, p_holder)
  returning id into new_id;

  return jsonb_build_object('attempt_id', new_id, 'resumed', false);
end;
$$;

-- The caller's bookmarks with the question, its key and explanation, newest first. Only bank
-- questions: a bookmark on a question the student can't practise shows nothing.
create or replace function public.my_bookmarks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'block', q.block,
    'source', q.source,
    'year', q.year,
    'subject', q.subject,
    'type', q.type,
    'stem', q.stem,
    'stem_image', q.stem_image,
    'stem_image_alt', q.stem_image_alt,
    'options', q.options,
    'correct', q.correct_index,
    'accepted_answers', to_jsonb(q.accepted_answers),
    'explanation', q.explanation,
    'bookmarked_at', b.created_at
  ) order by b.created_at desc), '[]')
    from public.bookmarks b
    join public.questions q on q.id = b.question_id
   where b.user_id = (select auth.uid())
     and q.id in (select public.bank_question_ids());
$$;

-- Starting a package now also checks the package is for the student's track.
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
   where id = p_package_id and status = 'published' and deleted_at is null and public.track_visible(track);
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

-- get_attempt and get_attempt_result, now with the title of a bank practice (no package).
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
    'title', coalesce(a.title, pkg.title),
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
    'title', coalesce(a.title, pkg.title),
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

revoke execute on function public.bank_question_ids(), public.bank_options(),
  public.start_bank_practice(text, text[], int[], text[], boolean, int, int, text, uuid), public.my_bookmarks()
  from public, anon, authenticated;
grant execute on function public.bank_options(),
  public.start_bank_practice(text, text[], int[], text[], boolean, int, int, text, uuid), public.my_bookmarks()
  to authenticated;
