-- Tightening how progress and the question tables are stored.
--
-- - `progress.updated_at` and `block_readiness.updated_at` are the server's clock, not the
--   browser's, so the app can ask for "what changed since I last looked" (src/lib/progressSync.ts).
-- - Saving a progress value that didn't change writes nothing (no new row version, no rescoring).
-- - A student can keep at most 3000 progress keys: far more than the app ever makes, but a cap on
--   what one account can store.
-- - Indexes for the foreign keys that are looked up or cascaded through, and for the weekly board.

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

create trigger block_readiness_touch before insert or update on public.block_readiness
  for each row execute function public.touch_updated_at();

create index package_questions_question on public.package_questions (question_id);
create index bookmarks_question on public.bookmarks (question_id);
create index attempts_package on public.attempts (package_id) where package_id is not null;
create index leaderboard_daily_day on public.leaderboard_daily (day);

revoke execute on function public.progress_before_write() from public, anon, authenticated;
