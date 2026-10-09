-- The leaderboard.
--
-- Points: 1 per correct answer (quizzes and finished exam/practice attempts), 2 per learned
-- flashcard or image-occlusion label, 10 per finished ebook chapter, 5 per study day.
-- Each scoring source has a part per student; a change to it credits the points it gained (never
-- negative) to today, for the weekly board. Both tables have row level security on and no
-- policies: they're read through leaderboard() only.

create table public.leaderboard_parts (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  source            text not null,       -- a progress key, or 'attempts'
  correct_answers   int not null default 0,
  cards_learned     int not null default 0,
  chapters_finished int not null default 0,
  study_days        int not null default 0,
  run_end           date,
  run_length        int not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, source)
);

create table public.leaderboard_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  points  int not null default 0,
  primary key (user_id, day)
);

create index leaderboard_daily_day on public.leaderboard_daily (day);

alter table public.leaderboard_parts enable row level security;
alter table public.leaderboard_daily enable row level security;
revoke all on public.leaderboard_parts, public.leaderboard_daily from anon, authenticated;

create or replace function public.part_points(p public.leaderboard_parts)
returns int language sql immutable set search_path = '' as $$
  select p.correct_answers + 2 * p.cards_learned + 10 * p.chapters_finished + 5 * p.study_days;
$$;

-- Saves one source's part and credits what it gained to today.
create or replace function public.leaderboard_set_part(p public.leaderboard_parts)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_points int;
  gained int;
begin
  select public.part_points(lp) into old_points
    from public.leaderboard_parts lp where lp.user_id = p.user_id and lp.source = p.source;
  insert into public.leaderboard_parts (user_id, source, correct_answers, cards_learned, chapters_finished,
                                        study_days, run_end, run_length, updated_at)
  values (p.user_id, p.source, p.correct_answers, p.cards_learned, p.chapters_finished, p.study_days,
          p.run_end, p.run_length, now())
  on conflict (user_id, source) do update set
    correct_answers = excluded.correct_answers, cards_learned = excluded.cards_learned,
    chapters_finished = excluded.chapters_finished, study_days = excluded.study_days,
    run_end = excluded.run_end, run_length = excluded.run_length, updated_at = now();
  gained := public.part_points(p) - coalesce(old_points, 0);
  if gained > 0 then
    insert into public.leaderboard_daily (user_id, day, points)
    values (p.user_id, (now() at time zone 'utc')::date, gained)
    on conflict (user_id, day) do update set points = public.leaderboard_daily.points + excluded.points;
  end if;
  delete from public.leaderboard_daily
   where user_id = p.user_id and day < (now() at time zone 'utc')::date - 13;
end;
$$;

-- What one progress value is worth. Caps keep a malformed value from producing an absurd score.
create or replace function public.progress_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := split_part(new.key, ':', 1);
  has_id boolean := position(':' in new.key) > 0;
  p public.leaderboard_parts;
  days date[];
  last_day date;
  d date;
begin
  p.user_id := new.user_id;
  p.source := new.key;
  p.correct_answers := 0; p.cards_learned := 0; p.chapters_finished := 0; p.study_days := 0; p.run_length := 0;

  if kind in ('flashcards', 'occlusion') and has_id and jsonb_typeof(new.value) = 'object' then
    select count(*) into p.cards_learned
      from (select v from jsonb_each(new.value) e(k, v) limit 5000) c
     where jsonb_typeof(c.v -> 'reps') = 'number' and (c.v ->> 'reps')::numeric between 1 and 10000;
  elsif kind = 'quiz' and has_id and jsonb_typeof(new.value) = 'array' then
    select coalesce(sum((a ->> 'score')::int), 0) into p.correct_answers
      from (select a from jsonb_array_elements(new.value) a limit 1000) x
     where jsonb_typeof(a -> 'score') = 'number' and jsonb_typeof(a -> 'total') = 'number'
       and (a ->> 'total')::numeric between 0 and 500
       and (a ->> 'score')::numeric between 0 and (a ->> 'total')::numeric
       and (a ->> 'score')::numeric = trunc((a ->> 'score')::numeric);
  elsif kind = 'ebookdone' and has_id and jsonb_typeof(new.value) = 'array' then
    select count(distinct v) into p.chapters_finished
      from jsonb_array_elements_text(new.value) v where length(v) <= 60;
  elsif kind = 'activity' and not has_id and jsonb_typeof(new.value) = 'array' then
    select array_agg(distinct v::date order by v::date) into days
      from jsonb_array_elements_text(new.value) v
     where v ~ '^\d{4}-\d{2}-\d{2}$' and v::date between '2020-01-01' and (now() at time zone 'utc')::date + 1;
    p.study_days := coalesce(cardinality(days), 0);
    if p.study_days > 0 then
      last_day := days[cardinality(days)];
      p.run_end := last_day;
      foreach d in array (select array_agg(x order by x desc) from unnest(days) x) loop
        exit when d <> last_day - p.run_length;
        p.run_length := p.run_length + 1;
      end loop;
    end if;
  else
    return new;
  end if;

  perform public.leaderboard_set_part(p);
  return new;
end;
$$;

create trigger progress_leaderboard after insert or update of value on public.progress
  for each row execute function public.progress_score();

-- Correct answers from finished attempts count too.
create or replace function public.attempts_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.leaderboard_parts;
begin
  if new.status <> 'finished' or old.status = 'finished' then return new; end if;
  p.user_id := new.user_id;
  p.source := 'attempts';
  select coalesce(sum(correct_count), 0) into p.correct_answers
    from public.attempts where user_id = new.user_id and status = 'finished';
  p.cards_learned := 0; p.chapters_finished := 0; p.study_days := 0; p.run_length := 0;
  perform public.leaderboard_set_part(p);
  return new;
end;
$$;

create trigger attempts_leaderboard after update of status on public.attempts
  for each row execute function public.attempts_score();

-- Every student's totals: all-time points, this week's points, current study streak.
create or replace function public.leaderboard_totals()
returns table (user_id uuid, joined boolean, name text, cohort text, all_points int, week_points int,
               streak int, stats jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'utc')::date as d)
  select pr.id, pr.leaderboard_joined, coalesce(pr.display_name, split_part(pr.full_name, ' ', 1)), pr.cohort,
         coalesce((select sum(public.part_points(lp)) from public.leaderboard_parts lp where lp.user_id = pr.id), 0)::int,
         coalesce((select sum(ld.points) from public.leaderboard_daily ld, today
                    where ld.user_id = pr.id and ld.day >= today.d - 6), 0)::int,
         coalesce((select case when lp.run_end >= today.d - 1 then lp.run_length else 0 end
                     from public.leaderboard_parts lp, today where lp.user_id = pr.id and lp.source = 'activity'), 0),
         (select jsonb_build_object(
            'correct_answers', coalesce(sum(lp.correct_answers), 0), 'cards_learned', coalesce(sum(lp.cards_learned), 0),
            'chapters_finished', coalesce(sum(lp.chapters_finished), 0), 'study_days', coalesce(sum(lp.study_days), 0))
            from public.leaderboard_parts lp where lp.user_id = pr.id)
    from public.profiles pr;
$$;

-- The board: students who joined, ranked by this week's points, all-time points or current study
-- streak; ties share a rank. Also the caller's own numbers, joined or not.
create or replace function public.leaderboard(p_period text default 'week', p_my_cohort_only boolean default false)
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
  select cohort into my_cohort from public.profiles where id = uid;

  with scored as (
    select t.*, case p_period when 'week' then t.week_points when 'all' then t.all_points else t.streak end as value
      from public.leaderboard_totals() t
  ),
  board as (
    select s.*, rank() over (order by s.value desc) as rnk
      from scored s
     where s.joined and s.value > 0 and (not p_my_cohort_only or s.cohort is not distinct from my_cohort)
  )
  select jsonb_build_object(
    'period', p_period,
    'cohort', my_cohort,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rnk, 'name', b.name, 'cohort', b.cohort,
                                                          'value', b.value, 'me', b.user_id = uid) order by b.rnk, b.name)
                        from (select * from board order by rnk, name limit 100) b), '[]'),
    'total', (select count(*) from board),
    'me', (select jsonb_build_object('joined', s.joined, 'display_name', s.name, 'value', s.value,
                                     'week', s.week_points, 'streak', s.streak, 'points', s.all_points,
                                     'stats', s.stats, 'rank', (select b.rnk from board b where b.user_id = uid))
             from scored s where s.user_id = uid)
  ) into result;
  return result;
end;
$$;

revoke execute on function
  public.part_points(public.leaderboard_parts), public.leaderboard_set_part(public.leaderboard_parts),
  public.progress_score(), public.attempts_score(), public.leaderboard_totals(), public.leaderboard(text, boolean)
  from public, anon, authenticated;
grant execute on function public.leaderboard(text, boolean) to authenticated;
