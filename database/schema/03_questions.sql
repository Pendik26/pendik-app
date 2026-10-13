-- The question bank: past-paper questions, their options and accepted answers, and the Markdown
-- imports they came from.
--
-- Students never read these tables. They get question content only through the attempt and
-- practice functions (04_exams.sql, 05_practice.sql), which leave the keys out of an exam until
-- it's submitted. Admins read them through the admin_* views and change them through functions.
--
-- Images live in the repo under public/question-images/; `stem_image` and an option's `image`
-- hold that path (e.g. "question-images/1.1/costraver-12.webp").

create type app.question_kind as enum ('single_choice', 'short_answer');
create type app.publish_status as enum ('draft', 'published');

-- The Markdown file each import came from. It contains the answer keys: admin only.
create table app.imports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 200),
  source_text text not null,
  created_by  uuid references app.accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index imports_created_by on app.imports (created_by);

create table app.questions (
  id              uuid primary key default gen_random_uuid(),
  block           text not null references app.blocks(id),
  source          text check (length(source) <= 60),   -- where it comes from, e.g. 'ub', 'costraver'
  year            int check (year between 2000 and 2100),
  subject         text check (length(subject) <= 80),
  kind            app.question_kind not null,
  stem            text not null check (length(btrim(stem)) > 0),
  stem_image      text,
  stem_image_alt  text,
  explanation     text,
  -- Goes up by one whenever the content changes, so a result can say "this question has changed
  -- since you answered it". Set by admin_update_question().
  revision        int not null default 1,
  status          app.publish_status not null default 'draft',
  import_id       uuid references app.imports(id) on delete set null,
  import_position int,
  created_by      uuid references app.accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index questions_import on app.questions (import_id, import_position);
create index questions_block on app.questions (block, source, year, subject) where deleted_at is null;
create index questions_created_by on app.questions (created_by);

create trigger questions_touch before update on app.questions
  for each row execute function app.touch_updated_at();

-- A single-choice question's options, in the order the paper printed them (0 first). Exactly one
-- is correct (checked by app.check_question()).
create table app.question_options (
  question_id uuid not null references app.questions(id) on delete cascade,
  position    int not null check (position between 0 and 7),
  text        text not null default '',
  image       text,
  is_correct  boolean not null default false,
  primary key (question_id, position)
);

-- A short-answer question's accepted answers; position 0 is the main answer.
create table app.question_answers (
  question_id uuid not null references app.questions(id) on delete cascade,
  position    int not null check (position >= 0),
  answer      text not null check (length(btrim(answer)) > 0),
  primary key (question_id, position)
);

-- A question's content as one JSON value: its options (in print order), the correct one, the
-- accepted answers. Used by the attempt functions and the admin views.
create function app.question_options_json(p_question_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('text', o.text, 'image', o.image) order by o.position)
    from app.question_options o where o.question_id = p_question_id;
$$;

create function app.question_correct_index(p_question_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select o.position from app.question_options o where o.question_id = p_question_id and o.is_correct;
$$;

create function app.question_accepted(p_question_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(a.answer order by a.position) from app.question_answers a where a.question_id = p_question_id;
$$;

-- Writes a question's options or answers from the import/edit JSON shape and checks the result:
-- single choice has 2 to 8 options with exactly one correct, short answer at least one answer.
create function app.set_question_content(p_question_id uuid, p_options jsonb, p_correct_index int, p_accepted text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  k app.question_kind;
  n int;
begin
  select kind into k from app.questions where id = p_question_id;
  delete from app.question_options where question_id = p_question_id;
  delete from app.question_answers where question_id = p_question_id;
  if k = 'single_choice' then
    if jsonb_typeof(p_options) <> 'array' then raise exception 'bad_options'; end if;
    n := jsonb_array_length(p_options);
    if n not between 2 and 8 then raise exception 'bad_options'; end if;
    if p_correct_index is null or p_correct_index not between 0 and n - 1 then raise exception 'bad_correct_index'; end if;
    insert into app.question_options (question_id, position, text, image, is_correct)
    select p_question_id, (o.n - 1)::int, coalesce(o.v ->> 'text', ''), nullif(o.v ->> 'image', ''), (o.n - 1) = p_correct_index
      from jsonb_array_elements(p_options) with ordinality o(v, n);
  else
    if p_accepted is null or cardinality(p_accepted) = 0 then raise exception 'bad_accepted_answers'; end if;
    insert into app.question_answers (question_id, position, answer)
    select p_question_id, (a.n - 1)::int, btrim(a.v)
      from unnest(p_accepted) with ordinality a(v, n)
     where btrim(a.v) <> '';
    if not found then raise exception 'bad_accepted_answers'; end if;
  end if;
end;
$$;

alter table app.imports enable row level security;
alter table app.questions enable row level security;
alter table app.question_options enable row level security;
alter table app.question_answers enable row level security;

create policy imports_admin on app.imports for select to authenticated using ((select public.is_admin()));
create policy questions_admin on app.questions for select to authenticated using ((select public.is_admin()));
create policy question_options_admin on app.question_options for select to authenticated using ((select public.is_admin()));
create policy question_answers_admin on app.question_answers for select to authenticated using ((select public.is_admin()));

grant select on app.imports, app.questions, app.question_options, app.question_answers to authenticated;

-- ---------------------------------------------------------------------------------------------
-- API (admins)

-- Changes a question's content. The revision goes up when anything a student sees changes.
-- p_patch: any of { subject, stem, stem_image, stem_image_alt, options, correct_index,
-- accepted_answers, explanation }.
create function public.admin_update_question(p_question_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q app.questions;
  before jsonb;
  after jsonb;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  select * into q from app.questions where id = p_question_id and deleted_at is null for update;
  if q.id is null then raise exception 'question_not_found'; end if;
  before := jsonb_build_array(q.stem, q.stem_image, q.stem_image_alt, q.explanation, app.question_options_json(q.id),
                              app.question_correct_index(q.id), app.question_accepted(q.id));

  update app.questions set
    subject = case when p_patch ? 'subject' then nullif(btrim(p_patch ->> 'subject'), '') else subject end,
    stem = case when p_patch ? 'stem' then p_patch ->> 'stem' else stem end,
    stem_image = case when p_patch ? 'stem_image' then nullif(p_patch ->> 'stem_image', '') else stem_image end,
    stem_image_alt = case when p_patch ? 'stem_image_alt' then nullif(p_patch ->> 'stem_image_alt', '') else stem_image_alt end,
    explanation = case when p_patch ? 'explanation' then nullif(p_patch ->> 'explanation', '') else explanation end
  where id = q.id;

  if p_patch ? 'options' or p_patch ? 'correct_index' or p_patch ? 'accepted_answers' then
    perform app.set_question_content(
      q.id,
      case when p_patch ? 'options' then p_patch -> 'options' else app.question_options_json(q.id) end,
      case when p_patch ? 'correct_index' then (p_patch ->> 'correct_index')::int else app.question_correct_index(q.id) end,
      case when p_patch ? 'accepted_answers' and jsonb_typeof(p_patch -> 'accepted_answers') = 'array'
           then array(select jsonb_array_elements_text(p_patch -> 'accepted_answers'))
           else app.question_accepted(q.id) end
    );
  end if;

  select jsonb_build_array(stem, stem_image, stem_image_alt, explanation, app.question_options_json(id),
                           app.question_correct_index(id), app.question_accepted(id))
    into after from app.questions where id = q.id;
  if after is distinct from before then
    update app.questions set revision = revision + 1 where id = q.id;
    perform app.audit('question.edit', q.id::text);
  end if;
end;
$$;

-- Takes a question out of every package; attempts that already used it keep it.
create function public.admin_delete_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  update app.questions set deleted_at = now() where id = p_question_id and deleted_at is null;
  if not found then raise exception 'question_not_found'; end if;
  perform app.audit('question.delete', p_question_id::text);
end;
$$;

-- Saves an imported Markdown file and its questions (as drafts) in one step.
-- p_questions: [{ block, source, year, subject, type, stem, stem_image, stem_image_alt, options, correct_index,
--                 accepted_answers, explanation }], in file order. Returns the import id.
create function public.admin_import_questions(p_title text, p_source_text text, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_import uuid;
  item record;
  new_question uuid;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'no_questions';
  end if;
  insert into app.imports (title, source_text, created_by)
  values (btrim(p_title), p_source_text, me) returning id into new_import;

  for item in select x.q, x.n from jsonb_array_elements(p_questions) with ordinality as x(q, n) loop
    insert into app.questions (block, source, year, subject, kind, stem, stem_image, stem_image_alt, explanation,
                               import_id, import_position, created_by)
    values (app.ensure_block(item.q ->> 'block'), nullif(item.q ->> 'source', ''), (item.q ->> 'year')::int,
            nullif(item.q ->> 'subject', ''), (item.q ->> 'type')::app.question_kind, item.q ->> 'stem',
            nullif(item.q ->> 'stem_image', ''), nullif(item.q ->> 'stem_image_alt', ''), nullif(item.q ->> 'explanation', ''),
            new_import, item.n::int, me)
    returning id into new_question;
    perform app.set_question_content(
      new_question, item.q -> 'options', (item.q ->> 'correct_index')::int,
      case when jsonb_typeof(item.q -> 'accepted_answers') = 'array'
           then array(select jsonb_array_elements_text(item.q -> 'accepted_answers')) end);
  end loop;

  perform app.audit('questions.import', new_import::text,
                    jsonb_build_object('title', btrim(p_title), 'questions', jsonb_array_length(p_questions)));
  return new_import;
end;
$$;

-- The blocks, sources, years and subjects in the bank, for the filters on Admin → Questions.
create function public.admin_question_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'admins_only'; end if;
  select jsonb_build_object(
    'blocks', coalesce(jsonb_agg(distinct q.block), '[]'),
    'sources', coalesce(jsonb_agg(distinct q.source) filter (where q.source is not null), '[]'),
    'years', coalesce(jsonb_agg(distinct q.year) filter (where q.year is not null), '[]'),
    'subjects', coalesce(jsonb_agg(distinct q.subject) filter (where q.subject is not null), '[]')
  ) into result
  from app.questions q
  where q.deleted_at is null;
  return result;
end;
$$;

grant execute on function app.question_options_json(uuid), app.question_correct_index(uuid), app.question_accepted(uuid)
  to authenticated;
grant execute on function public.admin_update_question(uuid, jsonb), public.admin_delete_question(uuid),
  public.admin_import_questions(text, text, jsonb), public.admin_question_facets() to authenticated;
