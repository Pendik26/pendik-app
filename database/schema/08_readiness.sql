-- Readiness against the class: each student's exam readiness per block (worked out in the app),
-- and the class average, shown only once at least 3 classmates have one.

create table public.block_readiness (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  block      text not null check (block ~ '^[0-9]+\.[0-9]+$'),
  value      numeric(4, 1) not null check (value between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, block)
);

-- The server's clock, whatever the browser sends.
create trigger block_readiness_touch before insert or update on public.block_readiness
  for each row execute function public.touch_updated_at();

alter table public.block_readiness enable row level security;
revoke all on public.block_readiness from anon, authenticated;
create policy block_readiness_own on public.block_readiness for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.block_readiness to authenticated;

create or replace function public.class_readiness(p_block text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select cohort from public.profiles where id = auth.uid()),
  agg as (
    select count(*)::int as n, avg(br.value) as average
      from public.block_readiness br
      join public.profiles pr on pr.id = br.user_id
     where br.block = p_block and pr.cohort is not distinct from (select cohort from me)
  )
  select jsonb_build_object(
    'cohort', (select cohort from me),
    'count', n,
    'average', case when n >= 3 then round(average) end
  ) from agg;
$$;

revoke execute on function public.class_readiness(text) from public, anon, authenticated;
grant execute on function public.class_readiness(text) to authenticated;
