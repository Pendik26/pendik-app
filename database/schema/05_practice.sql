-- Practice from the question bank, and the student's bookmarked questions.
--
-- A student can build their own practice set: pick a block, sources, years and subjects (or only
-- their bookmarked questions), how many questions, and an optional timer. The questions are drawn
-- at random from the bank. Only questions in a published practice package the student can see are
-- in the bank, so drilling never reveals a key that an exam-only package keeps hidden.

create table app.bookmarks (
  user_id     uuid not null references app.accounts(id) on delete cascade,
  question_id uuid not null references app.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index bookmarks_question on app.bookmarks (question_id);

alter table app.bookmarks enable row level security;
create policy bookmarks_own_read on app.bookmarks for select to authenticated using (user_id = (select auth.uid()));
create policy bookmarks_own_add on app.bookmarks for insert to authenticated with check (user_id = (select auth.uid()));
create policy bookmarks_own_remove on app.bookmarks for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on app.bookmarks to authenticated;

-- Questions the caller may practise: live, in a published practice package of their track.
create function app.bank_question_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct q.id
    from app.questions q
    join app.package_questions pq on pq.question_id = q.id
    join app.packages p on p.id = pq.package_id
   where q.deleted_at is null
     and p.mode = 'practice' and p.status = 'published' and p.deleted_at is null
     and app.track_visible(p.track);
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- The caller's bookmarks (question ids). Students add and remove their own.
create view public.bookmarks
with (security_invoker = on) as
select user_id, question_id, created_at from app.bookmarks;

revoke all on public.bookmarks from public, anon, authenticated;
grant select, insert, delete on public.bookmarks to authenticated;

-- What the bank holds for the caller, for the practice setup page: how many questions per block,
-- source, year and subject, and how many of them are bookmarked.
create function public.bank_options()
returns table (block text, source text, year int, subject text, questions int, bookmarked int)
language sql
stable
security definer
set search_path = ''
as $$
  select q.block, q.source, q.year, q.subject, count(*)::int,
         (count(*) filter (where b.question_id is not null))::int
    from app.questions q
    left join app.bookmarks b on b.question_id = q.id and b.user_id = (select auth.uid())
   where q.id in (select app.bank_question_ids())
   group by q.block, q.source, q.year, q.subject
   order by q.block, q.source nulls last, q.year nulls last, q.subject nulls last;
$$;

-- Starts a practice attempt drawn from the bank, or returns the attempt already running.
-- Empty filter arrays mean "any". Returns { attempt_id, resumed }.
create function public.start_bank_practice(
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
begin
  if p_count is null or p_count not between 1 and 200 then raise exception 'bad_count'; end if;
  if p_time_limit_minutes is not null and p_time_limit_minutes not between 1 and 300 then raise exception 'bad_time_limit'; end if;
  running := app.begin_start();
  if running is not null then return jsonb_build_object('attempt_id', running, 'resumed', true); end if;

  select array_agg(id) into ids from (
    select q.id
      from app.questions q
     where q.id in (select app.bank_question_ids())
       and (p_block is null or q.block = p_block)
       and (cardinality(coalesce(p_sources, '{}')) = 0 or q.source = any(p_sources))
       and (cardinality(coalesce(p_years, '{}')) = 0 or q.year = any(p_years))
       and (cardinality(coalesce(p_subjects, '{}')) = 0 or q.subject = any(p_subjects))
       and (not coalesce(p_bookmarked_only, false)
            or exists (select 1 from app.bookmarks b where b.user_id = uid and b.question_id = q.id))
     order by random()
     limit p_count
  ) picked;
  if ids is null then raise exception 'no_questions_match'; end if;

  return jsonb_build_object(
    'attempt_id', app.create_attempt(uid, null, left(coalesce(nullif(btrim(p_title), ''), 'Practice'), 160), 'practice',
                                     p_time_limit_minutes, p_holder, ids),
    'resumed', false);
end;
$$;

-- The caller's bookmarks with the question, its key and explanation, newest first. Only bank
-- questions: a bookmark on a question the student can't practise shows nothing.
create function public.my_bookmarks()
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
    'type', q.kind,
    'stem', q.stem,
    'stem_image', q.stem_image,
    'stem_image_alt', q.stem_image_alt,
    'options', app.question_options_json(q.id),
    'correct', app.question_correct_index(q.id),
    'accepted_answers', to_jsonb(app.question_accepted(q.id)),
    'explanation', q.explanation,
    'bookmarked_at', b.created_at
  ) order by b.created_at desc), '[]')
    from app.bookmarks b
    join app.questions q on q.id = b.question_id
   where b.user_id = (select auth.uid())
     and q.id in (select app.bank_question_ids());
$$;

grant execute on function public.bank_options(),
  public.start_bank_practice(text, text[], int[], text[], boolean, int, int, text, uuid), public.my_bookmarks()
  to authenticated;
