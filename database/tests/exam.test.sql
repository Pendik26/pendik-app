-- Exams: keys stay hidden, grading, deadlines, one tab at a time, frozen attempts, permissions.
\ir helpers.sql

-- Fixture: an admin, two students, one import of 3 questions made into an exam and a practice.
select pg_temp.account('00000000-0000-0000-0000-00000000000a', 'ADM1', 'Ada Admin', 'admin');
select pg_temp.account('00000000-0000-0000-0000-000000000001', 'STU1', 'Sam One', class_group => 'A');
select pg_temp.account('00000000-0000-0000-0000-000000000002', 'STU2', 'Sue Two', class_group => 'B');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select admin_import_questions('Block 1.1 sample', '[source]', '[
  {"block":"1.1","type":"single_choice","stem":"Q1","options":[{"text":"a"},{"text":"b"},{"text":"c"}],"correct_index":1,"explanation":"because b"},
  {"block":"1.1","type":"single_choice","stem":"Q2","options":[{"text":"x"},{"text":"y"}],"correct_index":0},
  {"block":"1.1","type":"short_answer","stem":"Q3","accepted_answers":["heart","cor"]}
]'::jsonb) as import_id \gset
select admin_packages_from_import(:'import_id', 'Exam 1.1', 'Practice 1.1', '1.1', 'sample', 2026, 10, true) as pk \gset
select (:'pk'::jsonb ->> 'exam_id') as exam_id, (:'pk'::jsonb ->> 'practice_id') as practice_id \gset
select pg_temp.check((select count(*) = 3 from admin_questions where status = 'draft'), 'import creates drafts');
select pg_temp.check((select count(*) = 1 from blocks where id = '1.1'), 'import adds its block');
select pg_temp.check(pg_temp.fails($$select admin_set_role('00000000-0000-0000-0000-00000000000a', 'student')$$, 'not_on_yourself'), 'no self demotion');

-- Students can't see drafts, questions, keys or the roster.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) = 0 from package_summaries), 'draft packages hidden');
select pg_temp.check((select count(*) = 0 from admin_questions), 'no question access');
select pg_temp.check((select count(*) = 0 from admin_package_questions), 'no package keys');
select pg_temp.check((select count(*) = 1 from students), 'only their own roster row');
select pg_temp.check(pg_temp.fails(format('select start_attempt(%L)', :'exam_id'), 'package_not_found'), 'cannot start a draft');
select pg_temp.check(pg_temp.fails(format('select admin_set_package_status(%L, ''published'')', :'exam_id'), 'admins_only'), 'students cannot publish');
select pg_temp.check(pg_temp.fails(format('select admin_update_package(%L, ''{"title":"x"}'')', :'exam_id'), 'admins_only'), 'students cannot edit packages');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select admin_set_package_status(:'exam_id', 'published');
select admin_set_package_status(:'practice_id', 'published');
select pg_temp.check((select count(*) = 3 from admin_questions where status = 'published'), 'publishing publishes the questions');

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
select pg_temp.check((select count(*) = 0 from app.attempt_items), 'attempt items (with keys) not readable');

-- Another tab can't save; it can take over.
select pg_temp.check((get_attempt(:'att', '22222222-2222-2222-2222-222222222222') ->> 'holder_state') = 'other', 'second tab is other');
select pg_temp.check((get_attempt(:'att', '22222222-2222-2222-2222-222222222222') -> 'questions') = 'null'::jsonb, 'other tab gets no questions');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, ''22222222-2222-2222-2222-222222222222'', ''{}'')', :'att'), 'held_elsewhere'), 'other tab cannot save');

-- Another student can't touch it.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.check(pg_temp.fails(format('select get_attempt(%L)', :'att'), 'attempt_not_found'), 'not someone else''s');
select pg_temp.check(pg_temp.fails(format('select get_attempt_result(%L)', :'att'), 'attempt_not_found'), 'no one else''s result');
select pg_temp.check((select count(*) = 0 from attempts), 'attempts are private');

-- Answer: Q1 right, Q2 wrong, Q3 short answer (not graded in exams). Choices are display positions.
reset role;
select (select id from app.questions where stem = 'Q1') as q1, (select id from app.questions where stem = 'Q2') as q2,
       (select id from app.questions where stem = 'Q3') as q3 \gset
select (select array_position(option_order, 1) - 1 from app.attempt_items where attempt_id = :'att' and question_id = :'q1') as q1_right,
       (select array_position(option_order, 1) - 1 from app.attempt_items where attempt_id = :'att' and question_id = :'q2') as q2_wrong \gset

-- Editing a question after the attempt started doesn't change the attempt.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select admin_update_question(:'q1', '{"stem":"Q1 edited"}');
select pg_temp.check((select revision = 2 from admin_questions where id = :'q1'), 'edit bumps the revision');
select pg_temp.check((select count(*) = 1 from admin_audit_log() where action = 'question.edit'), 'edit audited');

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select save_attempt(:'att', '11111111-1111-1111-1111-111111111111',
  jsonb_build_object(:'q1', jsonb_build_object('choice', :'q1_right'::int), :'q2', jsonb_build_object('choice', :'q2_wrong'::int),
                     :'q3', jsonb_build_object('text', 'heart', 'self_mark', true)), '{}', 2);
select pg_temp.check((get_attempt(:'att', '11111111-1111-1111-1111-111111111111') -> 'answers' -> :'q1' ->> 'choice')::int = :'q1_right'::int, 'answers saved');
select take_over_attempt(:'att', '22222222-2222-2222-2222-222222222222');
select pg_temp.check(pg_temp.fails(format('select submit_attempt(%L, ''11111111-1111-1111-1111-111111111111'')', :'att'), 'held_elsewhere'), 'old tab cannot submit');
select submit_attempt(:'att', '22222222-2222-2222-2222-222222222222');
select get_attempt_result(:'att') as res \gset
select pg_temp.check((:'res'::jsonb ->> 'correct_count')::int = 1 and (:'res'::jsonb ->> 'wrong_count')::int = 1
                     and (:'res'::jsonb ->> 'blank_count')::int = 0 and (:'res'::jsonb ->> 'score')::numeric = 50.0,
                     'graded 1/2, short answer not graded in exam');
select pg_temp.check((:'res'::jsonb ->> 'tab_leaves')::int = 2, 'tab leaves kept');
select pg_temp.check(position('because b' in :'res') > 0, 'result shows explanations');
select pg_temp.check((:'res'::jsonb -> 'question_revisions' ->> :'q1')::int = 1, 'attempt keeps the revision it started with');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, null, ''{}'')', :'att'), 'attempt_not_running'), 'finished is frozen');
select pg_temp.check((select score = 50.0 and status = 'finished' from attempts where id = :'att'), 'attempt listed with its score');

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
update app.attempts set started_at = now() - interval '11 minutes' where id = :'att2';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check(pg_temp.fails(format('select save_attempt(%L, null, ''{}'')', :'att2'), 'time_up'), 'late save refused');
select pg_temp.check((get_attempt(:'att2') ->> 'status') = 'finished', 'expired attempt finished on open');

-- Points: the exam's right single-choice answer (the self-marked short answer earns nothing), and
-- each finished attempt makes a study day.
reset role;
select pg_temp.check((select sum(points) = 1 from app.points where user_id = '00000000-0000-0000-0000-000000000001' and source = 'exam'), 'one exam point');
select pg_temp.check((select sum(points) = 5 from app.points where user_id = '00000000-0000-0000-0000-000000000001' and source = 'days'), 'one study day');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');

-- Admin stats: how often each option was picked in finished attempts.
select pg_temp.check((select count(*) = 0 from admin_question_stats), 'students get no question stats');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select answered = 1 and correct = 1 from admin_question_stats where question_id = :'q1'), 'stats count graded answers');
select pg_temp.check((select (options -> 1 ->> 'picked')::int = 1 from admin_question_stats where question_id = :'q1'), 'stats in print order');

-- Editing, then removing, a package.
select admin_update_package(:'exam_id', '{"title":"Exam 1.1 (edited)","time_limit_minutes":20}');
select pg_temp.check((select title = 'Exam 1.1 (edited)' and time_limit_minutes = 20 from package_summaries where id = :'exam_id'), 'package edited');
select admin_delete_package(:'exam_id');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) = 0 from package_summaries where id = :'exam_id'), 'removed package gone');
select pg_temp.check((get_attempt_result(:'att') ->> 'score')::numeric = 50.0, 'its attempts keep their results');

-- Signed-out callers get nothing.
select pg_temp.as_user(null);
select pg_temp.check(pg_temp.fails('select * from package_summaries', 'permission denied'), 'anon sees no packages');
select pg_temp.check(pg_temp.fails(format('select start_attempt(%L)', :'practice_id'), 'permission denied'), 'anon cannot start');
reset role;
\echo exam tests passed
