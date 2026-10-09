-- Admin functions. Admins can also read and edit questions, packages and the roster directly
-- (row level security lets them); these cover what must happen in one step or needs auth data.
-- Creating, locking and resetting accounts needs the service role: Edge Function `admin-accounts`.

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  return auth.uid();
end;
$$;

-- The roster with each student's account state: none (not activated), active or locked.
create or replace function public.admin_list_roster()
returns table (student_id text, full_name text, class_group text, cohort text, track text, user_id uuid, role text,
               account text, must_change_password boolean, google_linked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select r.student_id, r.full_name, r.class_group, r.cohort, r.track, p.id, p.role,
         case when p.id is null then 'none'
              when u.banned_until is not null and u.banned_until > now() then 'locked'
              else 'active' end,
         p.must_change_password,
         exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
    from public.roster r
    left join public.profiles p on p.student_id = r.student_id
    left join auth.users u on u.id = p.id
   order by r.track nulls last, r.class_group nulls last, r.full_name;
end;
$$;

-- Admins can't change their own role, and there must always be at least one admin.
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
begin
  if p_role not in ('student', 'admin') then raise exception 'bad_role'; end if;
  if p_user_id = me then raise exception 'not_on_yourself'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-roles', 0));
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'no_such_account'; end if;
  if not exists (select 1 from public.profiles where role = 'admin') then raise exception 'last_admin'; end if;
end;
$$;

-- Saves an imported Markdown file and its questions (as drafts) in one step.
-- p_questions: [{ block, source, year, subject, type, stem, stem_image, stem_image_alt, options, correct_index,
--                 accepted_answers, explanation }], in file order. Returns the import id.
create or replace function public.admin_import_questions(p_title text, p_source_text text, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_admin();
  import_id uuid;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'no_questions';
  end if;
  insert into public.question_imports (title, source_text, created_by)
  values (btrim(p_title), p_source_text, me) returning id into import_id;

  insert into public.questions (block, source, year, subject, type, stem, stem_image, stem_image_alt, options, correct_index,
                                accepted_answers, explanation, import_id, import_position, created_by)
  select q ->> 'block', nullif(q ->> 'source', ''), (q ->> 'year')::int, nullif(q ->> 'subject', ''), q ->> 'type',
         q ->> 'stem', nullif(q ->> 'stem_image', ''), nullif(q ->> 'stem_image_alt', ''), q -> 'options', (q ->> 'correct_index')::int,
         case when jsonb_typeof(q -> 'accepted_answers') = 'array'
              then array(select jsonb_array_elements_text(q -> 'accepted_answers')) end,
         nullif(q ->> 'explanation', ''), import_id, n::int, me
    from jsonb_array_elements(p_questions) with ordinality as x(q, n);
  return import_id;
end;
$$;

-- Makes an exam package and a practice package from one import's questions, both as drafts.
create or replace function public.admin_packages_from_import(
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
  me uuid := public.require_admin();
  exam_id uuid;
  practice_id uuid;
  n int;
begin
  select count(*) into n from public.questions where import_id = p_import_id and deleted_at is null;
  if n = 0 then raise exception 'import_has_no_questions'; end if;

  insert into public.packages (title, block, source, year, mode, time_limit_minutes, track_best, created_by)
  values (btrim(p_exam_title), p_block, p_source, p_year, 'exam', p_time_limit_minutes, coalesce(p_track_best, false), me)
  returning id into exam_id;
  insert into public.packages (title, block, source, year, mode, created_by)
  values (btrim(p_practice_title), p_block, p_source, p_year, 'practice', me)
  returning id into practice_id;

  insert into public.package_questions (package_id, question_id, position)
  select pk.id, q.id, row_number() over (partition by pk.id order by q.import_position, q.id)
    from public.questions q
   cross join (values (exam_id), (practice_id)) as pk(id)
   where q.import_id = p_import_id and q.deleted_at is null;

  return jsonb_build_object('exam_id', exam_id, 'practice_id', practice_id, 'question_count', n);
end;
$$;

-- Publishing a package publishes its questions too; unpublishing leaves the questions as they are
-- (another package may use them).
create or replace function public.admin_set_package_status(p_package_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_status not in ('draft', 'published') then raise exception 'bad_status'; end if;
  if p_status = 'published' and not exists (
    select 1 from public.package_questions pq join public.questions q on q.id = pq.question_id
     where pq.package_id = p_package_id and q.deleted_at is null
  ) then
    raise exception 'package_empty';
  end if;
  update public.packages set status = p_status where id = p_package_id and deleted_at is null;
  if not found then raise exception 'package_not_found'; end if;
  if p_status = 'published' then
    update public.questions set status = 'published'
     where id in (select question_id from public.package_questions where package_id = p_package_id)
       and status <> 'published';
  end if;
end;
$$;

-- The blocks, sources, years and subjects in the bank, for the filters on Admin → Questions.
-- Runs as the caller: row level security gives admins every question and anyone else none.
create or replace function public.admin_question_facets()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'blocks', coalesce(jsonb_agg(distinct q.block), '[]'),
    'sources', coalesce(jsonb_agg(distinct q.source) filter (where q.source is not null), '[]'),
    'years', coalesce(jsonb_agg(distinct q.year) filter (where q.year is not null), '[]'),
    'subjects', coalesce(jsonb_agg(distinct q.subject) filter (where q.subject is not null), '[]')
  )
  from public.questions q
  where q.deleted_at is null;
$$;

revoke execute on function public.require_admin(), public.admin_list_roster(), public.admin_set_role(uuid, text),
  public.admin_import_questions(text, text, jsonb),
  public.admin_packages_from_import(uuid, text, text, text, text, int, int, boolean),
  public.admin_set_package_status(uuid, text), public.admin_question_facets()
  from public, anon;
grant execute on function public.admin_list_roster(), public.admin_set_role(uuid, text),
  public.admin_import_questions(text, text, jsonb),
  public.admin_packages_from_import(uuid, text, text, text, text, int, int, boolean),
  public.admin_set_package_status(uuid, text), public.admin_question_facets()
  to authenticated;
