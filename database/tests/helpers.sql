-- Shared by every *.test.sql (\ir helpers.sql): small assertions and acting as a user.
\set QUIET on
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;
-- Acts as this account (null: signed out), the way PostgREST does: the role plus the JWT's sub.
create or replace function pg_temp.as_user(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(id::text, ''), false);
  perform set_config('request.jwt.claim.role', '', false);
  execute 'set role ' || case when id is null then 'anon' else 'authenticated' end;
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  set role service_role;
end $$;
-- True when the statement fails with an error containing `expected`.
create or replace function pg_temp.fails(sql text, expected text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(expected in sqlerrm) = 0 then raise exception 'expected "%", got "%"', expected, sqlerrm; end if;
  return true;
end $$;
-- A student on the roster with an activated account.
create or replace function pg_temp.account(id uuid, nim text, full_name text, role text default 'student',
                                           cohort text default '2026', track text default null,
                                           class_group text default null) returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (id, lower(nim) || '@pendik26.internal');
  insert into app.cohorts (id) values (cohort) on conflict do nothing;
  insert into app.students (nim, full_name, cohort, track, class_group) values (nim, full_name, cohort, track::app.track, class_group);
  insert into app.accounts (id, nim, role, must_change_password) values (id, nim, role::app.role, false);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;
