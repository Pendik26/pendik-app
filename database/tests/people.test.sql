-- People: the first-admin seed, the roster, accounts and settings, roles, the audit log, and the
-- walls around the private `app` schema.
\ir helpers.sql

-- The walls. Every table lives in `app` with row level security on; every view in `public` runs
-- as the caller; signed-out callers can reach nothing at all.
select pg_temp.check(not exists (select 1 from pg_tables where schemaname = 'public'), 'no tables in public');
select pg_temp.check(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity), 'RLS on every app table');
select pg_temp.check(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where n.nspname = 'public' and c.relkind = 'v'
                                    and not coalesce(c.reloptions @> array['security_invoker=on'], false)), 'every public view runs as the caller');
select pg_temp.check(not has_schema_privilege('anon', 'app', 'usage'), 'anon cannot use app');
select pg_temp.check(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where n.nspname = 'public' and c.relkind = 'v'
                                    and has_table_privilege('anon', c.oid, 'select')), 'anon reads no view');
select pg_temp.check(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute')),
                     'anon runs no function');
select pg_temp.check(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname in ('public', 'app') and p.prosecdef
                                    and not coalesce(p.proconfig @> array['search_path=""'], false)),
                     'every security definer function pins its search_path');

-- The first-admin seed (database/seeds/first-admin.sql), with a made-up student.
\set nim 'PADMIN1'
\set full_name 'Ada Admin'
\set cohort '2027'
\ir ../seeds/first-admin.sql
select pg_temp.check((select full_name = 'Ada Admin' and cohort = '2027' from app.students where nim = 'PADMIN1'), 'first admin on the roster');
select pg_temp.check(exists (select 1 from app.cohorts where id = '2027'), 'seed creates the cohort');
\ir ../seeds/first-admin.sql
select pg_temp.check((select count(*) = 1 from app.students where nim = 'PADMIN1'), 'seed runs twice');
select pg_temp.check(current_setting('pendik.first_admin_password') = '', 'seed forgets the password');
-- Once their account exists, the seed makes it an admin.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'padmin1@pendik26.internal');
insert into app.accounts (id, nim) values ('00000000-0000-0000-0000-0000000000e1', 'PADMIN1');
\ir ../seeds/first-admin.sql
select pg_temp.check((select role = 'admin' from app.accounts where nim = 'PADMIN1'), 'seed makes the account an admin');
\unset nim
\unset full_name
\unset cohort

-- The roster, written by an admin through the students view.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into students (student_id, full_name, cohort, track, class_group) values (' PNEW1 ', ' Nia New ', '2028', 'IUP', 'C');
select pg_temp.check((select full_name = 'Nia New' and cohort = '2028' and track = 'IUP' from students where student_id = 'PNEW1'), 'roster add, trimmed');
select pg_temp.check(exists (select 1 from app.cohorts where id = '2028'), 'new cohort created on first use');
-- Adding again updates (an import of the whole class can be re-run).
insert into students (student_id, full_name, cohort) values ('PNEW1', 'Nia Newer', '2028');
select pg_temp.check((select full_name = 'Nia Newer' and track = 'IUP' from students where student_id = 'PNEW1'), 'roster re-add updates, keeps the track');
select pg_temp.check((select count(*) >= 2 from admin_audit_log() where target = 'PNEW1'), 'roster edits audited');
-- A student with an account can't be removed.
select pg_temp.check(pg_temp.fails($$delete from students where student_id = 'PADMIN1'$$, 'student_has_account'), 'cannot remove an activated student');
select pg_temp.check((select account = 'active' and role = 'admin' from admin_list_roster() where student_id = 'PADMIN1'), 'roster lists the account');
select pg_temp.check((select account = 'none' from admin_list_roster() where student_id = 'PNEW1'), 'not activated yet');

-- A student: their own account and settings only.
reset role;
select pg_temp.account('00000000-0000-0000-0000-0000000000e2', 'PSTU1', 'Sam Student', cohort => '2028');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check((select student_id = 'PSTU1' and full_name = 'Sam Student' and role = 'student' and not leaderboard_joined
                        from my_account), 'my_account');
select pg_temp.check((select count(*) = 1 from my_account), 'only their own account');
select pg_temp.check((select count(*) = 1 from students), 'only their own roster row');
select pg_temp.check(pg_temp.fails($$insert into students (student_id, full_name) values ('PHACK', 'Hack')$$, 'admins_only'), 'students cannot add to the roster');
select pg_temp.check(pg_temp.fails($$select * from accounts$$, 'permission denied'), 'accounts view is for the service role');
select pg_temp.check(pg_temp.fails($$select admin_list_roster()$$, 'admins_only'), 'students cannot list the roster');
select pg_temp.check(pg_temp.fails($$select admin_audit_log()$$, 'admins_only'), 'students cannot read the audit log');
select pg_temp.check(pg_temp.fails($$select admin_set_role('00000000-0000-0000-0000-0000000000e2', 'admin')$$, 'admins_only'), 'no self promotion');
select pg_temp.check(pg_temp.fails($$update app.accounts set role = 'admin'$$, 'permission denied'), 'accounts not writable');
select update_my_settings('Sammy', true);
select pg_temp.check((select display_name = 'Sammy' and leaderboard_joined from my_account), 'settings saved');
select update_my_settings(null, false);
select pg_temp.check((select display_name = 'Sammy' and not leaderboard_joined from my_account), 'null keeps a setting');
reset role;
update app.accounts set must_change_password = true where id = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select password_changed();
select pg_temp.check((select not must_change_password from my_account), 'password changed');

-- Roles: an admin promotes and demotes others, never the last admin.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select admin_set_role('00000000-0000-0000-0000-0000000000e2', 'admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.check((select role = 'admin' from my_account), 'promoted');
select admin_set_role('00000000-0000-0000-0000-0000000000e1', 'student');
select pg_temp.check(pg_temp.fails($$select admin_set_role('00000000-0000-0000-0000-0000000000e2', 'student')$$, 'not_on_yourself'), 'not on yourself');
select pg_temp.check((select count(*) >= 2 from admin_audit_log() where action = 'account.role'), 'role changes audited');
select admin_set_role('00000000-0000-0000-0000-0000000000e1', 'admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select admin_set_role('00000000-0000-0000-0000-0000000000e2', 'student');

-- The admin-accounts function (service role) reads the roster and accounts and writes the log.
select pg_temp.as_service();
select pg_temp.check((select count(*) >= 2 from students), 'service role reads the roster');
select pg_temp.check((select role = 'admin' from accounts where student_id = 'PADMIN1'), 'service role reads accounts');
insert into accounts (id, student_id) select '00000000-0000-0000-0000-0000000000e3', 'PNEW1'
  where false; -- the function inserts through this view; only checking the grant here
select audit_account_action('00000000-0000-0000-0000-0000000000e1', 'lock', 'PSTU1');
reset role;
select pg_temp.check((select count(*) = 1 from app.audit_log where action = 'account.lock'), 'account action logged');

-- Signed out: nothing.
select pg_temp.as_user(null);
select pg_temp.check(pg_temp.fails('select * from my_account', 'permission denied'), 'anon has no account');
select pg_temp.check(pg_temp.fails('select * from app.students', 'permission denied'), 'anon cannot reach app');
reset role;
\echo people tests passed
