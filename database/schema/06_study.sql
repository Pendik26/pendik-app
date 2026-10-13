-- Studying: the study catalog, the records that earn points, and the student's own saved state.
--
-- Flashcards, image-occlusion figures, quizzes and ebooks live in the repo (content/). The catalog
-- (`study_items`) lists what exists, so the server can check a record before it counts: a card
-- that isn't in a deck, or a quiz answer to a question that doesn't exist, is refused. It's filled
-- from the repo by `npm run db:content` on every deploy.
--
-- What earns points is written only through the functions below, on the server's clock:
-- - card_reviews: one row per card (or occlusion label) per day it was reviewed. A card counts as
--   learned once it has been reviewed on two different days.
-- - quiz_answers: a quiz question answered on a day, graded here against the catalog's key.
-- - chapters_done: an ebook chapter the student finished.
-- - study_days: each day the student studied anything.
--
-- `user_state` is everything else the app keeps per student (review schedules, quiz history,
-- reading positions, plans, settings): the student writes it freely, and nothing reads it for
-- points. Device-only settings (theme, sidebar, language) never leave the browser.

create type app.study_kind as enum ('flashcard', 'occlusion', 'quiz', 'chapter');

create table app.study_items (
  kind       app.study_kind not null,
  deck       text not null check (deck ~ '^[0-9]+\.[0-9]+/[A-Za-z0-9._-]{1,60}$'),  -- "{block}/{subject}"
  item_id    text not null check (length(item_id) between 1 and 160),
  block      text not null references app.blocks(id),
  -- Quizzes: the print position of the right option.
  answer     int,
  -- Set when the item left the repo; records already made keep counting.
  retired_at timestamptz,
  primary key (kind, deck, item_id),
  constraint study_items_quiz_answer check ((kind = 'quiz') = (answer is not null))
);

create table app.card_reviews (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null check (kind in ('flashcard', 'occlusion')),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  primary key (user_id, kind, deck, item_id, day),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create index card_reviews_day on app.card_reviews (user_id, day);

create table app.quiz_answers (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null default 'quiz' check (kind = 'quiz'),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  correct boolean not null,
  primary key (user_id, deck, item_id, day),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create index quiz_answers_day on app.quiz_answers (user_id, day);

create table app.chapters_done (
  user_id uuid not null references app.accounts(id) on delete cascade,
  kind    app.study_kind not null default 'chapter' check (kind = 'chapter'),
  deck    text not null,
  item_id text not null,
  day     date not null default app.today(),
  primary key (user_id, deck, item_id),
  foreign key (kind, deck, item_id) references app.study_items (kind, deck, item_id)
);

create table app.study_days (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null default app.today(),
  primary key (user_id, day)
);

create table app.user_state (
  user_id    uuid not null references app.accounts(id) on delete cascade,
  key        text not null check (key ~ '^[a-z]+(:[A-Za-z0-9._/-]{1,120})?$'),
  value      jsonb not null,
  -- The server's clock, so the app can ask for "what changed since I last looked".
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_state_value_size check (pg_column_size(value) <= 512 * 1024)
);

-- Saving a value that didn't change writes nothing; a student keeps at most 3000 keys.
create function app.user_state_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.value = old.value and new.user_id = old.user_id and new.key = old.key then
      return null;
    end if;
  elsif not exists (select 1 from app.user_state where user_id = new.user_id and key = new.key)
    and (select count(*) from app.user_state where user_id = new.user_id) >= 3000 then
    raise exception 'progress_full' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_state_before_write before insert or update on app.user_state
  for each row execute function app.user_state_before_write();

alter table app.study_items enable row level security;
alter table app.card_reviews enable row level security;
alter table app.quiz_answers enable row level security;
alter table app.chapters_done enable row level security;
alter table app.study_days enable row level security;
alter table app.user_state enable row level security;

-- The records are the student's own to read; only the functions below write them.
create policy card_reviews_own on app.card_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy quiz_answers_own on app.quiz_answers for select to authenticated using (user_id = (select auth.uid()));
create policy chapters_done_own on app.chapters_done for select to authenticated using (user_id = (select auth.uid()));
create policy study_days_own on app.study_days for select to authenticated using (user_id = (select auth.uid()));
create policy user_state_read on app.user_state for select to authenticated using (user_id = (select auth.uid()));
create policy user_state_add on app.user_state for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_state_change on app.user_state for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_state_remove on app.user_state for delete to authenticated using (user_id = (select auth.uid()));

grant select on app.card_reviews, app.quiz_answers, app.chapters_done, app.study_days to authenticated;
grant select, insert, update, delete on app.user_state to authenticated;

-- Marks today as a study day for the caller.
create function app.mark_study_day(p_user_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into app.study_days (user_id, day) values (p_user_id, app.today()) on conflict do nothing;
$$;

create function app.require_account()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from app.accounts where id = auth.uid()) then raise exception 'no_profile'; end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- The student's saved state, read and written by the app's sync (src/lib/progressSync.ts).
create view public.user_state
with (security_invoker = on) as
select user_id, key, value, updated_at from app.user_state;

revoke all on public.user_state from public, anon, authenticated;
grant select, insert, update, delete on public.user_state to authenticated;

-- Records flashcard and occlusion reviews made today. p_items: [{ kind, deck, item }], at most
-- 200 a call and 3000 a day. Items not in the catalog are skipped. Returns how many were new today.
create function public.record_reviews(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
  added int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'bad_items'; end if;
  if (select count(*) from app.card_reviews where user_id = uid and day = app.today()) + jsonb_array_length(p_items) > 3000 then
    raise exception 'too_many_reviews';
  end if;
  insert into app.card_reviews (user_id, kind, deck, item_id)
  select distinct uid, s.kind, s.deck, s.item_id
    from jsonb_array_elements(p_items) x
    join app.study_items s on s.kind::text = x ->> 'kind' and s.deck = x ->> 'deck' and s.item_id = x ->> 'item'
   where s.kind in ('flashcard', 'occlusion') and s.retired_at is null
  on conflict do nothing;
  get diagnostics added = row_count;
  perform app.mark_study_day(uid);
  return added;
end;
$$;

-- Grades a finished quiz. p_answers: [{ deck, item, choice }], choice = the print position of the
-- option picked (null when skipped), at most 300. Returns { correct, total } as graded here.
create function public.record_quiz(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
  n_correct int;
  n_total int;
begin
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then raise exception 'bad_answers'; end if;
  with graded as (
    select distinct on (s.deck, s.item_id) s.deck, s.item_id,
           coalesce(jsonb_typeof(x -> 'choice') = 'number' and (x ->> 'choice')::numeric = s.answer, false) as correct
      from jsonb_array_elements(p_answers) x
      join app.study_items s on s.kind = 'quiz' and s.deck = x ->> 'deck' and s.item_id = x ->> 'item'
     where s.retired_at is null
  ), saved as (
    -- A question counts once a day: answered right at least once that day.
    insert into app.quiz_answers (user_id, deck, item_id, correct)
    select uid, g.deck, g.item_id, g.correct from graded g
    on conflict (user_id, deck, item_id, day) do update set correct = app.quiz_answers.correct or excluded.correct
    returning 1
  )
  select (select count(*) filter (where correct) from graded), (select count(*) from graded) into n_correct, n_total;
  perform app.mark_study_day(uid);
  return jsonb_build_object('correct', n_correct, 'total', n_total);
end;
$$;

-- Records a finished ebook chapter (once; un-ticking it in the app keeps the record).
create function public.finish_chapter(p_deck text, p_chapter text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.require_account();
begin
  if not exists (select 1 from app.study_items where kind = 'chapter' and deck = p_deck and item_id = p_chapter and retired_at is null) then
    raise exception 'no_such_chapter';
  end if;
  insert into app.chapters_done (user_id, deck, item_id) values (uid, p_deck, p_chapter) on conflict do nothing;
  perform app.mark_study_day(uid);
end;
$$;

-- Marks today as a study day (reading, the lab, the atlas: studying that isn't a record above).
create function public.record_study_day()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.mark_study_day(app.require_account());
end;
$$;

-- The caller's study days (UTC dates), oldest first, for streaks and the activity calendar.
create function public.my_study_days()
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(day order by day), '{}') from app.study_days where user_id = (select auth.uid());
$$;

grant execute on function app.today() to authenticated;
grant execute on function public.record_reviews(jsonb), public.record_quiz(jsonb), public.finish_chapter(text, text),
  public.record_study_day(), public.my_study_days() to authenticated;
