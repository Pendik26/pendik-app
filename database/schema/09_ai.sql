-- The AI allowance: answers per student per UTC day, used by the `ai` Edge Function only.

create table public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  count   int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
create policy ai_usage_own on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
grant select on public.ai_usage to authenticated;

-- Takes one answer from today's allowance. Returns what's left, or -1 when there's none.
create or replace function public.ai_take(p_user_id uuid, p_daily_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  used int;
begin
  insert into public.ai_usage (user_id, day, count) values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
    where public.ai_usage.count < p_daily_limit
  returning count into used;
  if used is null then return -1; end if;
  delete from public.ai_usage where user_id = p_user_id and day < (now() at time zone 'utc')::date - 2;
  return p_daily_limit - used;
end;
$$;

-- Gives an answer back when the AI failed to produce one.
create or replace function public.ai_refund(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set count = greatest(0, count - 1)
   where user_id = p_user_id and day = (now() at time zone 'utc')::date;
$$;

revoke execute on function public.ai_take(uuid, int), public.ai_refund(uuid) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, int), public.ai_refund(uuid) to service_role;
