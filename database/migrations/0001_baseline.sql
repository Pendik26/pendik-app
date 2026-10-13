-- 0001 baseline: the whole schema as of the 2026-10 rewrite (database/schema/00–11, in order).
-- Later changes go in new numbered files; never edit this one after it has been applied.

-- =============================================================================================
-- 00_foundation.sql

-- The foundation: two schemas, shared helpers, and the audit log.
--
-- - `app` holds every table. It is not one of the schemas the Data API serves, so nothing in it
--   is reachable from a browser unless a view or function in `public` hands it out.
-- - `public` is the API: views (running as the caller, so row level security still applies) and
--   functions. A new table is private until someone deliberately puts a view or function here.
-- Row level security stays on for every table in `app` as a second wall.

create schema app;
revoke all on schema app from public;
-- Views in `public` run as the caller, who needs to see the tables underneath; the tables' grants
-- and policies decide what. anon gets nothing: every page needs a sign-in.
grant usage on schema app to authenticated, service_role;
-- Nothing new is open by default (Supabase's own defaults grant every new table and function in
-- `public` to anon and authenticated): each view and function grants exactly who may use it.
-- (Postgres lets every role run every new function; that default can only be removed globally.)
alter default privileges revoke execute on functions from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke execute on functions from anon, authenticated;
  end if;
end $$;

-- Today's date on the server's clock, in UTC. Every "per day" rule uses this, never the browser's.
create function app.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'utc')::date;
$$;

create function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- What admins did: role changes, imports, publishing, roster edits, account actions. Written by
-- the functions that do those things (and by the admin-accounts Edge Function); read on Admin.
create table app.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,                 -- the admin's account, or null for the system
  action     text not null check (action ~ '^[a-z_.]+$'),
  target     text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_created on app.audit_log (created_at desc);

alter table app.audit_log enable row level security;

create function app.audit(p_action text, p_target text default null, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.audit_log (actor, action, target, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'));
$$;

grant execute on function app.today(), app.touch_updated_at() to authenticated, service_role;

-- =============================================================================================
-- 01_people.sql

-- People: cohorts, the class roster (students), and the sign-in accounts of activated students.
--
-- Only students on the roster can have an account. An admin activates them (Edge Function
-- `admin-accounts`), which creates the Supabase Auth user and its account row. Students sign in
-- with their student id (NIM) as `<nim>@pendik26.internal`, and can link Google afterwards.
--
-- A student's name, cohort, class (track) and class group live on `students` only; an account
-- is the sign-in, the role and the student's own settings. A student with no track sees both
-- classes' material.

create type app.track as enum ('IUP', 'REGULER');
create type app.role as enum ('student', 'admin');

-- A year's intake, e.g. '2026'. Leaderboards and class averages are per cohort.
create table app.cohorts (
  id         text primary key check (id ~ '^[0-9A-Za-z-]{1,10}$'),
  created_at timestamptz not null default now()
);

create table app.students (
  nim         text primary key check (nim ~ '^[0-9A-Za-z]{3,30}$'),
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  cohort      text not null references app.cohorts(id) on update cascade,
  track       app.track,
  class_group text check (length(class_group) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index students_cohort on app.students (cohort);

create trigger students_touch before update on app.students
  for each row execute function app.touch_updated_at();

create table app.accounts (
  id                   uuid primary key references auth.users(id) on delete cascade,
  -- A roster row with an account can't be removed: lock the account instead.
  nim                  text not null unique references app.students(nim) on update cascade,
  role                 app.role not null default 'student',
  must_change_password boolean not null default true,
  -- Settings the student edits from the Account page.
  display_name         text check (length(display_name) between 1 and 40),
  leaderboard_joined   boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger accounts_touch before update on app.accounts
  for each row execute function app.touch_updated_at();

-- security definer so policies can call it without recursing into accounts' own policies.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.accounts where id = (select auth.uid()) and role = 'admin');
$$;

-- The caller's account and student row, or nothing.
create function app.me()
returns table (id uuid, nim text, cohort text, track app.track)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.nim, s.cohort, s.track
    from app.accounts a join app.students s on s.nim = a.nim
   where a.id = (select auth.uid());
$$;

-- Whether the caller may see material for this track (null means both classes).
create function app.track_visible(p_track app.track)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_track is null
      or (select m.track from app.me() m) is null
      or p_track = (select m.track from app.me() m)
      or public.is_admin();
$$;

alter table app.cohorts enable row level security;
alter table app.students enable row level security;
alter table app.accounts enable row level security;

create policy cohorts_read on app.cohorts for select to authenticated using (true);
create policy cohorts_admin on app.cohorts for insert to authenticated with check ((select public.is_admin()));

-- Students read their own row; admins read and edit the roster.
create policy students_read on app.students for select to authenticated
  using (nim = (select m.nim from app.me() m) or (select public.is_admin()));
create policy students_insert on app.students for insert to authenticated with check ((select public.is_admin()));
create policy students_update on app.students for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy students_delete on app.students for delete to authenticated using ((select public.is_admin()));

-- Students read their own account. Every change goes through functions or the service role.
create policy accounts_read on app.accounts for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

grant select, insert on app.cohorts to authenticated;
grant select, insert, update, delete on app.students to authenticated;
grant select on app.accounts to authenticated;
grant select, insert, update, delete on app.cohorts, app.students, app.accounts to service_role;

-- Roster edits are audited, whoever makes them.
create function app.students_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.audit('student.remove', old.nim);
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform app.audit('student.add', new.nim, jsonb_build_object('cohort', new.cohort, 'track', new.track));
  elsif (new.full_name, new.cohort, new.track, new.class_group) is distinct from (old.full_name, old.cohort, old.track, old.class_group) then
    perform app.audit('student.change', new.nim,
      jsonb_build_object('cohort', new.cohort, 'track', new.track, 'class_group', new.class_group));
  end if;
  return new;
end;
$$;

create trigger students_audit after insert or update or delete on app.students
  for each row execute function app.students_audit();

-- ---------------------------------------------------------------------------------------------
-- API

-- The signed-in student's account: what the app loads at sign-in.
create view public.my_account
with (security_invoker = on) as
select a.id, a.nim as student_id, s.full_name, s.class_group, s.cohort, s.track::text as track, a.role::text as role,
       a.must_change_password, a.display_name, a.leaderboard_joined
  from app.accounts a
  join app.students s on s.nim = a.nim
 where a.id = (select auth.uid());

-- The roster, for Admin → Students (admins only, by the policies) and the admin-accounts function.
create view public.students
with (security_invoker = on) as
select nim as student_id, full_name, class_group, cohort, track::text as track, created_at
  from app.students;

-- Accounts, for the admin-accounts Edge Function (service role) only.
create view public.accounts
with (security_invoker = on) as
select id, nim as student_id, role, must_change_password, created_at
  from app.accounts;

-- Writing through the view: the cohort is created on first use.
create function app.students_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then raise exception 'admins_only'; end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from app.accounts where nim = old.student_id) then raise exception 'student_has_account'; end if;
    delete from app.students where nim = old.student_id;
    return old;
  end if;
  insert into app.cohorts (id) values (coalesce(nullif(btrim(new.cohort), ''), to_char(app.today(), 'YYYY')))
  on conflict do nothing;
  if tg_op = 'INSERT' then
    insert into app.students (nim, full_name, class_group, cohort, track)
    values (btrim(new.student_id), btrim(new.full_name), nullif(btrim(new.class_group), ''),
            coalesce(nullif(btrim(new.cohort), ''), to_char(app.today(), 'YYYY')), nullif(new.track, '')::app.track)
    on conflict (nim) do update set
      full_name = excluded.full_name, class_group = excluded.class_group, cohort = excluded.cohort,
      track = coalesce(excluded.track, app.students.track);
  else
    update app.students set
      full_name = btrim(new.full_name),
      class_group = nullif(btrim(new.class_group), ''),
      cohort = coalesce(nullif(btrim(new.cohort), ''), cohort),
      track = nullif(new.track, '')::app.track
    where nim = old.student_id;
  end if;
  return new;
end;
$$;

create trigger students_write instead of insert or update or delete on public.students
  for each row execute function app.students_write();

-- The student's own settings. Name, student id, class and role are not theirs to change.
create function public.update_my_settings(p_display_name text default null, p_leaderboard_joined boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update app.accounts set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    leaderboard_joined = coalesce(p_leaderboard_joined, leaderboard_joined)
  where id = auth.uid();
end;
$$;

-- Called after the student has set a new password with supabase.auth.updateUser().
create function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update app.accounts set must_change_password = false where id = auth.uid();
$$;

revoke all on public.my_account, public.students, public.accounts from public, anon, authenticated;
grant select on public.my_account to authenticated;
grant select, insert, update on public.accounts to service_role;
grant select, insert, update, delete on public.students to authenticated, service_role;
grant execute on function public.is_admin(), public.update_my_settings(text, boolean), public.password_changed()
  to authenticated;
grant execute on function public.is_admin() to service_role;
grant execute on function app.me(), app.track_visible(app.track) to authenticated, service_role;

-- =============================================================================================
-- 02_curriculum.sql

-- The curriculum: the blocks of the course (1.1, 1.2, …). Questions, packages, readiness and the
-- study catalog point at a real block instead of a loose string. Blocks are added by the content
-- catalog (`npm run db:content`) and by question imports; a block that is in use can't be removed.

create table app.blocks (
  id         text primary key check (id ~ '^[0-9]+\.[0-9]+$'),
  name       text check (length(name) <= 120),
  created_at timestamptz not null default now()
);

alter table app.blocks enable row level security;
create policy blocks_read on app.blocks for select to authenticated using (true);
grant select on app.blocks to authenticated;
grant select, insert, update on app.blocks to service_role;

-- Makes sure a block exists (imports and the catalog use it before pointing at one).
create function app.ensure_block(p_block text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_block is null then return null; end if;
  if p_block !~ '^[0-9]+\.[0-9]+$' then raise exception 'bad_block'; end if;
  insert into app.blocks (id) values (p_block) on conflict do nothing;
  return p_block;
end;
$$;

create view public.blocks
with (security_invoker = on) as
select id, name from app.blocks;

revoke all on public.blocks from public, anon, authenticated;
grant select on public.blocks to authenticated;

-- =============================================================================================
-- 03_questions.sql

-- The question bank: past-paper questions, their options and accepted answers, and the Markdown
-- imports they came from.
--
-- Students never read these tables. They get question content only through the attempt and
-- practice functions (04_exams.sql, 05_practice.sql), which leave the keys out of an exam until
-- it's submitted. Admins read them through the admin_* views and change them through functions.
--
-- Images live in the repo under public/question-images/; `stem_image` and an option's `image`
-- hold that path (e.g. "question-images/1.1/costraver-12.webp").

create type app.question_kind as enum ('single_choice', 'short_answer');
create type app.publish_status as enum ('draft', 'published');

-- The Markdown file each import came from. It contains the answer keys: admin only.
create table app.imports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 200),
  source_text text not null,
  created_by  uuid references app.accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index imports_created_by on app.imports (created_by);

create table app.questions (
  id              uuid primary key default gen_random_uuid(),
  block           text not null references app.blocks(id),
  source          text check (length(source) <= 60),   -- where it comes from, e.g. 'ub', 'costraver'
  year            int check (year between 2000 and 2100),
  subject         text check (length(subject) <= 80),
  kind            app.question_kind not null,
  stem            text not null check (length(btrim(stem)) > 0),
  stem_image      text,
  stem_image_alt  text,
  explanation     text,
  -- Goes up by one whenever the content changes, so a result can say "this question has changed
  -- since you answered it". Set by admin_update_question().
  revision        int not null default 1,
  status          app.publish_status not null default 'draft',
  import_id       uuid references app.imports(id) on delete set null,
  import_position int,
  created_by      uuid references app.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index questions_import on app.questions (import_id, import_position);
create index questions_block on app.questions (block, source, year, subject) where deleted_at is null;
create index questions_created_by on app.questions (created_by);

create trigger questions_touch before update on app.questions
  for each row execute function app.touch_updated_at();

-- A single-choice question's options, in the order the paper printed them (0 first). Exactly one
-- is correct (checked by app.check_question()).
create table app.question_options (
  question_id uuid not null references app.questions(id) on delete cascade,
  position    int not null check (position between 0 and 7),
  text        text not null default '',
  image       text,
  is_correct  boolean not null default false,
  primary key (question_id, position)
);

-- A short-answer question's accepted answers; position 0 is the main answer.
create table app.question_answers (
  question_id uuid not null references app.questions(id) on delete cascade,
  position    int not null check (position >= 0),
  answer      text not null check (length(btrim(answer)) > 0),
  primary key (question_id, position)
);

-- A question's content as one JSON value: its options (in print order), the correct one, the
-- accepted answers. Used by the attempt functions and the admin views.
create function app.question_options_json(p_question_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('text', o.text, 'image', o.image) order by o.position)
    from app.question_options o where o.question_id = p_question_id;
$$;

create function app.question_correct_index(p_question_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select o.position from app.question_options o where o.question_id = p_question_id and o.is_correct;
$$;

create function app.question_accepted(p_question_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(a.answer order by a.position) from app.question_answers a where a.question_id = p_question_id;
$$;

-- Writes a question's options or answers from the import/edit JSON shape and checks the result:
-- single choice has 2 to 8 options with exactly one correct, short answer at least one answer.
create function app.set_question_content(p_question_id uuid, p_options jsonb, p_correct_index int, p_accepted text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  k app.question_kind;
  n int;
begin
  select kind into k from app.questions where id = p_question_id;
  delete from app.question_options where question_id = p_question_id;
  delete from app.question_answers where question_id = p_question_id;
  if k = 'single_choice' then
    if jsonb_typeof(p_options) <> 'array' then raise exception 'bad_options'; end if;
    n := jsonb_array_length(p_options);
    if n not between 2 and 8 then raise exception 'bad_options'; end if;
    if p_correct_index is null or p_correct_index not between 0 and n - 1 then raise exception 'bad_correct_index'; end if;
    insert into app.question_options (question_id, position, text, image, is_correct)
    select p_question_id, (o.n - 1)::int, coalesce(o.v ->> 'text', ''), nullif(o.v ->> 'image', ''), (o.n - 1) = p_correct_index
      from jsonb_array_elements(p_options) with ordinality o(v, n);
  else
    if p_accepted is null or cardinality(p_accepted) = 0 then raise exception 'bad_accepted_answers'; end if;
    insert into app.question_answers (question_id, position, answer)
    select p_question_id, (a.n - 1)::int, btrim(a.v)
      from unnest(p_accepted) with ordinality a(v, n)
     where btrim(a.v) <> '';
    if not found then raise exception 'bad_accepted_answers'; end if;
  end if;
end;
$$;

alter table app.imports enable row level security;
alter table app.questions enable row level security;
alter table app.question_options enable row level security;
alter table app.question_answers enable row level security;

create policy imports_admin on app.imports for select to authenticated using ((select public.is_admin()));
create policy questions_admin on app.questions for select to authenticated using ((select public.is_admin()));
create policy question_options_admin on app.question_options for select to authenticated using ((select public.is_admin()));
create policy question_answers_admin on app.question_answers for select to authenticated using ((select public.is_admin()));

grant select on app.imports, app.questions, app.question_options, app.question_answers to authenticated;

-- ---------------------------------------------------------------------------------------------
-- API (admins)

-- Changes a question's content. The revision goes up when anything a student sees changes.
-- p_patch: any of { subject, stem, stem_image, stem_image_alt, options, correct_index,
-- accepted_answers, explanation }.
create function public.admin_update_question(p_question_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q app.questions;
  before jsonb;
  after jsonb;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  select * into q from app.questions where id = p_question_id and deleted_at is null for update;
  if q.id is null then raise exception 'question_not_found'; end if;
  before := jsonb_build_array(q.stem, q.stem_image, q.stem_image_alt, q.explanation, app.question_options_json(q.id),
                              app.question_correct_index(q.id), app.question_accepted(q.id));

  update app.questions set
    subject = case when p_patch ? 'subject' then nullif(btrim(p_patch ->> 'subject'), '') else subject end,
    stem = case when p_patch ? 'stem' then p_patch ->> 'stem' else stem end,
    stem_image = case when p_patch ? 'stem_image' then nullif(p_patch ->> 'stem_image', '') else stem_image end,
    stem_image_alt = case when p_patch ? 'stem_image_alt' then nullif(p_patch ->> 'stem_image_alt', '') else stem_image_alt end,
    explanation = case when p_patch ? 'explanation' then nullif(p_patch ->> 'explanation', '') else explanation end
  where id = q.id;

  if p_patch ? 'options' or p_patch ? 'correct_index' or p_patch ? 'accepted_answers' then
    perform app.set_question_content(
      q.id,
      case when p_patch ? 'options' then p_patch -> 'options' else app.question_options_json(q.id) end,
      case when p_patch ? 'correct_index' then (p_patch ->> 'correct_index')::int else app.question_correct_index(q.id) end,
      case when p_patch ? 'accepted_answers' and jsonb_typeof(p_patch -> 'accepted_answers') = 'array'
           then array(select jsonb_array_elements_text(p_patch -> 'accepted_answers'))
           else app.question_accepted(q.id) end
    );
  end if;

  select jsonb_build_array(stem, stem_image, stem_image_alt, explanation, app.question_options_json(id),
                           app.question_correct_index(id), app.question_accepted(id))
    into after from app.questions where id = q.id;
  if after is distinct from before then
    update app.questions set revision = revision + 1 where id = q.id;
    perform app.audit('question.edit', q.id::text);
  end if;
end;
$$;

-- Takes a question out of every package; attempts that already used it keep it.
create function public.admin_delete_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  update app.questions set deleted_at = now() where id = p_question_id and deleted_at is null;
  if not found then raise exception 'question_not_found'; end if;
  perform app.audit('question.delete', p_question_id::text);
end;
$$;

-- Saves an imported Markdown file and its questions (as drafts) in one step.
-- p_questions: [{ block, source, year, subject, type, stem, stem_image, stem_image_alt, options, correct_index,
--                 accepted_answers, explanation }], in file order. Returns the import id.
create function public.admin_import_questions(p_title text, p_source_text text, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_import uuid;
  item record;
  new_question uuid;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'no_questions';
  end if;
  insert into app.imports (title, source_text, created_by)
  values (btrim(p_title), p_source_text, me) returning id into new_import;

  for item in select x.q, x.n from jsonb_array_elements(p_questions) with ordinality as x(q, n) loop
    insert into app.questions (block, source, year, subject, kind, stem, stem_image, stem_image_alt, explanation,
                               import_id, import_position, created_by)
    values (app.ensure_block(item.q ->> 'block'), nullif(item.q ->> 'source', ''), (item.q ->> 'year')::int,
            nullif(item.q ->> 'subject', ''), (item.q ->> 'type')::app.question_kind, item.q ->> 'stem',
            nullif(item.q ->> 'stem_image', ''), nullif(item.q ->> 'stem_image_alt', ''), nullif(item.q ->> 'explanation', ''),
            new_import, item.n::int, me)
    returning id into new_question;
    perform app.set_question_content(
      new_question, item.q -> 'options', (item.q ->> 'correct_index')::int,
      case when jsonb_typeof(item.q -> 'accepted_answers') = 'array'
           then array(select jsonb_array_elements_text(item.q -> 'accepted_answers')) end);
  end loop;

  perform app.audit('questions.import', new_import::text,
                    jsonb_build_object('title', btrim(p_title), 'questions', jsonb_array_length(p_questions)));
  return new_import;
end;
$$;

-- The blocks, sources, years and subjects in the bank, for the filters on Admin → Questions.
create function public.admin_question_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  select jsonb_build_object(
    'blocks', coalesce(jsonb_agg(distinct q.block), '[]'),
    'sources', coalesce(jsonb_agg(distinct q.source) filter (where q.source is not null), '[]'),
    'years', coalesce(jsonb_agg(distinct q.year) filter (where q.year is not null), '[]'),
    'subjects', coalesce(jsonb_agg(distinct q.subject) filter (where q.subject is not null), '[]')
  ) into result
  from app.questions q
  where q.deleted_at is null;
  return result;
end;
$$;

grant execute on function app.question_options_json(uuid), app.question_correct_index(uuid), app.question_accepted(uuid)
  to authenticated;
grant execute on function public.admin_update_question(uuid, jsonb), public.admin_delete_question(uuid),
  public.admin_import_questions(text, text, jsonb), public.admin_question_facets() to authenticated;

-- =============================================================================================
-- 04_exams.sql

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

-- =============================================================================================
-- 05_practice.sql

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

-- =============================================================================================
-- 06_study.sql

-- Studying: the study catalog, the records that earn points, and the student's own saved state.
--
-- Flashcards, image-occlusion figures, quizzes and ebooks live in the repo (content/). The catalog
-- (`study_items`) lists what exists, so the server can check a record before it counts: a card
-- that isn't in a deck, or a quiz answer to a question that doesn't exist, is refused. It's filled
-- from the repo by `npm run db:content` on every deploy.
--
-- What earns points is written only through the functions below, on the server's clock:
-- - card_reviews: one row per card (or occlusion label) per day it was reviewed. A card counts as
--   learned once it has been reviewed on two different days.
-- - quiz_answers: a quiz question answered on a day, graded here against the catalog's key.
-- - chapters_done: an ebook chapter the student finished.
-- - study_days: each day the student studied anything.
--
-- `user_state` is everything else the app keeps per student (review schedules, quiz history,
-- reading positions, plans, settings): the student writes it freely, and nothing reads it for
-- points. Device-only settings (theme, sidebar, language) never leave the browser.

create type app.study_kind as enum ('flashcard', 'occlusion', 'quiz', 'chapter');

create table app.study_items (
  kind       app.study_kind not null,
  deck       text not null check (deck ~ '^[0-9]+\.[0-9]+/[A-Za-z0-9._-]{1,60}$'),  -- "{block}/{subject}"
  item_id    text not null check (length(item_id) between 1 and 160),
  block      text not null references app.blocks(id),
  -- Quizzes: the print position of the right option.
  answer     int,
  -- Set when the item left the repo; records already made keep counting.
  retired_at timestamptz,
  primary key (kind, deck, item_id),
  constraint study_items_quiz_answer check ((kind = 'quiz') = (answer is not null))
);

create table app.card_reviews (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null check (kind in ('flashcard', 'occlusion')),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  primary key (user_id, kind, deck, item_id, day),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create index card_reviews_day on app.card_reviews (user_id, day);

create table app.quiz_answers (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null default 'quiz' check (kind = 'quiz'),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  correct boolean not null,
  primary key (user_id, deck, item_id, day),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create index quiz_answers_day on app.quiz_answers (user_id, day);

create table app.chapters_done (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null default 'chapter' check (kind = 'chapter'),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  primary key (user_id, deck, item_id),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create table app.study_days (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null default app.today(),
  primary key (user_id, day)
);

create table app.user_state (
  user_id    uuid not null references app.accounts(id) on delete cascade,
  key        text not null check (key ~ '^[a-z]+(:[A-Za-z0-9._/-]{1,120})?$'),
  value      jsonb not null,
  -- The server's clock, so the app can ask for "what changed since I last looked".
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_state_value_size check (pg_column_size(value) <= 512 * 1024)
);

-- Saving a value that didn't change writes nothing; a student keeps at most 3000 keys.
create function app.user_state_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.value = old.value and new.user_id = old.user_id and new.key = old.key then
      return null;
    end if;
  elsif not exists (select 1 from app.user_state where user_id = new.user_id and key = new.key)
    and (select count(*) from app.user_state where user_id = new.user_id) >= 3000 then
    raise exception 'progress_full' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_state_before_write before insert or update on app.user_state
  for each row execute function app.user_state_before_write();

alter table app.study_items enable row level security;
alter table app.card_reviews enable row level security;
alter table app.quiz_answers enable row level security;
alter table app.chapters_done enable row level security;
alter table app.study_days enable row level security;
alter table app.user_state enable row level security;

-- The records are the student's own to read; only the functions below write them.
create policy card_reviews_own on app.card_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy quiz_answers_own on app.quiz_answers for select to authenticated using (user_id = (select auth.uid()));
create policy chapters_done_own on app.chapters_done for select to authenticated using (user_id = (select auth.uid()));
create policy study_days_own on app.study_days for select to authenticated using (user_id = (select auth.uid()));
create policy user_state_read on app.user_state for select to authenticated using (user_id = (select auth.uid()));
create policy user_state_add on app.user_state for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_state_change on app.user_state for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_state_remove on app.user_state for delete to authenticated using (user_id = (select auth.uid()));

grant select on app.card_reviews, app.quiz_answers, app.chapters_done, app.study_days to authenticated;
grant select, insert, update, delete on app.user_state to authenticated;

-- Marks today as a study day for the caller.
create function app.mark_study_day(p_user_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into app.study_days (user_id, day) values (p_user_id, app.today()) on conflict do nothing;
$$;

create function app.require_account()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from app.accounts where id = auth.uid()) then raise exception 'no_profile'; end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- The student's saved state, read and written by the app's sync (src/lib/progressSync.ts).
create view public.user_state
with (security_invoker = on) as
select user_id, key, value, updated_at from app.user_state;

revoke all on public.user_state from public, anon, authenticated;
grant select, insert, update, delete on public.user_state to authenticated;

-- Records flashcard and occlusion reviews made today. p_items: [{ kind, deck, item }], at most
-- 200 a call and 3000 a day. Items not in the catalog are skipped. Returns how many were new today.
create function public.record_reviews(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
  added int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'bad_items'; end if;
  if (select count(*) from app.card_reviews where user_id = uid and day = app.today()) + jsonb_array_length(p_items) > 3000 then
    raise exception 'too_many_reviews';
  end if;
  insert into app.card_reviews (user_id, kind, deck, item_id)
  select distinct uid, s.kind, s.deck, s.item_id
    from jsonb_array_elements(p_items) x
    join app.study_items s on s.kind::text = x ->> 'kind' and s.deck = x ->> 'deck' and s.item_id = x ->> 'item'
   where s.kind in ('flashcard', 'occlusion') and s.retired_at is null
  on conflict do nothing;
  get diagnostics added = row_count;
  perform app.mark_study_day(uid);
  return added;
end;
$$;

-- Grades a finished quiz. p_answers: [{ deck, item, choice }], choice = the print position of the
-- option picked (null when skipped), at most 300. Returns { correct, total } as graded here.
create function public.record_quiz(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
  n_correct int;
  n_total int;
begin
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then raise exception 'bad_answers'; end if;
  with graded as (
    select distinct on (s.deck, s.item_id) s.deck, s.item_id,
           coalesce(jsonb_typeof(x -> 'choice') = 'number' and (x ->> 'choice')::numeric = s.answer, false) as correct
      from jsonb_array_elements(p_answers) x
      join app.study_items s on s.kind = 'quiz' and s.deck = x ->> 'deck' and s.item_id = x ->> 'item'
     where s.retired_at is null
  ), saved as (
    -- A question counts once a day: answered right at least once that day.
    insert into app.quiz_answers (user_id, deck, item_id, correct)
    select uid, g.deck, g.item_id, g.correct from graded g
    on conflict (user_id, deck, item_id, day) do update set correct = app.quiz_answers.correct or excluded.correct
    returning 1
  )
  select (select count(*) filter (where correct) from graded), (select count(*) from graded) into n_correct, n_total;
  perform app.mark_study_day(uid);
  return jsonb_build_object('correct', n_correct, 'total', n_total);
end;
$$;

-- Records a finished ebook chapter (once; un-ticking it in the app keeps the record).
create function public.finish_chapter(p_deck text, p_chapter text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
begin
  if not exists (select 1 from app.study_items where kind = 'chapter' and deck = p_deck and item_id = p_chapter and retired_at is null) then
    raise exception 'no_such_chapter';
  end if;
  insert into app.chapters_done (user_id, deck, item_id) values (uid, p_deck, p_chapter) on conflict do nothing;
  perform app.mark_study_day(uid);
end;
$$;

-- Marks today as a study day (reading, the lab, the atlas: studying that isn't a record above).
create function public.record_study_day()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.mark_study_day(app.require_account());
end;
$$;

-- The caller's study days (UTC dates), oldest first, for streaks and the activity calendar.
create function public.my_study_days()
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(day order by day), '{}') from app.study_days where user_id = (select auth.uid());
$$;

grant execute on function app.today() to authenticated;
grant execute on function public.record_reviews(jsonb), public.record_quiz(jsonb), public.finish_chapter(text, text),
  public.record_study_day(), public.my_study_days() to authenticated;

-- =============================================================================================
-- 07_leaderboard.sql

-- The leaderboard. Points come only from records the server made or checked (06_study.sql and
-- graded exam answers), never from what a student saves in user_state:
--
--   1 per question answered right (a quiz question or a single-choice bank question, once a day each)
--   2 per card or occlusion label learned (reviewed on two different days)
--  10 per finished ebook chapter
--   5 per study day
--
-- Each record adds its points to `points` (per student, day and source) when it's made, so the
-- board is a sum over a small table. Points never go down.

create table app.points (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null,
  source  text not null check (source in ('quiz', 'exam', 'cards', 'chapters', 'days')),
  points  int not null default 0 check (points >= 0),
  primary key (user_id, day, source)
);

create index points_day on app.points (day);

-- A bank question answered right in a finished attempt, once per student, question and day.
create table app.exam_correct (
  user_id     uuid not null references app.accounts(id) on delete cascade,
  question_id uuid not null references app.questions(id) on delete cascade,
  day         date not null default app.today(),
  primary key (user_id, question_id, day)
);

alter table app.points enable row level security;
alter table app.exam_correct enable row level security;
-- No policies: read through leaderboard() only.

create function app.add_points(p_user_id uuid, p_source text, p_points int)
returns void
language sql
set search_path = ''
as $$
  insert into app.points (user_id, day, source, points) values (p_user_id, app.today(), p_source, p_points)
  on conflict (user_id, day, source) do update set points = app.points.points + excluded.points;
$$;

create function app.points_for_quiz()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.correct and (tg_op = 'INSERT' or not old.correct) then
    perform app.add_points(new.user_id, 'quiz', 1);
  end if;
  return null;
end;
$$;

create trigger quiz_answers_points after insert or update of correct on app.quiz_answers
  for each row execute function app.points_for_quiz();

create function app.points_for_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from app.card_reviews
       where user_id = new.user_id and kind = new.kind and deck = new.deck and item_id = new.item_id) = 2 then
    perform app.add_points(new.user_id, 'cards', 2);
  end if;
  return null;
end;
$$;

create trigger card_reviews_points after insert on app.card_reviews
  for each row execute function app.points_for_review();

create function app.points_for_chapter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'chapters', 10);
  return null;
end;
$$;

create trigger chapters_done_points after insert on app.chapters_done
  for each row execute function app.points_for_chapter();

create function app.points_for_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'days', 5);
  return null;
end;
$$;

create trigger study_days_points after insert on app.study_days
  for each row execute function app.points_for_day();

create function app.points_for_exam_correct()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'exam', 1);
  return null;
end;
$$;

create trigger exam_correct_points after insert on app.exam_correct
  for each row execute function app.points_for_exam_correct();

-- A finished attempt: its right single-choice answers count (a self-marked short answer doesn't),
-- and it was a study day.
create function app.attempt_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'finished' or old.status = 'finished' then return null; end if;
  insert into app.exam_correct (user_id, question_id)
  select new.user_id, i.question_id from app.attempt_items i
   where i.attempt_id = new.id and i.is_correct and i.option_order is not null
  on conflict do nothing;
  perform app.mark_study_day(new.user_id);
  return null;
end;
$$;

create trigger attempts_finished after update of status on app.attempts
  for each row execute function app.attempt_finished();

-- A student's current run of study days, ending today or yesterday (0 when broken).
create function app.streak(p_user_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  with recursive run as (
    select d.day, 1 as n from app.study_days d
     where d.user_id = p_user_id
       and d.day = (select max(day) from app.study_days where user_id = p_user_id)
       and d.day >= app.today() - 1
    union all
    select d.day, run.n + 1 from run join app.study_days d on d.user_id = p_user_id and d.day = run.day - 1
  )
  select coalesce(max(n), 0) from run;
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- The board: students who joined, ranked by this week's points, all-time points or current study
-- streak; ties share a rank. Also the caller's own numbers, joined or not.
create function public.leaderboard(p_period text default 'week', p_my_cohort_only boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_cohort text;
  result jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_period not in ('week', 'all', 'streak') then raise exception 'bad_period'; end if;
  select s.cohort into my_cohort from app.accounts a join app.students s on s.nim = a.nim where a.id = uid;

  with totals as (
    select a.id as user_id, a.leaderboard_joined as joined,
           coalesce(a.display_name, split_part(s.full_name, ' ', 1)) as name, s.cohort,
           coalesce(sum(p.points), 0)::int as all_points,
           coalesce(sum(p.points) filter (where p.day >= app.today() - 6), 0)::int as week_points,
           coalesce(sum(p.points) filter (where p.source in ('quiz', 'exam')), 0)::int as correct_answers,
           (coalesce(sum(p.points) filter (where p.source = 'cards'), 0) / 2)::int as cards_learned,
           (coalesce(sum(p.points) filter (where p.source = 'chapters'), 0) / 10)::int as chapters_finished,
           (coalesce(sum(p.points) filter (where p.source = 'days'), 0) / 5)::int as study_days
      from app.accounts a
      join app.students s on s.nim = a.nim
      left join app.points p on p.user_id = a.id
     group by a.id, s.full_name, s.cohort
  ),
  scored as (
    select t.*, app.streak(t.user_id) as streak from totals t
     where t.joined or t.user_id = uid
  ),
  valued as (
    select s.*, case p_period when 'week' then s.week_points when 'all' then s.all_points else s.streak end as value
      from scored s
  ),
  board as (
    select v.*, rank() over (order by v.value desc) as rnk
      from valued v
     where v.joined and v.value > 0 and (not p_my_cohort_only or v.cohort is not distinct from my_cohort)
  )
  select jsonb_build_object(
    'period', p_period,
    'cohort', my_cohort,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rnk, 'name', b.name, 'cohort', b.cohort,
                                                          'value', b.value, 'me', b.user_id = uid) order by b.rnk, b.name)
                        from (select * from board order by rnk, name limit 100) b), '[]'),
    'total', (select count(*) from board),
    'me', (select jsonb_build_object('joined', v.joined, 'display_name', v.name, 'value', v.value,
                                     'week', v.week_points, 'streak', v.streak, 'points', v.all_points,
                                     'stats', jsonb_build_object('correct_answers', v.correct_answers,
                                                                 'cards_learned', v.cards_learned,
                                                                 'chapters_finished', v.chapters_finished,
                                                                 'study_days', v.study_days),
                                     'rank', (select b.rnk from board b where b.user_id = uid))
             from valued v where v.user_id = uid)
  ) into result;
  return result;
end;
$$;

grant execute on function public.leaderboard(text, boolean) to authenticated;

-- =============================================================================================
-- 08_readiness.sql

-- Readiness against the class: each student's exam readiness per block (worked out in the app
-- from their own study), and the cohort's average, shown only once at least 3 classmates have one.
-- Readiness is the student's own estimate, so it earns nothing and is never ranked.

create table app.block_readiness (
  user_id    uuid not null references app.accounts(id) on delete cascade,
  block      text not null references app.blocks(id),
  value      numeric(4, 1) not null check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, block)
);

-- The server's clock, whatever the browser sends.
create trigger block_readiness_touch before insert or update on app.block_readiness
  for each row execute function app.touch_updated_at();

alter table app.block_readiness enable row level security;
create policy block_readiness_read on app.block_readiness for select to authenticated using (user_id = (select auth.uid()));
create policy block_readiness_add on app.block_readiness for insert to authenticated with check (user_id = (select auth.uid()));
create policy block_readiness_change on app.block_readiness for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on app.block_readiness to authenticated;

-- ---------------------------------------------------------------------------------------------
-- API

create view public.block_readiness
with (security_invoker = on) as
select user_id, block, value, updated_at from app.block_readiness;

revoke all on public.block_readiness from public, anon, authenticated;
grant select, insert, update on public.block_readiness to authenticated;

create function public.class_readiness(p_block text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select cohort from app.me()),
  agg as (
    select count(*)::int as n, avg(br.value) as average
      from app.block_readiness br
      join app.accounts a on a.id = br.user_id
      join app.students s on s.nim = a.nim
     where br.block = p_block and s.cohort is not distinct from (select cohort from me)
  )
  select jsonb_build_object(
    'cohort', (select cohort from me),
    'count', n,
    'average', case when n >= 3 then round(average) end
  ) from agg;
$$;

grant execute on function public.class_readiness(text) to authenticated;

-- =============================================================================================
-- 09_drive.sql

-- Class Drive: every file in the class's Google Drive folder, copied in by the `drive-sync` Edge
-- Function (daily from GitHub Actions, or from the admin page).
--
-- Block, category and subject come from the folder path:
--   [SEMESTER n /] [REGULER | IUP /] BLOK x.y <name> / <category> / [<subject> / ...] <file>
-- A file the sync no longer finds is marked missing (missing_since), not deleted, and comes back
-- if it reappears. Admins can hide a file (hidden_at) and put files in an order of their own
-- within a folder (sort_order); the sync never touches either column. `track` isn't enforced:
-- the app shows a student their class's folders and can show the other's too. `block` is the
-- folder's block number as written, not a reference: the Drive may hold blocks the app doesn't.

create table app.drive_files (
  id                uuid primary key default gen_random_uuid(),
  drive_file_id     text not null unique,
  title             text not null,
  -- pdf, slide, doc, sheet, video, audio, image, youtube, file
  kind              text not null default 'file',
  semester          int,
  track             text,           -- 'REGULER' or 'IUP'
  block             text,           -- '1.1'
  block_name        text,
  category          text,           -- e.g. 'PPT DOSEN'
  subject           text,
  folder_path       text[] not null default '{}',
  mime_type         text,
  size_bytes        bigint,
  web_url           text,
  youtube_id        text,
  drive_modified_at timestamptz,
  synced_at         timestamptz not null default now(),
  missing_since     timestamptz,
  hidden_at         timestamptz,
  -- Lower first; files with no order come after, by name.
  sort_order        int check (sort_order between 0 and 9999),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger drive_files_touch before update on app.drive_files
  for each row execute function app.touch_updated_at();
create index drive_files_block on app.drive_files (block, category, subject)
  where missing_since is null and hidden_at is null;

-- One row per sync. A sync can take several calls (Edge Functions have a time limit); `cursor`
-- holds the folders still to visit.
create table app.drive_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'running' check (status in ('running', 'done', 'failed', 'held')),
  started_by     text not null check (started_by in ('schedule', 'admin')),
  cursor         jsonb not null default '[]',
  files_found    int not null default 0,
  files_added    int not null default 0,
  files_updated  int not null default 0,
  files_missing  int not null default 0,
  calls          int not null default 0,
  notes          jsonb not null default '{}',
  error          text,
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create trigger drive_sync_runs_touch before update on app.drive_sync_runs
  for each row execute function app.touch_updated_at();
create unique index drive_sync_one_running on app.drive_sync_runs ((true)) where status = 'running';

alter table app.drive_files enable row level security;
alter table app.drive_sync_runs enable row level security;

create policy drive_files_read on app.drive_files for select to authenticated
  using ((missing_since is null and hidden_at is null) or (select public.is_admin()));
create policy drive_files_admin_arrange on app.drive_files for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy drive_sync_runs_admin on app.drive_sync_runs for select to authenticated
  using ((select public.is_admin()));

grant select on app.drive_files, app.drive_sync_runs to authenticated;
-- Admins only hide and order files; everything else is the sync's.
grant update (hidden_at, sort_order) on app.drive_files to authenticated;
grant select, insert, update on app.drive_files, app.drive_sync_runs to service_role;

-- ---------------------------------------------------------------------------------------------
-- API

create view public.drive_files
with (security_invoker = on) as
select id, drive_file_id, title, kind, semester, track, block, block_name, category, subject, folder_path, mime_type,
       size_bytes, web_url, youtube_id, drive_modified_at, synced_at, missing_since, hidden_at, sort_order, created_at,
       updated_at
  from app.drive_files;

create view public.drive_sync_runs
with (security_invoker = on) as
select id, status, started_by, cursor, files_found, files_added, files_updated, files_missing, calls, notes, error,
       started_at, updated_at, finished_at
  from app.drive_sync_runs;

revoke all on public.drive_files, public.drive_sync_runs from public, anon, authenticated;
grant select on public.drive_files, public.drive_sync_runs to authenticated;
grant update (hidden_at, sort_order) on public.drive_files to authenticated;
grant select, insert, update on public.drive_files, public.drive_sync_runs to service_role;

-- For the drive-sync function (service role): the steps a sync takes in bulk.

-- Marks the saved video rows of these Docs as seen (the Docs didn't change, so weren't re-read).
create function public.drive_touch_videos(p_doc_ids text[], p_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.drive_files set synced_at = p_at, missing_since = null
   where kind = 'youtube' and split_part(drive_file_id, ':', 2) = any(p_doc_ids);
$$;

-- Files shown now, and how many of them a run that started at p_since hasn't seen.
create function public.drive_counts(p_since timestamptz)
returns table (live int, unseen int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, (count(*) filter (where synced_at < p_since))::int
    from app.drive_files where missing_since is null;
$$;

create function public.drive_mark_missing(p_since timestamptz)
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    update app.drive_files set missing_since = now()
     where missing_since is null and synced_at < p_since
    returning 1
  )
  select count(*)::int from gone;
$$;

grant execute on function public.drive_touch_videos(text[], timestamptz), public.drive_counts(timestamptz),
  public.drive_mark_missing(timestamptz) to service_role;

-- =============================================================================================
-- 10_ai.sql

-- The AI allowance: answers per student per UTC day, used by the `ai` Edge Function only.

create table app.ai_usage (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null,
  count   int not null default 0,
  primary key (user_id, day)
);

alter table app.ai_usage enable row level security;
-- No policies: only the functions below (for the ai Edge Function) touch it.

-- Takes one answer from today's allowance. Returns what's left, or -1 when there's none.
create function public.ai_take(p_user_id uuid, p_daily_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  used int;
begin
  if not exists (select 1 from app.accounts where id = p_user_id) then return -1; end if;
  insert into app.ai_usage (user_id, day, count) values (p_user_id, app.today(), 1)
  on conflict (user_id, day) do update set count = app.ai_usage.count + 1
    where app.ai_usage.count < p_daily_limit
  returning count into used;
  if used is null then return -1; end if;
  delete from app.ai_usage where user_id = p_user_id and day < app.today() - 2;
  return p_daily_limit - used;
end;
$$;

-- Gives an answer back when the AI failed to produce one.
create function public.ai_refund(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.ai_usage set count = greatest(0, count - 1) where user_id = p_user_id and day = app.today();
$$;

grant execute on function public.ai_take(uuid, int), public.ai_refund(uuid) to service_role;

-- =============================================================================================
-- 11_admin.sql

-- Admin: the roster with account states, roles, and the audit log. Creating, locking and
-- resetting accounts needs the service role: Edge Function `admin-accounts`.

-- The roster with each student's account state: none (not activated), active or locked.
create function public.admin_list_roster()
returns table (student_id text, full_name text, class_group text, cohort text, track text, user_id uuid, role text,
               account text, must_change_password boolean, google_linked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  return query
  select s.nim, s.full_name, s.class_group, s.cohort, s.track::text, a.id, a.role::text,
         case when a.id is null then 'none'
              when u.banned_until is not null and u.banned_until > now() then 'locked'
              else 'active' end,
         a.must_change_password,
         exists (select 1 from auth.identities i where i.user_id = a.id and i.provider = 'google')
    from app.students s
    left join app.accounts a on a.nim = s.nim
    left join auth.users u on u.id = a.id
   order by s.track nulls last, s.class_group nulls last, s.full_name;
end;
$$;

-- Admins can't change their own role, and there must always be at least one admin.
create function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  if p_role not in ('student', 'admin') then raise exception 'bad_role'; end if;
  if p_user_id = auth.uid() then raise exception 'not_on_yourself'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-roles', 0));
  update app.accounts set role = p_role::app.role where id = p_user_id;
  if not found then raise exception 'no_such_account'; end if;
  if not exists (select 1 from app.accounts where role = 'admin') then raise exception 'last_admin'; end if;
  perform app.audit('account.role', p_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

-- For the admin-accounts Edge Function (service role): records what an admin did to an account.
create function public.audit_account_action(p_actor uuid, p_action text, p_target text, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.audit_log (actor, action, target, detail)
  values (p_actor, 'account.' || p_action, p_target, coalesce(p_detail, '{}'));
$$;

-- The newest 200 entries of the audit log, with who did it.
create function public.admin_audit_log()
returns table (id bigint, created_at timestamptz, actor_name text, action text, target text, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  return query
  select l.id, l.created_at, s.full_name, l.action, l.target, l.detail
    from app.audit_log l
    left join app.accounts a on a.id = l.actor
    left join app.students s on s.nim = a.nim
   order by l.created_at desc
   limit 200;
end;
$$;

grant execute on function public.admin_list_roster(), public.admin_set_role(uuid, text), public.admin_audit_log()
  to authenticated;
grant execute on function public.audit_account_action(uuid, text, text, jsonb) to service_role;
