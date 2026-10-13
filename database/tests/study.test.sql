-- Studying: the catalog, the records that earn points, saved state, readiness and the leaderboard.
\ir helpers.sql

-- Fixture: two students in their own cohort, and a small catalog (what `npm run db:content` loads).
select pg_temp.account('00000000-0000-0000-0000-0000000000f1', 'PSTUDY1', 'Lee Learner', cohort => '2029');
select pg_temp.account('00000000-0000-0000-0000-0000000000f2', 'PSTUDY2', 'Max Mate', cohort => '2029');
insert into app.blocks (id) values ('4.1') on conflict do nothing;
insert into app.study_items (kind, deck, item_id, block, answer) values
  ('flashcard', '4.1/histology', 'c1', '4.1', null),
  ('flashcard', '4.1/histology', 'c2', '4.1', null),
  ('flashcard', '4.1/histology', 'old', '4.1', null),
  ('occlusion', '4.1/anatomy', 'n1:m1', '4.1', null),
  ('quiz', '4.1/anatomy', 'q1', '4.1', 2),
  ('quiz', '4.1/anatomy', 'q2', '4.1', 0),
  ('chapter', '4.1/guyton', 'ch1', '4.1', null);
update app.study_items set retired_at = now() where item_id = 'old';
select pg_temp.check(pg_temp.fails($$insert into app.study_items (kind, deck, item_id, block) values ('quiz', '4.1/x', 'q', '4.1')$$, 'study_items_quiz_answer'), 'a quiz item needs its answer');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
-- The records are written only through the functions.
select pg_temp.check(pg_temp.fails($$insert into app.card_reviews (user_id, kind, deck, item_id) values ('00000000-0000-0000-0000-0000000000f1', 'flashcard', '4.1/histology', 'c1')$$, 'permission denied'), 'no direct reviews');
select pg_temp.check(pg_temp.fails($$insert into app.points (user_id, day, source, points) values ('00000000-0000-0000-0000-0000000000f1', current_date, 'quiz', 999)$$, 'permission denied'), 'no direct points');
select pg_temp.check(pg_temp.fails($$select * from app.points$$, 'permission denied'), 'points not readable');

-- Reviews: catalog items only (unknown and retired ones are skipped), once per card per day.
select pg_temp.check(record_reviews('[{"kind":"flashcard","deck":"4.1/histology","item":"c1"},
                                      {"kind":"flashcard","deck":"4.1/histology","item":"c2"},
                                      {"kind":"flashcard","deck":"4.1/histology","item":"c1"},
                                      {"kind":"flashcard","deck":"4.1/histology","item":"made-up"},
                                      {"kind":"flashcard","deck":"4.1/histology","item":"old"},
                                      {"kind":"occlusion","deck":"4.1/anatomy","item":"n1:m1"}]') = 3, 'three new reviews');
select pg_temp.check(record_reviews('[{"kind":"flashcard","deck":"4.1/histology","item":"c1"}]') = 0, 'same card, same day: nothing new');
select pg_temp.check(pg_temp.fails($$select record_reviews('{}')$$, 'bad_items'), 'items must be a list');
select pg_temp.check((select count(*) = 3 from app.card_reviews where user_id = '00000000-0000-0000-0000-0000000000f1'), 'own reviews readable');
-- No card is learned on its first day.
reset role;
select pg_temp.check(not exists (select 1 from app.points where user_id = '00000000-0000-0000-0000-0000000000f1' and source = 'cards'), 'one day is not learned');
-- c2 was also reviewed yesterday: two different days, so it's learned.
insert into app.card_reviews (user_id, kind, deck, item_id, day)
values ('00000000-0000-0000-0000-0000000000f1', 'flashcard', '4.1/histology', 'c2', app.today() - 1);
select pg_temp.check((select sum(points) = 2 from app.points where user_id = '00000000-0000-0000-0000-0000000000f1' and source = 'cards'), 'two days: learned, 2 points');
insert into app.card_reviews (user_id, kind, deck, item_id, day)
values ('00000000-0000-0000-0000-0000000000f1', 'flashcard', '4.1/histology', 'c2', app.today() - 2);
select pg_temp.check((select sum(points) = 2 from app.points where user_id = '00000000-0000-0000-0000-0000000000f1' and source = 'cards'), 'a third day earns no more');

-- Quizzes: graded here against the catalog's key; one point per question per day.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(record_quiz('[{"deck":"4.1/anatomy","item":"q1","choice":2},{"deck":"4.1/anatomy","item":"q2","choice":1},
                                   {"deck":"4.1/anatomy","item":"nope","choice":0}]') = '{"correct": 1, "total": 2}', 'graded on the server');
select pg_temp.check(record_quiz('[{"deck":"4.1/anatomy","item":"q1","choice":2}]') = '{"correct": 1, "total": 1}', 'same question again');
select pg_temp.check(record_quiz('[{"deck":"4.1/anatomy","item":"q2","choice":null}]') = '{"correct": 0, "total": 1}', 'skipped is wrong');
select pg_temp.check(record_quiz('[{"deck":"4.1/anatomy","item":"q2","choice":0}]') = '{"correct": 1, "total": 1}', 'right on retry');
select pg_temp.check(record_quiz('[{"deck":"4.1/anatomy","item":"q2","choice":"0"}]') = '{"correct": 0, "total": 1}', 'a string is not a choice');
reset role;
select pg_temp.check((select sum(points) = 2 from app.points where user_id = '00000000-0000-0000-0000-0000000000f1' and source = 'quiz'), 'quiz: one point per question per day');
select pg_temp.check((select correct from app.quiz_answers where user_id = '00000000-0000-0000-0000-0000000000f1' and item_id = 'q2'), 'a right answer that day stays right');

-- Chapters: once each.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select finish_chapter('4.1/guyton', 'ch1');
select finish_chapter('4.1/guyton', 'ch1');
select pg_temp.check(pg_temp.fails($$select finish_chapter('4.1/guyton', 'ch99')$$, 'no_such_chapter'), 'unknown chapter refused');

-- Study days: today, from any record; and yesterday.
select record_study_day();
reset role;
insert into app.study_days (user_id, day) values ('00000000-0000-0000-0000-0000000000f1', app.today() - 1);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(my_study_days() = array[app.today() - 1, app.today()], 'my study days');

-- The leaderboard: 2 quiz + 2 cards + 10 chapter + 2 days * 5 = 24.
select pg_temp.check((leaderboard('all') -> 'me' ->> 'rank') is null, 'not on the board until joined');
select update_my_settings('Lee', true);
select leaderboard('all', true) as lb \gset
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'points')::int = 24, 'all-time points: ' || (:'lb'::jsonb -> 'me' ->> 'points'));
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'week')::int = 24, 'this week');
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'streak')::int = 2, 'streak');
select pg_temp.check((:'lb'::jsonb -> 'me' ->> 'rank')::int = 1, 'ranked');
select pg_temp.check((:'lb'::jsonb -> 'me' -> 'stats') = '{"correct_answers": 2, "cards_learned": 1, "chapters_finished": 1, "study_days": 2}', 'stats');
select pg_temp.check((:'lb'::jsonb ->> 'total')::int = 1 and (:'lb'::jsonb -> 'rows' -> 0 ->> 'name') = 'Lee', 'board shows the display name');
select pg_temp.check((leaderboard('streak', true) -> 'rows' -> 0 ->> 'value')::int = 2, 'streak board');
select pg_temp.check(pg_temp.fails($$select leaderboard('month')$$, 'bad_period'), 'period checked');
-- A classmate who hasn't joined sees the board but isn't on it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select leaderboard('all', true) as lb2 \gset
select pg_temp.check((:'lb2'::jsonb ->> 'total')::int = 1 and (:'lb2'::jsonb -> 'me' ->> 'joined')::boolean = false
                     and (:'lb2'::jsonb -> 'me' ->> 'rank') is null, 'classmate not joined');
select pg_temp.check((:'lb2'::jsonb -> 'rows' -> 0 ->> 'me')::boolean = false, 'someone else''s row');

-- Saved state (user_state): the server's clock, no-op saves, the key cap, own rows only.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into user_state (user_id, key, value, updated_at) values ('00000000-0000-0000-0000-0000000000f1', 'plan', '"a"', '2001-01-01');
select pg_temp.check((select updated_at > now() - interval '1 minute' from user_state where key = 'plan'), 'insert stamped by the server');
update user_state set updated_at = '2001-01-01' where key = 'plan';
select pg_temp.check((select updated_at > '2002-01-01' from user_state where key = 'plan'), 'stamp not settable by an update');
reset role;
alter table app.user_state disable trigger user_state_before_write;
update app.user_state set updated_at = '2001-01-01' where key = 'plan';
alter table app.user_state enable trigger user_state_before_write;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f1', 'plan', '"a"')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select updated_at = '2001-01-01' from user_state where key = 'plan'), 'unchanged value not rewritten');
insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f1', 'plan', '"b"')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select value = '"b"' and updated_at > '2002-01-01' from user_state where key = 'plan'), 'changed value saved and stamped');
select pg_temp.check(pg_temp.fails($$insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f1', 'Bad Key', '1')$$, 'user_state_key_check'), 'key format');
select pg_temp.check(pg_temp.fails($$insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f2', 'plan', '1')$$, 'row-level security'), 'not someone else''s state');
reset role;
insert into app.user_state (user_id, key, value)
select '00000000-0000-0000-0000-0000000000f1', 'reading:k' || g, '1' from generate_series(1, 2999) g;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(pg_temp.fails($$insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f1', 'reading:one-too-many', '1')$$, 'progress_full'), 'key cap');
insert into user_state (user_id, key, value) values ('00000000-0000-0000-0000-0000000000f1', 'reading:k1', '2')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select value = '2' from user_state where key = 'reading:k1'), 'existing key saves at the cap');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) = 0 from user_state), 'others'' state private');

-- Readiness: stamped by the server; the class average only once 3 classmates have one.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into block_readiness (user_id, block, value, updated_at) values ('00000000-0000-0000-0000-0000000000f1', '4.1', 50, '2001-01-01');
select pg_temp.check((select updated_at > '2002-01-01' from block_readiness), 'readiness stamped');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into block_readiness (user_id, block, value) values ('00000000-0000-0000-0000-0000000000f2', '4.1', 70);
select pg_temp.check((select count(*) = 1 from block_readiness), 'own readiness only');
select pg_temp.check(class_readiness('4.1') = '{"cohort": "2029", "count": 2, "average": null}', 'no average under 3');
reset role;
select pg_temp.account('00000000-0000-0000-0000-0000000000f3', 'PSTUDY3', 'Kai Third', cohort => '2029');
insert into app.block_readiness (user_id, block, value) values ('00000000-0000-0000-0000-0000000000f3', '4.1', 90);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(class_readiness('4.1') = '{"cohort": "2029", "count": 3, "average": 70}', 'average from 3');
reset role;
\echo study tests passed
