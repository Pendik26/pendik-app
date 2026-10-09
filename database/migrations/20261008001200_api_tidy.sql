-- Tidying the API after the first deploy: what the database linter flagged, and one admin lookup
-- that moves from the browser into SQL. No table changes shape and no data moves.
--
-- - `package_summaries` runs as the caller (security_invoker), so the packages table's own row
--   level security decides what each student sees. Only the question count, which students can't
--   read for themselves, comes from a security definer function, package_question_count().
-- - `packages` has one select policy instead of two: the admin policy covered every command,
--   select included, so each read checked both. It's now split into insert, update and delete.
-- - Indexes on the `created_by` foreign keys, so removing a profile doesn't scan these tables.
-- - admin_question_facets(): the blocks, sources, years and subjects in the bank, for the filters
--   on Admin → Questions, instead of the browser reading up to 10,000 rows to work them out.

-- How many live questions a package has. Definer, so the summary can count questions the caller
-- can't read; it reveals a number, never the questions.
create or replace function public.package_question_count(p_package_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.package_questions pq
    join public.questions q on q.id = pq.question_id and q.deleted_at is null
   where pq.package_id = p_package_id;
$$;

revoke execute on function public.package_question_count(uuid) from public, anon;
grant execute on function public.package_question_count(uuid) to authenticated;

create or replace view public.package_summaries
with (security_invoker = on) as
select p.id, p.title, p.block, p.source, p.year, p.mode, p.time_limit_minutes, p.track_best,
       p.status, p.created_at, p.updated_at,
       public.package_question_count(p.id) as question_count,
       p.track
from public.packages p
where p.deleted_at is null
  and ((p.status = 'published' and public.track_visible(p.track)) or (select public.is_admin()));

drop policy packages_admin on public.packages;
create policy packages_admin_insert on public.packages for insert to authenticated
  with check ((select public.is_admin()));
create policy packages_admin_update on public.packages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy packages_admin_delete on public.packages for delete to authenticated
  using ((select public.is_admin()));

create index question_imports_created_by on public.question_imports (created_by);
create index questions_created_by on public.questions (created_by);
create index packages_created_by on public.packages (created_by);

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

revoke execute on function public.admin_question_facets() from public, anon;
grant execute on function public.admin_question_facets() to authenticated;
