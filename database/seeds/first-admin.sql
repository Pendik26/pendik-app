-- Makes someone an admin: puts them on the roster and, on a real Supabase project, creates their
-- sign-in and an admin account. Who it is comes from psql variables, so no student's NIM or name
-- is ever committed. Run it with `npm run db:first-admin` (see docs/deploying.md, step 6), or:
--
--   psql "$POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 \
--     -v nim=<NIM> -v full_name='<Full Name>' [-v cohort=2026, the default] [-v password=<first password>] \
--     -f database/seeds/first-admin.sql
--
-- The first password defaults to the usual `pendik26` + NIM; the app makes them pick a new one
-- straight away. Safe to run again: whatever already exists is kept, and the account is only made
-- an admin.

\if :{?nim}
\else
  \echo 'first admin: set the NIM with -v nim=... (npm run db:first-admin reads FIRST_ADMIN_NIM)'
  \quit 1
\endif
\if :{?full_name}
\else
  \echo 'first admin: set the name with -v full_name=... (npm run db:first-admin reads FIRST_ADMIN_NAME)'
  \quit 1
\endif
\if :{?cohort}
\else
  \set cohort ''
\endif
\if :{?password}
\else
  \set password ''
\endif

insert into app.cohorts (id) values (coalesce(nullif(:'cohort', ''), '2026')) on conflict do nothing;
insert into app.students (nim, full_name, cohort)
values (:'nim', :'full_name', coalesce(nullif(:'cohort', ''), '2026'))
on conflict (nim) do nothing;

-- psql doesn't fill variables in inside $$ … $$, so hand them to the block as settings.
select set_config('pendik.first_admin_nim', :'nim', false) as nim_setting,
       set_config('pendik.first_admin_password', :'password', false) as password_setting \gset _

do $$
declare
  v_nim constant text := current_setting('pendik.first_admin_nim');
  password constant text := coalesce(nullif(current_setting('pendik.first_admin_password'), ''), 'pendik26' || v_nim);
  login constant text := lower(v_nim) || '@pendik26.internal';
  uid uuid;
begin
  -- An account already activated (from Admin → Students, or by hand): just make sure it's an admin.
  update app.accounts set role = 'admin' where nim = v_nim;
  if found then return; end if;

  -- The test database (database/tests/local-stub.sql) has no real Auth tables: stop at the roster.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    raise notice 'first admin: no Supabase Auth here, only the roster row was added';
    return;
  end if;

  select id into uid from auth.users where email = login;
  if uid is null then
    uid := gen_random_uuid();
    -- The same user Admin → Students → Activate makes (auth.admin.createUser with a confirmed email).
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', login,
      extensions.crypt(password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('student_id', v_nim), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email',
            jsonb_build_object('sub', uid::text, 'email', login, 'email_verified', true), now(), now(), now());
  end if;

  insert into app.accounts (id, nim, role, must_change_password) values (uid, v_nim, 'admin', true);
end $$;

-- Don't leave the password in the session's settings.
select set_config('pendik.first_admin_password', '', false) as password_setting \gset _
