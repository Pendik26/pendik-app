-- The question bank and the packages built from it.
--
-- Answer keys never reach a student's browser in exam mode. Students have no direct access to
-- `questions` at all: they get question content only through the attempt functions
-- (20261008000300_attempts.sql), which leave the keys out of exam attempts until they're submitted.
--
-- Images live in the repo under public/question-images/; `stem_image` and each option's `image`
-- hold that path (e.g. "question-images/1.1/costraver-12.webp").

-- The Markdown file each import came from. It contains the answer keys: admin only.
create table public.question_imports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source_text text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  block           text not null check (block ~ '^[0-9]+\.[0-9]+$'),
  source          text,                 -- where it comes from, e.g. 'ub', 'costraver'
  year            int check (year between 2000 and 2100),
  subject         text,
  type            text not null check (type in ('single_choice', 'short_answer')),
  stem            text not null,
  stem_image      text,
  -- single_choice: [{ "text": "...", "image": "path" | null }, ...], 2 to 8 options.
  options         jsonb,
  correct_index   int,
  -- short_answer: accepted answers, the first one is the main answer.
  accepted_answers text[],
  explanation     text,
  -- Goes up by one whenever the content changes (trigger below), so a result can say
  -- "this question has changed since you answered it".
  revision        int not null default 1,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  import_id       uuid references public.question_imports(id) on delete set null,
  import_position int,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint questions_choice_shape check (
    type <> 'single_choice' or (
      jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 8
      and correct_index between 0 and jsonb_array_length(options) - 1
    )
  ),
  constraint questions_short_shape check (
    type <> 'short_answer' or (accepted_answers is not null and cardinality(accepted_answers) >= 1)
  )
);

create index questions_import on public.questions (import_id, import_position);
create index questions_block on public.questions (block) where deleted_at is null;

create or replace function public.questions_bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  elsif (new.stem, new.stem_image, new.options, new.correct_index, new.accepted_answers, new.explanation)
        is distinct from
        (old.stem, old.stem_image, old.options, old.correct_index, old.accepted_answers, old.explanation) then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_revision before insert or update on public.questions
  for each row execute function public.questions_bump_revision();

-- A package is a fixed, ordered set of questions taken as an exam (timed, keys hidden until the
-- end, best score kept) or as practice (instant feedback).
create table public.packages (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (length(btrim(title)) between 1 and 160),
  block              text check (block ~ '^[0-9]+\.[0-9]+$'),
  source             text,
  year               int,
  mode               text not null check (mode in ('exam', 'practice')),
  time_limit_minutes int check (time_limit_minutes between 1 and 300),
  track_best         boolean not null default false,
  status             text not null default 'draft' check (status in ('draft', 'published')),
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint packages_exam_timed check (mode <> 'exam' or time_limit_minutes is not null),
  constraint packages_best_only_exam check (not track_best or mode = 'exam')
);

create trigger packages_touch before update on public.packages
  for each row execute function public.touch_updated_at();

create table public.package_questions (
  package_id  uuid not null references public.packages(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  position    int not null,
  primary key (package_id, question_id)
);

create index package_questions_order on public.package_questions (package_id, position);

-- Packages with how many live questions each has. Students see published ones and the count,
-- never the questions; the view runs as its owner so it can count them, and filters itself.
create view public.package_summaries as
select p.id, p.title, p.block, p.source, p.year, p.mode, p.time_limit_minutes, p.track_best,
       p.status, p.created_at, p.updated_at,
       (select count(*)::int from public.package_questions pq
          join public.questions q on q.id = pq.question_id and q.deleted_at is null
         where pq.package_id = p.id) as question_count
from public.packages p
where p.deleted_at is null
  and (p.status = 'published' or (select public.is_admin()));

create table public.bookmarks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_imports enable row level security;
alter table public.questions enable row level security;
alter table public.packages enable row level security;
alter table public.package_questions enable row level security;
alter table public.bookmarks enable row level security;

revoke all on public.question_imports, public.questions, public.packages, public.package_questions,
  public.bookmarks, public.package_summaries from anon, authenticated;

create policy question_imports_admin on public.question_imports for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy questions_admin on public.questions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy packages_read on public.packages for select to authenticated
  using ((status = 'published' and deleted_at is null) or (select public.is_admin()));
create policy packages_admin on public.packages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy package_questions_admin on public.package_questions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Admins work on these tables directly; students only read packages and their bookmarks.
grant select, insert, update, delete on public.question_imports, public.questions,
  public.package_questions to authenticated;
grant select, insert, update, delete on public.packages to authenticated;
grant select on public.package_summaries to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
