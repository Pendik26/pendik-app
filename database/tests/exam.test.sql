-- Exams: keys stay hidden, grading, deadlines, one tab at a time, permissions.
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

-- Fixture: an admin, two students, one exam package with 3 questions.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a1@pendik26.internal'),
  ('00000000-0000-0000-0000-000000000001', 's1@pendik26.internal'),
  ('00000000-0000-0000-0000-000000000002', 's2@pendik26.internal');
insert into roster (student_id, full_name, class_group) values ('ADM1', 'Ada Admin', 'A'), ('STU1', 'Sam One', 'A'), ('STU2', 'Sue Two', 'B');
insert into profiles (id, student_id, full_name, role, must_change_password, cohort) values
  ('00000000-0000-0000-0000-00000000000a', 'ADM1', 'Ada Admin', 'admin', false, '2026'),
  ('00000000-0000-0000-0000-000000000001', 'STU1', 'Sam One', 'student', false, '2026'),
  ('00000000-0000-0000-0000-000000000002', 'STU2', 'Sue Two', 'student', false, '2026');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select admin_import_questions('Block 1.1 sample', '[source]', '[
  {"block":"1.1","type":"single_choice","stem":"Q1","options":[{"text":"a"},{"text":"b"},{"text":"c"}],"correct_index":1,"explanation":"because b"},
  {"block":"1.1","type":"single_choice","stem":"Q2","options":[{"text":"x"},{"text":"y"}],"correct_index":0},
  {"block":"1.1","type":"short_answer","stem":"Q3","accepted_answers":["heart","cor"]}
]'::jsonb) as import_id \gset
select admin_packages_from_import(:'import_id', 'Exam 1.1', 'Practice 1.1', '1.1', 'sample', 2026, 10, true) as pk \gset
select (:'pk'::jsonb ->> 'exam_id') as exam_id, (:'pk'::jsonb ->> 'practice_id') as practice_id \gset
select pg_temp.check((select count(*) = 3 from questions where status = 'draft'), 'import creates drafts');
select pg_temp.check(pg_temp.fails($$select admin_set_role('00000000-0000-0000-0000-00000000000a', 'student')$$, 'not_on_yourself'), 'no self demotion');

-- Students can't see drafts, questions or imports.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) = 0 from package_summaries), 'draft packages hidden');
select pg_temp.check((select count(*) = 0 from questions), 'no direct question access');
select pg_temp.check((select count(*) = 0 from question_imports), 'no import access');
select pg_temp.check((select count(*) = 0 from roster), 'no roster');
select pg_temp.check(pg_temp.fails(format('select start_attempt(%L)', :'exam_id'), 'package_not_found'), 'cannot start a draft');
select pg_temp.check(pg_temp.fails(format('select admin_set_package_status(%L, ''published'')', :'exam_id'), 'admins_only'), 'students cannot publish');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select admin_set_package_status(:'exam_id', 'published');
select admin_set_package_status(:'practice_id', 'published');

-- Exam attempt: no keys while running.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check((select question_count = 3 from package_summaries where id = :'exam_id'), 'count visible');
select start_attempt(:'exam_id', '11111111-1111-1111-1111-111111111111') ->> 'attempt_id' as att \gset
select pg_temp.check((start_attempt(:'practice_id') ->> 'attempt_id') = :'att', 'one running attempt: start returns it');
select get_attempt(:'att', '11111111-1111-1111-1111-111111111111') as view \gset
select pg_temp.check((:'view'::jsonb ->> 'holder_state') = 'you', 'tab holds it');
select pg_temp.check(position('correct' in :'view') = 0 and position('accepted_answers' in :'view') = 0
                     and position('because b' in :'view') = 0 and position('heart' in :'view') = 0, 'exam sends no keys');
select pg_temp.check(jsonb_array_length(:'view'::jsonb -> 'questions') = 3, 'all questions sent');
select pg_temp.check((:'view'::jsonb ->> 'seconds_left')::int between 590 and 600, 'server timer');
select pg_temp.check(pg_temp.fails('select answers from attempts', 'permission denied'), 'answers column not readable');

-- Another tab can't save; it can take over.
select pg_temp.check((get_attempt(:'att', '22222222-2222-2222-2222-222222222222') ->> 'holder_state') = 'other', 'second tab is other');
select pg_temp.check((get_attempt(:'att', '22222222-2222-2222-2222-222222222222') -> 'questions') = 'null'::jsonb, 'other tab gets no questions');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, ''22222222-2222-2222-2222-222222222222'', ''{}'')', :'att'), 'held_elsewhere'), 'other tab cannot save');

-- Another student can't touch it.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check(pg_temp.fails(format('select get_attempt(%L)', :'att'), 'attempt_not_found'), 'not someone else''s');
select pg_temp.check((select count(*) = 0 from attempts), 'attempts are private');

-- Answer: Q1 correct, Q2 wrong, Q3 short answer (not graded in exams).
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
reset role;
select (select id from questions where stem = 'Q1') as q1, (select id from questions where stem = 'Q2') as q2,
       (select id from questions where stem = 'Q3') as q3 \gset
select (select (o.n - 1) from jsonb_array_elements_text(option_orders -> :'q1') with ordinality o(v, n) where o.v::int = 1) as q1_right,
       (select (o.n - 1) from jsonb_array_elements_text(option_orders -> :'q2') with ordinality o(v, n) where o.v::int = 1) as q2_wrong
  from attempts where id = :'att' \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select save_attempt(:'att', '11111111-1111-1111-1111-111111111111',
  jsonb_build_object(:'q1', jsonb_build_object('choice', :'q1_right'::int), :'q2', jsonb_build_object('choice', :'q2_wrong'::int),
                     :'q3', jsonb_build_object('text', 'heart', 'self_mark', true)), '{}', 2);
select take_over_attempt(:'att', '22222222-2222-2222-2222-222222222222');
select pg_temp.check(pg_temp.fails(format('select submit_attempt(%L, ''11111111-1111-1111-1111-111111111111'')', :'att'), 'held_elsewhere'), 'old tab cannot submit');
select submit_attempt(:'att', '22222222-2222-2222-2222-222222222222');
select get_attempt_result(:'att') as res \gset
select pg_temp.check((:'res'::jsonb ->> 'correct_count')::int = 1 and (:'res'::jsonb ->> 'wrong_count')::int = 1
                     and (:'res'::jsonb ->> 'blank_count')::int = 0 and (:'res'::jsonb ->> 'score')::numeric = 50.0,
                     'graded 1/2, short answer not graded in exam');
select pg_temp.check((:'res'::jsonb ->> 'tab_leaves')::int = 2, 'tab leaves kept');
select pg_temp.check(position('because b' in :'res') > 0, 'result shows explanations');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, null, ''{}'')', :'att'), 'attempt_not_running'), 'finished is frozen');
select pg_temp.check((select score = 50.0 from best_scores where package_id = :'exam_id'), 'best score');

-- Practice: keys come with the questions, self-marked short answers count, can be abandoned.
select start_attempt(:'practice_id') ->> 'attempt_id' as patt \gset
select get_attempt(:'patt') as pview \gset
select pg_temp.check(position('accepted_answers' in :'pview') > 0 and position('because b' in :'pview') > 0, 'practice has keys');
select submit_attempt(:'patt', null, jsonb_build_object(:'q3', jsonb_build_object('text', 'cor', 'self_mark', true)));
select pg_temp.check((select correct_count = 1 and blank_count = 2 from attempts where id = :'patt'), 'practice self-mark counts');
select start_attempt(:'practice_id') ->> 'attempt_id' as patt2 \gset
select abandon_attempt(:'patt2');
select start_attempt(:'exam_id') ->> 'attempt_id' as att2 \gset
select pg_temp.check(pg_temp.fails(format('select abandon_attempt(%L)', :'att2'), 'cannot_abandon'), 'exams cannot be abandoned');

-- Deadline: an exam past its time is graded from saved answers when next opened.
reset role;
update attempts set started_at = now() - interval '11 minutes' where id = :'att2';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, null, ''{}'')', :'att2'), 'time_up'), 'late save refused');
select pg_temp.check((get_attempt(:'att2') ->> 'status') = 'finished', 'expired attempt finished on open');

-- Leaderboard: attempts count as correct answers; progress feeds it too.
insert into progress (user_id, key, value) values
  ('00000000-0000-0000-0000-000000000001', 'activity', to_jsonb(array[(now() at time zone 'utc')::date - 1, (now() at time zone 'utc')::date]::text[])),
  ('00000000-0000-0000-0000-000000000001', 'flashcards:1.1/histology', '{"c1":{"reps":2},"c2":{"reps":0}}');
select update_my_settings(null, true);
select leaderboard('all') as lb \gset
-- 2 correct answers (exam 1 + practice 1) + 1 card * 2 + 2 days * 5 = 14
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'points')::int = 14, 'all-time points: ' || (:'lb'::jsonb -> 'me' ->> 'points'));
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'streak')::int = 2, 'streak');
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'rank')::int = 1, 'ranked');
select pg_temp.check(pg_temp.fails('select * from leaderboard_parts', 'permission denied'), 'parts private');

-- Signed-out callers get nothing.
select pg_temp.as_user(null);
select pg_temp.check(pg_temp.fails('select * from package_summaries', 'permission denied'), 'anon sees no packages');
select pg_temp.check(pg_temp.fails(format('select start_attempt(%L)', :'exam_id'), 'permission denied'), 'anon cannot start');
reset role;
\echo exam tests passed
