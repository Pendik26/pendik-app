-- The foundation: two schemas, shared helpers, and the audit log.
--
-- - `app` holds every table. It is not one of the schemas the Data API serves, so nothing in it
--   is reachable from a browser unless a view or function in `public` hands it out.
-- - `public` is the API: views (running as the caller, so row level security still applies) and
--   functions. A new table is private until someone deliberately puts a view or function here.
-- Row level security stays on for every table in `app` as a second wall.

create schema app;
revoke all on schema app from public;
-- Views in `public` run as the caller, who needs to see the tables underneath; the tables' grants
-- and policies decide what. anon gets nothing: every page needs a sign-in.
grant usage on schema app to authenticated, service_role;
-- Nothing new is open by default (Supabase's own defaults grant every new table and function in
-- `public` to anon and authenticated): each view and function grants exactly who may use it.
-- (Postgres lets every role run every new function; that default can only be removed globally.)
alter default privileges revoke execute on functions from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke execute on functions from anon, authenticated;
  end if;
end $$;

-- Today's date on the server's clock, in UTC. Every "per day" rule uses this, never the browser's.
create function app.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'utc')::date;
$$;

create function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- What admins did: role changes, imports, publishing, roster edits, account actions. Written by
-- the functions that do those things (and by the admin-accounts Edge Function); read on Admin.
create table app.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,                 -- the admin's account, or null for the system
  action     text not null check (action ~ '^[a-z_.]+$'),
  target     text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_created on app.audit_log (created_at desc);

alter table app.audit_log enable row level security;

create function app.audit(p_action text, p_target text default null, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.audit_log (actor, action, target, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'));
$$;

grant execute on function app.today(), app.touch_updated_at() to authenticated, service_role;
