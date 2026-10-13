-- The AI allowance: answers per student per UTC day, used by the `ai` Edge Function only.

create table app.ai_usage (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null,
  count   int not null default 0,
  primary key (user_id, day)
);

alter table app.ai_usage enable row level security;
-- No policies: only the functions below (for the ai Edge Function) touch it.

-- Takes one answer from today's allowance. Returns what's left, or -1 when there's none.
create function public.ai_take(p_user_id uuid, p_daily_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  used int;
begin
  if not exists (select 1 from app.accounts where id = p_user_id) then return -1; end if;
  insert into app.ai_usage (user_id, day, count) values (p_user_id, app.today(), 1)
  on conflict (user_id, day) do update set count = app.ai_usage.count + 1
    where app.ai_usage.count < p_daily_limit
  returning count into used;
  if used is null then return -1; end if;
  delete from app.ai_usage where user_id = p_user_id and day < app.today() - 2;
  return p_daily_limit - used;
end;
$$;

-- Gives an answer back when the AI failed to produce one.
create function public.ai_refund(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.ai_usage set count = greatest(0, count - 1) where user_id = p_user_id and day = app.today();
$$;

grant execute on function public.ai_take(uuid, int), public.ai_refund(uuid) to service_role;
