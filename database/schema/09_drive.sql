-- Class Drive: every file in the class's Google Drive folder, copied in by the `drive-sync` Edge
-- Function (daily from GitHub Actions, or from the admin page).
--
-- Block, category and subject come from the folder path:
--   [SEMESTER n /] [REGULER | IUP /] BLOK x.y <name> / <category> / [<subject> / ...] <file>
-- A file the sync no longer finds is marked missing (missing_since), not deleted, and comes back
-- if it reappears. Admins can hide a file (hidden_at) and put files in an order of their own
-- within a folder (sort_order); the sync never touches either column. `track` isn't enforced:
-- the app shows a student their class's folders and can show the other's too. `block` is the
-- folder's block number as written, not a reference: the Drive may hold blocks the app doesn't.

create table app.drive_files (
  id                uuid primary key default gen_random_uuid(),
  drive_file_id     text not null unique,
  title             text not null,
  -- pdf, slide, doc, sheet, video, audio, image, youtube, file
  kind              text not null default 'file',
  semester          int,
  track             text,           -- 'REGULER' or 'IUP'
  block             text,           -- '1.1'
  block_name        text,
  category          text,           -- e.g. 'PPT DOSEN'
  subject           text,
  folder_path       text[] not null default '{}',
  mime_type         text,
  size_bytes        bigint,
  web_url           text,
  youtube_id        text,
  drive_modified_at timestamptz,
  synced_at         timestamptz not null default now(),
  missing_since     timestamptz,
  hidden_at         timestamptz,
  -- Lower first; files with no order come after, by name.
  sort_order        int check (sort_order between 0 and 9999),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger drive_files_touch before update on app.drive_files
  for each row execute function app.touch_updated_at();
create index drive_files_block on app.drive_files (block, category, subject)
  where missing_since is null and hidden_at is null;

-- One row per sync. A sync can take several calls (Edge Functions have a time limit); `cursor`
-- holds the folders still to visit.
create table app.drive_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'running' check (status in ('running', 'done', 'failed', 'held')),
  started_by     text not null check (started_by in ('schedule', 'admin')),
  cursor         jsonb not null default '[]',
  files_found    int not null default 0,
  files_added    int not null default 0,
  files_updated  int not null default 0,
  files_missing  int not null default 0,
  calls          int not null default 0,
  notes          jsonb not null default '{}',
  error          text,
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create trigger drive_sync_runs_touch before update on app.drive_sync_runs
  for each row execute function app.touch_updated_at();
create unique index drive_sync_one_running on app.drive_sync_runs ((true)) where status = 'running';

alter table app.drive_files enable row level security;
alter table app.drive_sync_runs enable row level security;

create policy drive_files_read on app.drive_files for select to authenticated
  using ((missing_since is null and hidden_at is null) or (select public.is_admin()));
create policy drive_files_admin_arrange on app.drive_files for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy drive_sync_runs_admin on app.drive_sync_runs for select to authenticated
  using ((select public.is_admin()));

grant select on app.drive_files, app.drive_sync_runs to authenticated;
-- Admins only hide and order files; everything else is the sync's.
grant update (hidden_at, sort_order) on app.drive_files to authenticated;
grant select, insert, update on app.drive_files, app.drive_sync_runs to service_role;

-- ---------------------------------------------------------------------------------------------
-- API

create view public.drive_files
with (security_invoker = on) as
select id, drive_file_id, title, kind, semester, track, block, block_name, category, subject, folder_path, mime_type,
       size_bytes, web_url, youtube_id, drive_modified_at, synced_at, missing_since, hidden_at, sort_order, created_at,
       updated_at
  from app.drive_files;

create view public.drive_sync_runs
with (security_invoker = on) as
select id, status, started_by, cursor, files_found, files_added, files_updated, files_missing, calls, notes, error,
       started_at, updated_at, finished_at
  from app.drive_sync_runs;

revoke all on public.drive_files, public.drive_sync_runs from public, anon, authenticated;
grant select on public.drive_files, public.drive_sync_runs to authenticated;
grant update (hidden_at, sort_order) on public.drive_files to authenticated;
grant select, insert, update on public.drive_files, public.drive_sync_runs to service_role;

-- For the drive-sync function (service role): the steps a sync takes in bulk.

-- Marks the saved video rows of these Docs as seen (the Docs didn't change, so weren't re-read).
create function public.drive_touch_videos(p_doc_ids text[], p_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.drive_files set synced_at = p_at, missing_since = null
   where kind = 'youtube' and split_part(drive_file_id, ':', 2) = any(p_doc_ids);
$$;

-- Files shown now, and how many of them a run that started at p_since hasn't seen.
create function public.drive_counts(p_since timestamptz)
returns table (live int, unseen int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, (count(*) filter (where synced_at < p_since))::int
    from app.drive_files where missing_since is null;
$$;

create function public.drive_mark_missing(p_since timestamptz)
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    update app.drive_files set missing_since = now()
     where missing_since is null and synced_at < p_since
    returning 1
  )
  select count(*)::int from gone;
$$;

grant execute on function public.drive_touch_videos(text[], timestamptz), public.drive_counts(timestamptz),
  public.drive_mark_missing(timestamptz) to service_role;
