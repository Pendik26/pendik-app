-- Tracks, practice from the question bank, and bookmarks.
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

-- Fixture: an admin (no track), an IUP student and a Reguler student.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ba', 'b1@pendik26.internal'),
  ('00000000-0000-0000-0000-0000000000b1', 'b2@pendik26.internal'),
  ('00000000-0000-0000-0000-0000000000b2', 'b3@pendik26.internal');
insert into roster (student_id, full_name, track) values ('PADM', 'Pat Admin', null), ('PIUP', 'Ivy Iup', 'IUP'), ('PREG', 'Rey Reg', 'REGULER');
insert into profiles (id, student_id, full_name, role, must_change_password) values
  ('00000000-0000-0000-0000-0000000000ba', 'PADM', 'Pat Admin', 'admin', false),
  ('00000000-0000-0000-0000-0000000000b1', 'PIUP', 'Ivy Iup', 'student', false),
  ('00000000-0000-0000-0000-0000000000b2', 'PREG', 'Rey Reg', 'student', false);
select pg_temp.check((select track = 'IUP' from profiles where student_id = 'PIUP'), 'profile takes the roster track');

-- Two imports: one for everyone, one for Reguler only.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba');
select admin_import_questions('Shared', '[source]', '[
  {"block":"2.1","source":"ub","year":2024,"subject":"Anatomy","type":"single_choice","stem":"S1","options":[{"text":"a"},{"text":"b"}],"correct_index":0},
  {"block":"2.1","source":"ub","year":2025,"subject":"Anatomy","type":"single_choice","stem":"S2","options":[{"text":"a"},{"text":"b"}],"correct_index":1},
  {"block":"2.1","source":"costraver","year":2025,"subject":"Physiology","type":"short_answer","stem":"S3","accepted_answers":["ok"]}
]'::jsonb) as shared_import \gset
select admin_packages_from_import(:'shared_import', 'Shared exam', 'Shared practice', '2.1', 'ub', 2024, 10, true) as sp \gset
select admin_import_questions('Reguler', '[source]', '[
  {"block":"2.1","source":"ub","year":2023,"type":"single_choice","stem":"R1","options":[{"text":"a"},{"text":"b"}],"correct_index":0}
]'::jsonb) as reg_import \gset
select admin_packages_from_import(:'reg_import', 'Reg exam', 'Reg practice', '2.1', 'ub', 2023, 10, true) as rp \gset
select (:'sp'::jsonb ->> 'exam_id') as shared_exam, (:'sp'::jsonb ->> 'practice_id') as shared_practice,
       (:'rp'::jsonb ->> 'exam_id') as reg_exam, (:'rp'::jsonb ->> 'practice_id') as reg_practice \gset
update packages set track = 'REGULER' where id in (:'reg_exam', :'reg_practice');
select admin_set_package_status(:'shared_exam', 'published');
select admin_set_package_status(:'shared_practice', 'published');
select admin_set_package_status(:'reg_exam', 'published');
select admin_set_package_status(:'reg_practice', 'published');
select pg_temp.check((select count(*) = 4 from package_summaries where block = '2.1'), 'admin sees every track');

-- Tracks: IUP doesn't see or start Reguler packages; Reguler sees both.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(my_track() = 'IUP', 'my_track');
select pg_temp.check((select count(*) = 2 from package_summaries where block = '2.1'), 'IUP sees shared packages only');
select pg_temp.check((select count(*) = 2 from packages where block = '2.1'), 'IUP reads shared packages only');
select pg_temp.check(pg_temp.fails(format('select start_attempt(%L)', :'reg_exam'), 'package_not_found'), 'IUP cannot start a Reguler package');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) = 4 from package_summaries where block = '2.1'), 'Reguler sees shared and Reguler packages');

-- Moving a student on the roster moves their profile.
reset role;
update roster set track = 'REGULER' where student_id = 'PIUP';
select pg_temp.check((select track = 'REGULER' from profiles where student_id = 'PIUP'), 'roster track change reaches the profile');
update roster set track = 'IUP' where student_id = 'PIUP';

-- The bank: questions from published practice packages the student can see.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select sum(questions) = 3 from bank_options() where block = '2.1'), 'IUP bank has the 3 shared questions');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select sum(questions) = 4 from bank_options() where block = '2.1'), 'Reguler bank has 4');

-- Filters: source ub, year 2025 -> only S2.
select start_bank_practice('2.1', array['ub'], array[2025], '{}', false, 10, null, 'Block 2.1 practice') ->> 'attempt_id' as b1 \gset
select get_attempt(:'b1') as bview \gset
select pg_temp.check(jsonb_array_length(:'bview'::jsonb -> 'questions') = 1 and position('"S2"' in :'bview') > 0, 'filters pick S2 only');
select pg_temp.check((:'bview'::jsonb ->> 'title') = 'Block 2.1 practice' and (:'bview'::jsonb ->> 'package_id') is null, 'bank attempt title, no package');
select pg_temp.check(position('"correct"' in :'bview') > 0, 'bank practice sends keys');
select pg_temp.check((start_bank_practice('2.1') ->> 'resumed')::boolean, 'one running attempt');
select submit_attempt(:'b1', null, '{}');
select pg_temp.check((get_attempt_result(:'b1') ->> 'title') = 'Block 2.1 practice', 'result has the title');

-- Count and timer.
select start_bank_practice('2.1', '{}', '{}', '{}', false, 2, 15) ->> 'attempt_id' as b2 \gset
reset role;
select pg_temp.check((select array_length(question_ids, 1) = 2 and time_limit_minutes = 15 from attempts where id = :'b2'), 'count and timer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select abandon_attempt(:'b2');
select pg_temp.check(pg_temp.fails($$select start_bank_practice('9.9')$$, 'no_questions_match'), 'empty filter refused');
select pg_temp.check(pg_temp.fails($$select start_bank_practice('2.1', '{}', '{}', '{}', false, 0)$$, 'bad_count'), 'count checked');

-- Bookmarks: own only, practice from them, and only bank questions are listed.
reset role;
select (select id from questions where stem = 'S1') as s1, (select id from questions where stem = 'R1') as r1 \gset
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into bookmarks (user_id, question_id) values ('00000000-0000-0000-0000-0000000000b2', :'s1');
select pg_temp.check(pg_temp.fails(format('insert into bookmarks (user_id, question_id) values (%L, %L)', '00000000-0000-0000-0000-0000000000b1', :'s1'), 'row-level security'), 'cannot bookmark for someone else');
select pg_temp.check(jsonb_array_length(my_bookmarks()) = 1 and (my_bookmarks() -> 0 ->> 'stem') = 'S1', 'bookmark listed with its question');
select pg_temp.check((my_bookmarks() -> 0 ->> 'correct')::int = 0, 'bookmark shows the key');
select start_bank_practice(null, '{}', '{}', '{}', true, 20) ->> 'attempt_id' as b3 \gset
reset role;
select pg_temp.check((select question_ids = array[:'s1'::uuid] from attempts where id = :'b3'), 'practise bookmarks only');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select abandon_attempt(:'b3');

-- An IUP student bookmarking a Reguler-only question sees nothing of it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into bookmarks (user_id, question_id) values ('00000000-0000-0000-0000-0000000000b1', :'r1');
select pg_temp.check(jsonb_array_length(my_bookmarks()) = 0, 'bookmark outside the bank shows nothing');
select pg_temp.check((select count(*) = 0 from bookmarks where user_id = '00000000-0000-0000-0000-0000000000b2'), 'others'' bookmarks private');

-- Exam-only questions never reach the bank.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ba');
select admin_set_package_status(:'shared_practice', 'draft');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) = 0 from bank_options() where block = '2.1'), 'unpublished practice leaves the bank');
reset role;
\echo practice tests passed
