-- The leaderboard. Points come only from records the server made or checked (06_study.sql and
-- graded exam answers), never from what a student saves in user_state:
--
--   1 per question answered right (a quiz question or a single-choice bank question, once a day each)
--   2 per card or occlusion label learned (reviewed on two different days)
--  10 per finished ebook chapter
--   5 per study day
--
-- Each record adds its points to `points` (per student, day and source) when it's made, so the
-- board is a sum over a small table. Points never go down.

create table app.points (
  user_id uuid not null references app.accounts(id) on delete cascade,
  day     date not null,
  source  text not null check (source in ('quiz', 'exam', 'cards', 'chapters', 'days')),
  points  int not null default 0 check (points >= 0),
  primary key (user_id, day, source)
);

create index points_day on app.points (day);

-- A bank question answered right in a finished attempt, once per student, question and day.
create table app.exam_correct (
  user_id     uuid not null references app.accounts(id) on delete cascade,
  question_id uuid not null references app.questions(id) on delete cascade,
  day         date not null default app.today(),
  primary key (user_id, question_id, day)
);

alter table app.points enable row level security;
alter table app.exam_correct enable row level security;
-- No policies: read through leaderboard() only.

create function app.add_points(p_user_id uuid, p_source text, p_points int)
returns void
language sql
set search_path = ''
as $$
  insert into app.points (user_id, day, source, points) values (p_user_id, app.today(), p_source, p_points)
  on conflict (user_id, day, source) do update set points = app.points.points + excluded.points;
$$;

create function app.points_for_quiz()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.correct and (tg_op = 'INSERT' or not old.correct) then
    perform app.add_points(new.user_id, 'quiz', 1);
  end if;
  return null;
end;
$$;

create trigger quiz_answers_points after insert or update of correct on app.quiz_answers
  for each row execute function app.points_for_quiz();

create function app.points_for_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from app.card_reviews
       where user_id = new.user_id and kind = new.kind and deck = new.deck and item_id = new.item_id) = 2 then
    perform app.add_points(new.user_id, 'cards', 2);
  end if;
  return null;
end;
$$;

create trigger card_reviews_points after insert on app.card_reviews
  for each row execute function app.points_for_review();

create function app.points_for_chapter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'chapters', 10);
  return null;
end;
$$;

create trigger chapters_done_points after insert on app.chapters_done
  for each row execute function app.points_for_chapter();

create function app.points_for_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'days', 5);
  return null;
end;
$$;

create trigger study_days_points after insert on app.study_days
  for each row execute function app.points_for_day();

create function app.points_for_exam_correct()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.add_points(new.user_id, 'exam', 1);
  return null;
end;
$$;

create trigger exam_correct_points after insert on app.exam_correct
  for each row execute function app.points_for_exam_correct();

-- A finished attempt: its right single-choice answers count (a self-marked short answer doesn't),
-- and it was a study day.
create function app.attempt_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'finished' or old.status = 'finished' then return null; end if;
  insert into app.exam_correct (user_id, question_id)
  select new.user_id, i.question_id from app.attempt_items i
   where i.attempt_id = new.id and i.is_correct and i.option_order is not null
  on conflict do nothing;
  perform app.mark_study_day(new.user_id);
  return null;
end;
$$;

create trigger attempts_finished after update of status on app.attempts
  for each row execute function app.attempt_finished();

-- A student's current run of study days, ending today or yesterday (0 when broken).
create function app.streak(p_user_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  with recursive run as (
    select d.day, 1 as n from app.study_days d
     where d.user_id = p_user_id
       and d.day = (select max(day) from app.study_days where user_id = p_user_id)
       and d.day >= app.today() - 1
    union all
    select d.day, run.n + 1 from run join app.study_days d on d.user_id = p_user_id and d.day = run.day - 1
  )
  select coalesce(max(n), 0) from run;
$$;

-- ---------------------------------------------------------------------------------------------
-- API

-- The board: students who joined, ranked by this week's points, all-time points or current study
-- streak; ties share a rank. Also the caller's own numbers, joined or not.
create function public.leaderboard(p_period text default 'week', p_my_cohort_only boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_cohort text;
  result jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_period not in ('week', 'all', 'streak') then raise exception 'bad_period'; end if;
  select s.cohort into my_cohort from app.accounts a join app.students s on s.nim = a.nim where a.id = uid;

  with totals as (
    select a.id as user_id, a.leaderboard_joined as joined,
           coalesce(a.display_name, split_part(s.full_name, ' ', 1)) as name, s.cohort,
           coalesce(sum(p.points), 0)::int as all_points,
           coalesce(sum(p.points) filter (where p.day >= app.today() - 6), 0)::int as week_points,
           coalesce(sum(p.points) filter (where p.source in ('quiz', 'exam')), 0)::int as correct_answers,
           (coalesce(sum(p.points) filter (where p.source = 'cards'), 0) / 2)::int as cards_learned,
           (coalesce(sum(p.points) filter (where p.source = 'chapters'), 0) / 10)::int as chapters_finished,
           (coalesce(sum(p.points) filter (where p.source = 'days'), 0) / 5)::int as study_days
      from app.accounts a
      join app.students s on s.nim = a.nim
      left join app.points p on p.user_id = a.id
     group by a.id, s.full_name, s.cohort
  ),
  scored as (
    select t.*, app.streak(t.user_id) as streak from totals t
     where t.joined or t.user_id = uid
  ),
  valued as (
    select s.*, case p_period when 'week' then s.week_points when 'all' then s.all_points else s.streak end as value
      from scored s
  ),
  board as (
    select v.*, rank() over (order by v.value desc) as rnk
      from valued v
     where v.joined and v.value > 0 and (not p_my_cohort_only or v.cohort is not distinct from my_cohort)
  )
  select jsonb_build_object(
    'period', p_period,
    'cohort', my_cohort,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rnk, 'name', b.name, 'cohort', b.cohort,
                                                          'value', b.value, 'me', b.user_id = uid) order by b.rnk, b.name)
                        from (select * from board order by rnk, name limit 100) b), '[]'),
    'total', (select count(*) from board),
    'me', (select jsonb_build_object('joined', v.joined, 'display_name', v.name, 'value', v.value,
                                     'week', v.week_points, 'streak', v.streak, 'points', v.all_points,
                                     'stats', jsonb_build_object('correct_answers', v.correct_answers,
                                                                 'cards_learned', v.cards_learned,
                                                                 'chapters_finished', v.chapters_finished,
                                                                 'study_days', v.study_days),
                                     'rank', (select b.rnk from board b where b.user_id = uid))
             from valued v where v.user_id = uid)
  ) into result;
  return result;
end;
$$;

grant execute on function public.leaderboard(text, boolean) to authenticated;
