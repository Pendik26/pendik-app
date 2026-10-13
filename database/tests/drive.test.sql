-- Class Drive (sync steps, hidden and missing files) and the AI allowance.
\ir helpers.sql

select pg_temp.account('00000000-0000-0000-0000-0000000000da', 'DADM', 'Drive Admin', 'admin');
select pg_temp.account('00000000-0000-0000-0000-0000000000d1', 'DSTU', 'Drive Student');

-- The sync writes as the service role.
select pg_temp.as_service();
insert into drive_files (drive_file_id, title, kind, block, folder_path, synced_at) values
  ('f1', 'Epitel.pdf', 'pdf', '1.1', '{BLOK 1.1,PPT}', '2026-01-01'),
  ('f2', 'Old.pdf', 'pdf', '1.1', '{BLOK 1.1,PPT}', '2026-01-01'),
  ('d1', 'Links', 'doc', '1.1', '{BLOK 1.1,REKAMAN}', '2026-01-01'),
  ('youtube:d1:dQw4w9WgXcQ', 'Links (video)', 'youtube', '1.1', '{BLOK 1.1,REKAMAN}', '2026-01-01');
insert into drive_sync_runs (started_by) values ('schedule');

-- A sync that started on 2026-02-01 saw f1 and d1 (unchanged), not f2.
update drive_files set synced_at = '2026-02-01 00:00:05' where drive_file_id in ('f1', 'd1');
select drive_touch_videos(array['d1'], '2026-02-01 00:00:05');
select pg_temp.check((select live = 4 and unseen = 1 from drive_counts('2026-02-01')), 'one unseen file');
select pg_temp.check(drive_mark_missing('2026-02-01') = 1, 'marks the unseen file missing');
select pg_temp.check((select missing_since is not null from drive_files where drive_file_id = 'f2'), 'f2 is missing');
select pg_temp.check(pg_temp.fails($$insert into drive_sync_runs (started_by) values ('admin')$$, 'drive_sync_one_running'), 'one sync at a time');

-- Students see shown files only, can't hide or sync; admins see everything and can hide.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from drive_files) = 3, 'student sees the 3 shown files');
select pg_temp.check(pg_temp.fails($$select drive_mark_missing(now())$$, 'permission denied'), 'student cannot run sync steps');
update drive_files set hidden_at = now() where drive_file_id = 'f1';
select pg_temp.check((select count(*) from drive_files where hidden_at is null) = 3, 'student cannot hide');
select pg_temp.check(pg_temp.fails($$update drive_files set title = 'x'$$, 'permission denied'), 'only hide and order are editable');
select pg_temp.check((select count(*) from drive_sync_runs) = 0, 'student sees no runs');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000da');
select pg_temp.check((select count(*) from drive_files) = 4, 'admin sees missing files too');
select pg_temp.check((select count(*) from drive_sync_runs) = 1, 'admin sees runs');
update drive_files set hidden_at = now(), sort_order = 1 where drive_file_id = 'f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select count(*) from drive_files) = 2, 'a hidden file is gone for students');

-- The AI allowance: per account per day, only through the service role.
select pg_temp.check(pg_temp.fails($$select ai_take('00000000-0000-0000-0000-0000000000d1', 2)$$, 'permission denied'), 'students cannot take allowance');
select pg_temp.as_service();
select pg_temp.check(ai_take('00000000-0000-0000-0000-0000000000d1', 2) = 1, 'first answer, one left');
select pg_temp.check(ai_take('00000000-0000-0000-0000-0000000000d1', 2) = 0, 'second answer, none left');
select pg_temp.check(ai_take('00000000-0000-0000-0000-0000000000d1', 2) = -1, 'out for today');
select ai_refund('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check(ai_take('00000000-0000-0000-0000-0000000000d1', 2) = 0, 'refund gives one back');
select pg_temp.check(ai_take('00000000-0000-0000-0000-0000000000ff', 2) = -1, 'no account, no answers');
reset role;
\echo drive tests passed
