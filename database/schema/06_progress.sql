-- Study progress, saved on the server only. Each kind of progress is one JSON value per student
-- per key, e.g. key 'flashcards:1.2/anatomy' holds that deck's review state. The keys and their
-- shapes are declared in src/lib/storageSchema.ts.
--
-- - `updated_at` is the server's clock, not the browser's, so the app can ask for "what changed
--   since I last looked" (src/lib/progressSync.ts).
-- - Saving a value that didn't change writes nothing (no new row version, no rescoring).
-- - A student can keep at most 3000 keys, and a value is at most 512 KB.

create table public.progress (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null check (key ~ '^[a-z]+(:[A-Za-z0-9._/-]{1,120})?$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint progress_value_size check (pg_column_size(value) <= 512 * 1024)
);

alter table public.progress enable row level security;
revoke all on public.progress from anon, authenticated;
create policy progress_own on public.progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.progress to authenticated;

create or replace function public.progress_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.value = old.value and new.user_id = old.user_id and new.key = old.key then
      return null;
    end if;
  elsif not exists (select 1 from public.progress where user_id = new.user_id and key = new.key)
    and (select count(*) from public.progress where user_id = new.user_id) >= 3000 then
    raise exception 'progress_full' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger progress_before_write before insert or update on public.progress
  for each row execute function public.progress_before_write();

revoke execute on function public.progress_before_write() from public, anon, authenticated;
