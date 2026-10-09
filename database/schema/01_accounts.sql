-- Accounts: the class roster, one profile per activated student, the admin check, and the
-- student's class (track: IUP or Reguler).
--
-- Only students on the roster can have an account. An admin activates them (Edge Function
-- `admin-accounts`), which creates the Supabase Auth user and its profile. Students sign in with
-- their student id (NIM) as `<nim>@pendik26.internal`, and can link Google afterwards.
--
-- A student's track is on the roster and copied to their profile (which the app reads at
-- sign-in); a student with no track sees everything.

-- The class list. Admin only: students never read it.
create table public.roster (
  student_id  text primary key check (student_id ~ '^[0-9A-Za-z]{3,30}$'),
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  class_group text check (length(class_group) <= 40),
  cohort      text not null default '2026' check (length(cohort) <= 10),
  created_at  timestamptz not null default now(),
  track       text check (track in ('IUP', 'REGULER'))
);

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  student_id           text not null unique references public.roster(student_id),
  full_name            text not null,
  class_group          text,
  cohort               text,
  role                 text not null default 'student' check (role in ('student', 'admin')),
  must_change_password boolean not null default true,
  -- Settings the student edits from the Account page.
  display_name         text check (length(display_name) between 1 and 40),
  leaderboard_joined   boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Copied from the roster by the triggers below.
  track                text check (track in ('IUP', 'REGULER'))
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A new profile takes its track from the roster; changing the roster's track moves the profile too.
create or replace function public.profiles_take_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select track into new.track from public.roster where student_id = new.student_id;
  return new;
end;
$$;

create trigger profiles_track before insert on public.profiles
  for each row execute function public.profiles_take_track();

create or replace function public.roster_push_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set track = new.track where student_id = new.student_id;
  return new;
end;
$$;

create trigger roster_track after update of track on public.roster
  for each row when (old.track is distinct from new.track) execute function public.roster_push_track();

-- security definer so RLS policies can call it without recursing into profiles' own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- The caller's track, or null (no track, or not signed in).
create or replace function public.my_track()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select track from public.profiles where id = (select auth.uid());
$$;

-- Whether the caller can see a package of this track (null means both).
create or replace function public.track_visible(p_track text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_track is null or public.my_track() is null or p_track = public.my_track() or public.is_admin();
$$;

alter table public.roster enable row level security;
alter table public.profiles enable row level security;

revoke all on public.roster, public.profiles from anon, authenticated;

create policy roster_admin on public.roster for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.roster to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
grant select on public.profiles to authenticated;
-- Students change their profile only through update_my_settings(); admins through admin functions.
grant select, insert, update on public.roster, public.profiles to service_role;

-- The student's own settings. Name, student id, class and role are not theirs to change.
create or replace function public.update_my_settings(
  p_display_name text default null,
  p_leaderboard_joined boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.profiles set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    leaderboard_joined = coalesce(p_leaderboard_joined, leaderboard_joined)
  where id = auth.uid();
end;
$$;

-- Called after the student has set a new password with supabase.auth.updateUser().
create or replace function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke execute on function public.is_admin(), public.update_my_settings(text, boolean), public.password_changed()
  from public, anon;
grant execute on function public.is_admin(), public.update_my_settings(text, boolean), public.password_changed()
  to authenticated;
revoke execute on function public.profiles_take_track(), public.roster_push_track(), public.my_track(),
  public.track_visible(text) from public, anon;
revoke execute on function public.profiles_take_track(), public.roster_push_track() from authenticated;
grant execute on function public.my_track(), public.track_visible(text) to authenticated;
