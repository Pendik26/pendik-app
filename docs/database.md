# Database

Everything a student or admin saves lives in one Supabase project: sign-in
(Supabase Auth), a Postgres database, and three Edge Functions. Study content
(flashcards, quizzes, ebooks, summaries, lecture PDFs, the knowledge map and
atlas) is not in it: it ships with the built site from `content/` and
`public/`. The database only keeps a catalog of it, so it can check what a
student records before it earns points.

Everything on the database side is in [`database/`](../database/):

```text
database/
  schema/       the current schema, one file per domain (00_foundation … 11_admin)
  migrations/   0001_baseline.sql, then one numbered file per later change
  seeds/        first-admin.sql (data, not schema)
  functions/    the Edge Functions (see api.md)
  tests/        SQL tests, and schema-check.sh
  config.toml   the Supabase CLI's settings for a local stack
```

To see what a table or function looks like now, read its file in
[`database/schema/`](../database/schema/). Each file starts with a comment
saying what it holds and the rules it enforces; this page is the map.
[`database/migrations/`](../database/migrations/) is what `db push` applies:
`0001_baseline.sql` builds the whole schema, and every later change is a new
file. `npm run db:test` checks that the two describe exactly the same schema.

The app reaches all of it through one module,
[`src/lib/db/client.ts`](../src/lib/db/client.ts): the supabase-js client typed
with [`types.ts`](../src/lib/db/types.ts) (generated from the database with
`npm run db:types`), `rpc()` for the SQL functions, and `invokeFunction()` for
the Edge Functions.

```text
browser ── supabase-js ──► Supabase Auth      (NIM or Google sign-in, sessions)
   │                  └──► Postgres (PostgREST) views and functions in `public`
   └── fetch ────────────► Edge Functions     ai, admin-accounts (with the student's token)
GitHub Actions ──────────► Edge Function      drive-sync (with a shared secret)
               ──────────► Postgres           content catalog (npm run db:content)
```

## Two schemas: `app` holds the data, `public` is the API

- **`app`** holds every table. The Data API doesn't serve it, so nothing in it
  is reachable from a browser on its own.
- **`public`** is the API: views over the tables, which run as the caller
  (`security_invoker`), and functions. A new table stays private until someone
  deliberately adds a view or function for it.
- Row level security is on for every table in `app` as a second wall, and
  default privileges are revoked, so every view and function grants exactly
  who may use it. `anon` (signed out) can use nothing at all.

The tests check these rules hold for every table, view and function
(`tests/people.test.sql`).

## Who can see what

- **Students** read their own account, roster row, attempts, bookmarks, study
  records and saved state. They never read questions directly: question
  content reaches them through the attempt functions, which leave the answer
  keys out of exam attempts until they're submitted.
- **Admins** (`accounts.role = 'admin'`, checked by `is_admin()`) read and
  edit the roster, questions and packages, and use the `admin_*` functions.
- **The service role** (Edge Functions only, never the browser) creates and
  locks accounts, writes the Drive tables and spends the AI allowance.

## People (`01_people.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `cohorts` | year's intake, e.g. `2026` | created on first use |
| `students` | student on the class list: NIM, full name, cohort, IUP or Reguler, class group | the roster; admin only, except a student's own row |
| `accounts` | activated account, keyed by the Auth user id | NIM, role, `must_change_password`, leaderboard name and whether they joined |

A student's name, cohort, class and group live on `students` only, so moving
a student on the roster moves them everywhere. A student signs in as
`<nim>@pendik26.internal` (lower case); their first password is `pendik26` +
NIM, and `must_change_password` keeps them on the change-password page until
they pick their own (`password_changed()`). Google is linked to that same
Auth user from the Account page, so a Google sign-in for anyone not activated
finds no account and is signed straight out.

API: `my_account` (the signed-in student's account and roster row together),
`students` (the roster; writing to it adds or updates a student and creates
their cohort; a student with an account can't be removed), `accounts` (service
role only), `update_my_settings()`, `password_changed()`.

## Curriculum (`02_curriculum.sql`)

`blocks` (1.1, 1.2, …): questions, packages, readiness and the study catalog
point at a real block. The content catalog and question imports add blocks.

## Questions (`03_questions.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `imports` | imported Markdown file | the file itself, with its answer keys: admin only |
| `questions` | question | single choice or short answer; `revision` goes up when anything a student sees changes |
| `question_options` | option of a single-choice question, in print order | `is_correct` marks the key |
| `question_answers` | accepted answer of a short-answer question | |

API (admins): `admin_questions` (the bank, with the packages using each
question), `admin_update_question()`, `admin_delete_question()`,
`admin_import_questions()`, `admin_question_facets()`. Question images are
files under `public/question-images/`. The Markdown format is in
[questions.md](questions.md).

## Exams and practice (`04_exams.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `packages` | exam or practice set | title, block, mode, time limit, track, draft or published |
| `package_questions` | question in a package, in order | |
| `attempts` | try at a package (or bank practice) | status, score, counts, holder tab, tab leaves |
| `attempt_items` | question in an attempt | the question's revision, its option order, the answer, and how it was graded |

Students only read their attempts; every change goes through these functions,
which enforce the rules:

| Function | Does |
| --- | --- |
| `start_attempt(package, holder)` | starts one, or returns the one already running (one at a time per student) |
| `get_attempt(id)` | the questions in this attempt's option order, its answers and deadline; keys only for practice |
| `save_attempt(id, holder, answers, …)` | saves answers; refused after the deadline (plus a few seconds' grace) or from a tab that isn't the holder |
| `take_over_attempt(id, holder)` | moves the attempt to this browser tab |
| `submit_attempt(id, holder)` | grades it and freezes it |
| `abandon_attempt(id)` | gives up a running practice attempt |
| `get_attempt_result(id)` | a finished attempt with the keys and explanations |

An attempt freezes its question list, each question's option order and
revision when it starts, so editing a question later never rewrites anyone's
attempt. The deadline is on the server's clock; a running attempt past it is
graded the next time its owner touches it.

Views: `package_summaries` (packages with their live question count; the
policies decide which a student sees), `attempts` (the caller's), and for
admins `admin_package_questions` and `admin_question_stats` (how often each
option was picked in finished attempts). Admin functions:
`admin_packages_from_import()`, `admin_set_package_status()` (publishing
publishes the questions too), `admin_update_package()`,
`admin_delete_package()`.

## Practice from the bank (`05_practice.sql`)

The bank is every live question in a published practice package the
student's class can see, so exam-only questions and their keys never reach
it. `bookmarks` holds the questions a student saved.

| Function | Does |
| --- | --- |
| `bank_options()` | question counts per block, source, year and subject, and how many are bookmarked |
| `start_bank_practice(block, sources, years, subjects, bookmarked_only, count, time_limit, title, holder)` | draws up to 200 questions at random into a practice attempt with no package; empty filters mean any |
| `my_bookmarks()` | the student's bookmarked bank questions with their keys and explanations |

## Studying (`06_study.sql`)

The catalog, `study_items`, lists every flashcard, image-occlusion label, quiz
question (with its key) and ebook chapter in `content/`, by deck
(`"{block}/{subject}"`). `npm run db:content` fills it
([`scripts/content-catalog.mjs`](../scripts/content-catalog.mjs)); the
content-catalog workflow runs it after every content change on the default
branch. An item that leaves `content/` is retired, not deleted.

What earns points is recorded only through these functions, on the server's
clock, and each record is checked against the catalog first:

| Function | Records |
| --- | --- |
| `record_reviews(items)` | flashcard and occlusion reviews: one per card per day (`card_reviews`) |
| `record_quiz(answers)` | a finished quiz, graded here against the catalog's key (`quiz_answers`); returns `{ correct, total }` |
| `finish_chapter(deck, chapter)` | a finished ebook chapter, once (`chapters_done`) |
| `record_study_day()` | today as a study day (`study_days`); every record above marks one too |

The app sends them from an outbox ([`src/lib/studyRecords.ts`](../src/lib/studyRecords.ts)).

`user_state` is everything else the app keeps per student: review schedules,
quiz history, reading positions, plans, settings. The student writes it freely
and nothing reads it for points. At most 3,000 keys (`progress_full`) and
512 KB a value; `updated_at` is the server's clock, and saving a value that
didn't change writes nothing. The keys are declared in
`src/lib/storageSchema.ts`; how the app syncs them is in
[storage-and-sync.md](storage-and-sync.md).

## Leaderboard (`07_leaderboard.sql`)

| Points | For |
| --- | --- |
| 1 | a question answered right: a quiz question, or a single-choice question in a finished attempt; once per question per day |
| 2 | a flashcard or occlusion label learned: reviewed on two different days |
| 10 | a finished ebook chapter |
| 5 | a study day |

A self-marked short answer earns nothing. Each record adds its points to
`points` (per student, day and source) as it's made, so the board is a sum
over one small table, and points never go down. `leaderboard(period,
my_cohort_only)` ranks the students who joined by this week's points,
all-time points or current study streak.

## Readiness, Drive, AI (`08_readiness.sql` to `10_ai.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `block_readiness` | student × block | the readiness the app worked out; `class_readiness()` gives the cohort's average once at least three classmates have one |
| `drive_files` | file in the class Drive folder | block, category and subject from the folder path; `missing_since` when the sync stops finding it; `hidden_at` and `sort_order` set by admins |
| `drive_sync_runs` | sync | status (running, done, failed, held), counts, and `cursor`, the folders still to visit |
| `ai_usage` | student × day | AI answers used, against `AI_DAILY_LIMIT`; `ai_take()` and `ai_refund()` (service role) |

Only `drive-sync` writes the Drive tables, through `drive_touch_videos()`,
`drive_counts()` and `drive_mark_missing()` (service role only). How a sync
runs is in [deploying.md](deploying.md#5-class-drive-sync).

## Admin (`11_admin.sql`)

`admin_list_roster()` (the roster with each student's account state),
`admin_set_role()` (never on yourself, never the last admin) and
`admin_audit_log()`. Role changes, imports, question and package edits,
roster edits and account actions are written to `audit_log`. Creating,
locking, unlocking and resetting accounts needs the service role, so it's the
`admin-accounts` Edge Function instead ([api.md](api.md)).

## Classes: IUP and Reguler

The year has two classes that used to have their own apps (IUP had the
medicine app, Reguler had penpro). `track` (`'IUP'`, `'REGULER'` or null) is
on `students` and `packages`:

- A package with a track is only for that class; null means both.
  `track_visible()` applies it to packages, the bank and `start_attempt()`.
  A student with no track, and every admin, sees all.
- `drive_files.track` (set by the sync from the folder) isn't enforced: the
  app shows a student their class's folders and can show the other's too.

## First admin (`seeds/first-admin.sql`)

Makes someone an admin (see [deploying.md](deploying.md#6-first-admin-roster-and-past-papers)):
`npm run db:first-admin` passes who it is in as psql variables, so no
student's details are committed. Running it again keeps what exists and only
makes that account an admin.

## Testing

`database/tests/` holds SQL tests for the walls around `app`, people and
roles, exams, practice and bookmarks, studying and the leaderboard, the Drive
and the AI allowance. They run against a plain Postgres (a stub stands in for
Supabase's `auth` schema):

```sh
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run db:test
```

That runs `tests/run.sh` (a scratch database, every migration, the real
content catalog, the tests, then drops it) and `tests/schema-check.sh`, which
builds one database from `migrations/` and one from `schema/` and fails if
their schema dumps differ. The Database workflow runs both on every pull
request that touches `database/` or `content/`. With the Supabase CLI,
`npm run supabase -- start` then `npm run supabase -- db reset` gives a full
local stack instead.

## Changing the schema

1. Add a file to `database/migrations/` named with the next number and a few
   words saying what it does, like `0002_quiz_streaks.sql`, with a header
   comment. Never edit one that has been applied: the live database has
   already run it.
2. Make the same change in the domain's file in `database/schema/`, so it
   keeps reading as the current schema.
3. Run `npm run db:test`. The schema check names anything the two disagree
   on.
4. `npm run db:push` applies it, then `npm run db:types` updates
   `src/lib/db/types.ts`.

A new kind of saved state needs no migration: declare its key in
`src/lib/storageSchema.ts` and it's saved in `user_state`. A new kind of
content that should earn points needs a catalog entry in
`scripts/content-catalog.mjs` and a record function.
