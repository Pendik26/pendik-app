-- Admin: the roster with account states, roles, and the audit log. Creating, locking and
-- resetting accounts needs the service role: Edge Function `admin-accounts`.

-- The roster with each student's account state: none (not activated), active or locked.
create function public.admin_list_roster()
returns table (student_id text, full_name text, class_group text, cohort text, track text, user_id uuid, role text,
               account text, must_change_password boolean, google_linked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  return query
  select s.nim, s.full_name, s.class_group, s.cohort, s.track::text, a.id, a.role::text,
         case when a.id is null then 'none'
              when u.banned_until is not null and u.banned_until > now() then 'locked'
              else 'active' end,
         a.must_change_password,
         exists (select 1 from auth.identities i where i.user_id = a.id and i.provider = 'google')
    from app.students s
    left join app.accounts a on a.nim = s.nim
    left join auth.users u on u.id = a.id
   order by s.track nulls last, s.class_group nulls last, s.full_name;
end;
$$;

-- Admins can't change their own role, and there must always be at least one admin.
create function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  if p_role not in ('student', 'admin') then raise exception 'bad_role'; end if;
  if p_user_id = auth.uid() then raise exception 'not_on_yourself'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-roles', 0));
  update app.accounts set role = p_role::app.role where id = p_user_id;
  if not found then raise exception 'no_such_account'; end if;
  if not exists (select 1 from app.accounts where role = 'admin') then raise exception 'last_admin'; end if;
  perform app.audit('account.role', p_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

-- For the admin-accounts Edge Function (service role): records what an admin did to an account.
create function public.audit_account_action(p_actor uuid, p_action text, p_target text, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.audit_log (actor, action, target, detail)
  values (p_actor, 'account.' || p_action, p_target, coalesce(p_detail, '{}'));
$$;

-- The newest 200 entries of the audit log, with who did it.
create function public.admin_audit_log()
returns table (id bigint, created_at timestamptz, actor_name text, action text, target text, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  return query
  select l.id, l.created_at, s.full_name, l.action, l.target, l.detail
    from app.audit_log l
    left join app.accounts a on a.id = l.actor
    left join app.students s on s.nim = a.nim
   order by l.created_at desc
   limit 200;
end;
$$;

grant execute on function public.admin_list_roster(), public.admin_set_role(uuid, text), public.admin_audit_log()
  to authenticated;
grant execute on function public.audit_account_action(uuid, text, text, jsonb) to service_role;
