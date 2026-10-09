-- Tracks: Pendik 26 is two classes, IUP and Reguler, in one app.
--
-- A student's track is on the roster (and copied to their profile, which the app reads at
-- sign-in). A student with no track sees everything. Packages can be for one track only; an empty
-- track means both. The Class Drive already knows each file's track from its folder
-- (`drive_files.track`); the app filters that itself, since the other track's files aren't secret.

alter table public.roster add column track text check (track in ('IUP', 'REGULER'));
alter table public.profiles add column track text check (track in ('IUP', 'REGULER'));
alter table public.packages add column track text check (track in ('IUP', 'REGULER'));

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

-- Whether the caller can see a package of this track.
create or replace function public.track_visible(p_track text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_track is null or public.my_track() is null or p_track = public.my_track() or public.is_admin();
$$;

drop policy packages_read on public.packages;
create policy packages_read on public.packages for select to authenticated
  using ((status = 'published' and deleted_at is null and public.track_visible(track)) or (select public.is_admin()));

-- The same view as before, plus the track and the track filter.
drop view public.package_summaries;
create view public.package_summaries as
select p.id, p.title, p.block, p.source, p.year, p.mode, p.time_limit_minutes, p.track_best,
       p.status, p.created_at, p.updated_at,
       (select count(*)::int from public.package_questions pq
          join public.questions q on q.id = pq.question_id and q.deleted_at is null
         where pq.package_id = p.id) as question_count,
       p.track
from public.packages p
where p.deleted_at is null
  and ((p.status = 'published' and public.track_visible(p.track)) or (select public.is_admin()));

revoke all on public.package_summaries from anon, authenticated;
grant select on public.package_summaries to authenticated;

-- The roster with each student's account state, now with the track.
drop function public.admin_list_roster();
create function public.admin_list_roster()
returns table (student_id text, full_name text, class_group text, cohort text, track text, user_id uuid, role text,
               account text, must_change_password boolean, google_linked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select r.student_id, r.full_name, r.class_group, r.cohort, r.track, p.id, p.role,
         case when p.id is null then 'none'
              when u.banned_until is not null and u.banned_until > now() then 'locked'
              else 'active' end,
         p.must_change_password,
         exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
    from public.roster r
    left join public.profiles p on p.student_id = r.student_id
    left join auth.users u on u.id = p.id
   order by r.track nulls last, r.class_group nulls last, r.full_name;
end;
$$;

revoke execute on function public.profiles_take_track(), public.roster_push_track(), public.my_track(),
  public.track_visible(text), public.admin_list_roster() from public, anon;
revoke execute on function public.profiles_take_track(), public.roster_push_track() from authenticated;
grant execute on function public.my_track(), public.track_visible(text), public.admin_list_roster() to authenticated;
