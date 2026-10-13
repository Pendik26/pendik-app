-- People: cohorts, the class roster (students), and the sign-in accounts of activated students.
--
-- Only students on the roster can have an account. An admin activates them (Edge Function
-- `admin-accounts`), which creates the Supabase Auth user and its account row. Students sign in
-- with their student id (NIM) as `<nim>@pendik26.internal`, and can link Google afterwards.
--
-- A student's name, cohort, class (track) and class group live on `students` only; an account
-- is the sign-in, the role and the student's own settings. A student with no track sees both
-- classes' material.

create type app.track as enum ('IUP', 'REGULER');
create type app.role as enum ('student', 'admin');

-- A year's intake, e.g. '2026'. Leaderboards and class averages are per cohort.
create table app.cohorts (
  id         text primary key check (id ~ '^[0-9A-Za-z-]{1,10}$'),
  created_at timestamptz not null default now()
);

create table app.students (
  nim         text primary key check (nim ~ '^[0-9A-Za-z]{3,30}$'),
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  cohort      text not null references app.cohorts(id) on update cascade,
  track       app.track,
  class_group text check (length(class_group) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index students_cohort on app.students (cohort);

create trigger students_touch before update on app.students
  for each row execute function app.touch_updated_at();

create table app.accounts (
  id                   uuid primary key references auth.users(id) on delete cascade,
  -- A roster row with an account can't be removed: lock the account instead.
  nim                  text not null unique references app.students(nim) on update cascade,
  role                 app.role not null default 'student',
  must_change_password boolean not null default true,
  -- Settings the student edits from the Account page.
  display_name         text check (length(display_name) between 1 and 40),
  leaderboard_joined   boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger accounts_touch before update on app.accounts
  for each row execute function app.touch_updated_at();

-- security definer so policies can call it without recursing into accounts' own policies.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.accounts where id = (select auth.uid()) and role = 'admin');
$$;

-- The caller's account and student row, or nothing.
create function app.me()
returns table (id uuid, nim text, cohort text, track app.track)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.nim, s.cohort, s.track
    from app.accounts a join app.students s on s.nim = a.nim
   where a.id = (select auth.uid());
$$;

-- Whether the caller may see material for this track (null means both classes).
create function app.track_visible(p_track app.track)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_track is null
      or (select m.track from app.me() m) is null
      or p_track = (select m.track from app.me() m)
      or public.is_admin();
$$;

alter table app.cohorts enable row level security;
alter table app.students enable row level security;
alter table app.accounts enable row level security;

create policy cohorts_read on app.cohorts for select to authenticated using (true);
create policy cohorts_admin on app.cohorts for insert to authenticated with check ((select public.is_admin()));

-- Students read their own row; admins read and edit the roster.
create policy students_read on app.students for select to authenticated
  using (nim = (select m.nim from app.me() m) or (select public.is_admin()));
create policy students_insert on app.students for insert to authenticated with check ((select public.is_admin()));
create policy students_update on app.students for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy students_delete on app.students for delete to authenticated using ((select public.is_admin()));

-- Students read their own account. Every change goes through functions or the service role.
create policy accounts_read on app.accounts for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

grant select, insert on app.cohorts to authenticated;
grant select, insert, update, delete on app.students to authenticated;
grant select on app.accounts to authenticated;
grant select, insert, update, delete on app.cohorts, app.students, app.accounts to service_role;

-- Roster edits are audited, whoever makes them.
create function app.students_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.audit('student.remove', old.nim);
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform app.audit('student.add', new.nim, jsonb_build_object('cohort', new.cohort, 'track', new.track));
  elsif (new.full_name, new.cohort, new.track, new.class_group) is distinct from (old.full_name, old.cohort, old.track, old.class_group) then
    perform app.audit('student.change', new.nim,
      jsonb_build_object('cohort', new.cohort, 'track', new.track, 'class_group', new.class_group));
  end if;
  return new;
end;
$$;

create trigger students_audit after insert or update or delete on app.students
  for each row execute function app.students_audit();

-- ---------------------------------------------------------------------------------------------
-- API

-- The signed-in student's account: what the app loads at sign-in.
create view public.my_account
with (security_invoker = on) as
select a.id, a.nim as student_id, s.full_name, s.class_group, s.cohort, s.track::text as track, a.role::text as role,
       a.must_change_password, a.display_name, a.leaderboard_joined
  from app.accounts a
  join app.students s on s.nim = a.nim
 where a.id = (select auth.uid());

-- The roster, for Admin → Students (admins only, by the policies) and the admin-accounts function.
create view public.students
with (security_invoker = on) as
select nim as student_id, full_name, class_group, cohort, track::text as track, created_at
  from app.students;

-- Accounts, for the admin-accounts Edge Function (service role) only.
create view public.accounts
with (security_invoker = on) as
select id, nim as student_id, role, must_change_password, created_at
  from app.accounts;

-- Writing through the view: the cohort is created on first use.
create function app.students_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then raise exception 'admins_only'; end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from app.accounts where nim = old.student_id) then raise exception 'student_has_account'; end if;
    delete from app.students where nim = old.student_id;
    return old;
  end if;
  insert into app.cohorts (id) values (coalesce(nullif(btrim(new.cohort), ''), to_char(app.today(), 'YYYY')))
  on conflict do nothing;
  if tg_op = 'INSERT' then
    insert into app.students (nim, full_name, class_group, cohort, track)
    values (btrim(new.student_id), btrim(new.full_name), nullif(btrim(new.class_group), ''),
            coalesce(nullif(btrim(new.cohort), ''), to_char(app.today(), 'YYYY')), nullif(new.track, '')::app.track)
    on conflict (nim) do update set
      full_name = excluded.full_name, class_group = excluded.class_group, cohort = excluded.cohort,
      track = coalesce(excluded.track, app.students.track);
  else
    update app.students set
      full_name = btrim(new.full_name),
      class_group = nullif(btrim(new.class_group), ''),
      cohort = coalesce(nullif(btrim(new.cohort), ''), cohort),
      track = nullif(new.track, '')::app.track
    where nim = old.student_id;
  end if;
  return new;
end;
$$;

create trigger students_write instead of insert or update or delete on public.students
  for each row execute function app.students_write();

-- The student's own settings. Name, student id, class and role are not theirs to change.
create function public.update_my_settings(p_display_name text default null, p_leaderboard_joined boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update app.accounts set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    leaderboard_joined = coalesce(p_leaderboard_joined, leaderboard_joined)
  where id = auth.uid();
end;
$$;

-- Called after the student has set a new password with supabase.auth.updateUser().
create function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update app.accounts set must_change_password = false where id = auth.uid();
$$;

revoke all on public.my_account, public.students, public.accounts from public, anon, authenticated;
grant select on public.my_account to authenticated;
grant select, insert, update on public.accounts to service_role;
grant select, insert, update, delete on public.students to authenticated, service_role;
grant execute on function public.is_admin(), public.update_my_settings(text, boolean), public.password_changed()
  to authenticated;
grant execute on function public.is_admin() to service_role;
grant execute on function app.me(), app.track_visible(app.track) to authenticated, service_role;
