-- The API tidy-up (…1200_api_tidy.sql): package summaries as the caller, the packages policies,
-- and the question facets for Admin → Questions.
\set QUIET on
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;
create or replace function pg_temp.as_user(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(id::text, ''), false);
  execute 'set role ' || case when id is null then 'anon' else 'authenticated' end;
end $$;
create or replace function pg_temp.fails(sql text, expected text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(expected in sqlerrm) = 0 then raise exception 'expected "%", got "%"', expected, sqlerrm; end if;
  return true;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
-- Rolled back at the end, so the other tests see none of this.
begin;

-- Fixture: an admin and a student.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ca', 'c1@pendik26.internal'),
  ('00000000-0000-0000-0000-0000000000c1', 'c2@pendik26.internal');
insert into roster (student_id, full_name) values ('CADM', 'Cy Admin'), ('CSTU', 'Cal Student');
insert into profiles (id, student_id, full_name, role, must_change_password) values
  ('00000000-0000-0000-0000-0000000000ca', 'CADM', 'Cy Admin', 'admin', false),
  ('00000000-0000-0000-0000-0000000000c1', 'CSTU', 'Cal Student', 'student', false);

select pg_temp.check(
  (select (reloptions @> array['security_invoker=on']) from pg_class where oid = 'public.package_summaries'::regclass),
  'package_summaries runs as the caller');
select pg_temp.check(
  (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'packages' and cmd in ('SELECT', 'ALL')),
  'one policy decides who reads packages');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ca');
select admin_import_questions('Facets', '[source]', '[
  {"block":"3.2","source":"ub","year":2024,"subject":"Anatomy","type":"single_choice","stem":"F1","options":[{"text":"a"},{"text":"b"}],"correct_index":0},
  {"block":"3.10","source":"costraver","year":2025,"subject":"Anatomy","type":"single_choice","stem":"F2","options":[{"text":"a"},{"text":"b"}],"correct_index":1},
  {"block":"3.2","type":"short_answer","stem":"F3","accepted_answers":["ok"]}
]'::jsonb) as facet_import \gset
select admin_packages_from_import(:'facet_import', 'Facet exam', 'Facet practice', '3.2', 'ub', 2024, 10, true) as fp \gset
select (:'fp'::jsonb ->> 'exam_id') as facet_exam, (:'fp'::jsonb ->> 'practice_id') as facet_practice \gset

select admin_question_facets() as facets \gset
select pg_temp.check((:'facets'::jsonb -> 'blocks') @> '["3.2", "3.10"]' and jsonb_array_length(:'facets'::jsonb -> 'blocks') = 2, 'facet blocks, each once');
select pg_temp.check(:'facets'::jsonb -> 'sources' @> '["ub", "costraver"]' and jsonb_array_length(:'facets'::jsonb -> 'sources') = 2, 'facet sources, no null');
select pg_temp.check(:'facets'::jsonb -> 'years' @> '[2024, 2025]', 'facet years');
select pg_temp.check(:'facets'::jsonb -> 'subjects' = '["Anatomy"]', 'facet subjects');

-- Admins still create, edit and delete packages through the split policies.
update packages set title = 'Facet exam (edited)' where id = :'facet_exam';
select pg_temp.check((select title = 'Facet exam (edited)' from packages where id = :'facet_exam'), 'admin updates a package');
select pg_temp.check((select count(*) = 2 from package_summaries where block = '3.2' and status = 'draft'), 'admin sees drafts');
select pg_temp.check((select question_count = 3 from package_summaries where id = :'facet_exam'), 'admin sees the count');

-- A student: no facets, no drafts, and can't change packages.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(admin_question_facets() = '{"blocks": [], "sources": [], "years": [], "subjects": []}', 'students get no facets');
select pg_temp.check((select count(*) = 0 from package_summaries where block = '3.2'), 'student sees no drafts');
update packages set title = 'hacked' where id = :'facet_exam';
select pg_temp.check(pg_temp.fails($$insert into packages (title, mode) values ('mine', 'practice')$$, 'row-level security'), 'students cannot create packages');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ca');
select pg_temp.check((select title = 'Facet exam (edited)' from packages where id = :'facet_exam'), 'student update changed nothing');
select admin_set_package_status(:'facet_practice', 'published');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select question_count = 3 from package_summaries where id = :'facet_practice'), 'student sees the count of a published package');
select pg_temp.check(package_question_count(:'facet_practice') = 3, 'count function');
select pg_temp.check((select count(*) = 0 from questions), 'still no direct question access');

select pg_temp.as_user(null);
select pg_temp.check(pg_temp.fails('select * from package_summaries', 'permission denied'), 'anon sees no packages');
select pg_temp.check(pg_temp.fails('select admin_question_facets()', 'permission denied'), 'anon cannot call facets');
reset role;
rollback;
\echo api tests passed
