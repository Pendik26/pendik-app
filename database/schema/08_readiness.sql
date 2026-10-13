-- Readiness against the class: each student's exam readiness per block (worked out in the app
-- from their own study), and the cohort's average, shown only once at least 3 classmates have one.
-- Readiness is the student's own estimate, so it earns nothing and is never ranked.

create table app.block_readiness (
  user_id    uuid not null references app.accounts(id) on delete cascade,
  block      text not null references app.blocks(id),
  value      numeric(4, 1) not null check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, block)
);

-- The server's clock, whatever the browser sends.
create trigger block_readiness_touch before insert or update on app.block_readiness
  for each row execute function app.touch_updated_at();

alter table app.block_readiness enable row level security;
create policy block_readiness_read on app.block_readiness for select to authenticated using (user_id = (select auth.uid()));
create policy block_readiness_add on app.block_readiness for insert to authenticated with check (user_id = (select auth.uid()));
create policy block_readiness_change on app.block_readiness for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on app.block_readiness to authenticated;

-- ---------------------------------------------------------------------------------------------
-- API

create view public.block_readiness
with (security_invoker = on) as
select user_id, block, value, updated_at from app.block_readiness;

revoke all on public.block_readiness from public, anon, authenticated;
grant select, insert, update on public.block_readiness to authenticated;

create function public.class_readiness(p_block text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select cohort from app.me()),
  agg as (
    select count(*)::int as n, avg(br.value) as average
      from app.block_readiness br
      join app.accounts a on a.id = br.user_id
      join app.students s on s.nim = a.nim
     where br.block = p_block and s.cohort is not distinct from (select cohort from me)
  )
  select jsonb_build_object(
    'cohort', (select cohort from me),
    'count', n,
    'average', case when n >= 3 then round(average) end
  ) from agg;
$$;

grant execute on function public.class_readiness(text) to authenticated;
