-- Class Drive: who sees which files, and the sync's bulk steps.
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
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000da', 'dadm@pendik26.internal'),
  ('00000000-0000-0000-0000-0000000000d1', 'dstu@pendik26.internal');
insert into roster (student_id, full_name) values ('DADM', 'Drive Admin'), ('DSTU', 'Drive Student');
insert into profiles (id, student_id, full_name, role, must_change_password) values
  ('00000000-0000-0000-0000-0000000000da', 'DADM', 'Drive Admin', 'admin', false),
  ('00000000-0000-0000-0000-0000000000d1', 'DSTU', 'Drive Student', 'student', false);

insert into drive_files (drive_file_id, title, kind, block, folder_path, synced_at) values
  ('f1', 'Epitel.pdf', 'pdf', '1.1', '{BLOK 1.1,PPT}', '2026-01-01'),
  ('f2', 'Old.pdf', 'pdf', '1.1', '{BLOK 1.1,PPT}', '2026-01-01'),
  ('d1', 'Links', 'doc', '1.1', '{BLOK 1.1,REKAMAN}', '2026-01-01'),
  ('youtube:d1:dQw4w9WgXcQ', 'Links (video)', 'youtube', '1.1', '{BLOK 1.1,REKAMAN}', '2026-01-01');

-- A sync that started on 2026-02-01 saw f1 and d1 (unchanged), not f2.
set role service_role;
update drive_files set synced_at = '2026-02-01 00:00:05' where drive_file_id in ('f1', 'd1');
select drive_touch_videos(array['d1'], '2026-02-01 00:00:05');
select pg_temp.check((select live = 4 and unseen = 1 from drive_counts('2026-02-01')), 'one unseen file');
select pg_temp.check(drive_mark_missing('2026-02-01') = 1, 'marks the unseen file missing');
select pg_temp.check((select missing_since is not null from drive_files where drive_file_id = 'f2'), 'f2 is missing');
reset role;

-- Students see shown files only, can't hide or sync; admins see everything and can hide.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from drive_files) = 3, 'student sees the 3 shown files');
select pg_temp.check(pg_temp.fails($$select drive_mark_missing(now())$$, 'permission denied'), 'student cannot run sync steps');
update drive_files set hidden_at = now() where drive_file_id = 'f1';
select pg_temp.check((select count(*) from drive_files where hidden_at is null) = 3, 'student cannot hide');
select pg_temp.check((select count(*) from drive_sync_runs) = 0, 'student sees no runs');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000da');
select pg_temp.check((select count(*) from drive_files) = 4, 'admin sees missing files too');
update drive_files set hidden_at = now() where drive_file_id = 'f1';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from drive_files) = 2, 'a hidden file is gone for students');
reset role;
\echo drive tests passed
