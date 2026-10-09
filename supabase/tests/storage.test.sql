-- Progress storage (server-stamped, no-op saves, the key cap) and the first-admin seed.
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

-- The first-admin seed (supabase/seeds/first-admin.sql), with a made-up student.
\set nim 'PADMIN1'
\set full_name 'Ada Admin'
\set cohort '2026'
\ir ../seeds/first-admin.sql
select pg_temp.check((select full_name = 'Ada Admin' and cohort = '2026' from roster where student_id = 'PADMIN1'), 'first admin on the roster');
\ir ../seeds/first-admin.sql
select pg_temp.check((select count(*) = 1 from roster where student_id = 'PADMIN1'), 'seed runs twice');
select pg_temp.check(current_setting('pendik.first_admin_password') = '', 'seed forgets the password');
-- Once their account exists, the seed makes it an admin.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'padmin1@pendik26.internal');
insert into profiles (id, student_id, full_name, role) values ('00000000-0000-0000-0000-0000000000c1', 'PADMIN1', 'Ada Admin', 'student');
\ir ../seeds/first-admin.sql
select pg_temp.check((select role = 'admin' from profiles where student_id = 'PADMIN1'), 'seed makes the account an admin');
\unset nim
\unset full_name
\unset cohort
\unset password

-- A student's progress.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 's@pendik26.internal');
insert into roster (student_id, full_name) values ('PSTORE', 'Sam Store');
insert into profiles (id, student_id, full_name) values ('00000000-0000-0000-0000-0000000000c2', 'PSTORE', 'Sam Store');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');

-- The server's clock, whatever the browser sends.
insert into progress (user_id, key, value, updated_at)
values ('00000000-0000-0000-0000-0000000000c2', 'theme', '"dark"', '2001-01-01');
select pg_temp.check((select updated_at > now() - interval '1 minute' from progress where key = 'theme'), 'insert stamped by the server');

-- Saving the same value writes nothing; a new value is stamped again.
update progress set updated_at = '2001-01-01' where key = 'theme';
select pg_temp.check((select updated_at > '2002-01-01' from progress where key = 'theme'), 'stamp not settable by an update');
reset role;
alter table progress disable trigger progress_before_write;
update progress set updated_at = '2001-01-01' where key = 'theme';
alter table progress enable trigger progress_before_write;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
insert into progress (user_id, key, value) values ('00000000-0000-0000-0000-0000000000c2', 'theme', '"dark"')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select updated_at = '2001-01-01' from progress where key = 'theme'), 'unchanged value not rewritten');
insert into progress (user_id, key, value) values ('00000000-0000-0000-0000-0000000000c2', 'theme', '"light"')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select value = '"light"' and updated_at > '2002-01-01' from progress where key = 'theme'), 'changed value saved and stamped');

-- Unchanged quiz scores aren't rescored, changed ones are.
insert into progress (user_id, key, value) values ('00000000-0000-0000-0000-0000000000c2', 'quiz:1.1/anatomy', '[{"score":3,"total":5}]')
  on conflict (user_id, key) do update set value = excluded.value;
reset role;
select pg_temp.check((select correct_answers = 3 from leaderboard_parts where source = 'quiz:1.1/anatomy'), 'quiz scored');

-- At most 3000 keys; existing keys can still be saved at the cap.
insert into progress (user_id, key, value)
select '00000000-0000-0000-0000-0000000000c2', 'reading:k' || g, '1' from generate_series(1, 2998) g;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(pg_temp.fails($$insert into progress (user_id, key, value) values ('00000000-0000-0000-0000-0000000000c2', 'reading:one-too-many', '1')$$, 'progress_full'), 'key cap');
insert into progress (user_id, key, value) values ('00000000-0000-0000-0000-0000000000c2', 'reading:k1', '2')
  on conflict (user_id, key) do update set value = excluded.value;
select pg_temp.check((select value = '2' from progress where key = 'reading:k1'), 'existing key saves at the cap');
reset role;

-- Readiness is stamped by the server too.
insert into block_readiness (user_id, block, value, updated_at) values ('00000000-0000-0000-0000-0000000000c2', '1.1', 50, '2001-01-01');
select pg_temp.check((select updated_at > '2002-01-01' from block_readiness where user_id = '00000000-0000-0000-0000-0000000000c2'), 'readiness stamped');

\echo storage tests passed
