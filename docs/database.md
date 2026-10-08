# Database

Everything a student or admin saves lives in one Supabase project: sign-in
(Supabase Auth), a Postgres database, and three Edge Functions. Study content
(flashcards, quizzes, ebooks, summaries, lecture PDFs, the knowledge map and
atlas) is not in it: it ships with the built site from `content/` and
`public/`.

The schema is the SQL in [`supabase/migrations/`](../supabase/migrations/),
applied in file order. Each file starts with a comment saying what it holds
and the rules it enforces; this page is the map.

```text
browser ── supabase-js ──► Supabase Auth      (NIM or Google sign-in, sessions)
   │                  └──► Postgres (PostgREST) tables and SQL functions, behind row level security
   └── fetch ────────────► Edge Functions     ai, admin-accounts (with the student's token)
GitHub Action ───────────► Edge Function      drive-sync (with a shared secret)
```

## Who can see what

Every table has row level security on, and `anon` (signed out) can read
nothing. In short:

- **Students** read and change only their own profile settings, progress,
  bookmarks and attempts. They never read `questions` directly: question
  content reaches them only through the attempt functions, which leave the
  answer keys out of exam attempts until they're submitted.
- **Admins** (`profiles.role = 'admin'`, checked by `is_admin()`) can read
  and edit the roster, questions and packages, and use the `admin_*`
  functions.
- **The service role** (Edge Functions only, never the browser) creates and
  locks accounts and writes the Drive tables.

## Accounts (`…0100_accounts.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `roster` | student on the class list: NIM, full name, class group, cohort, IUP or Reguler | admin only |
| `profiles` | activated account, keyed by the Auth user id | role, `must_change_password`, leaderboard name and whether they joined |

A student signs in as `<nim>@pendik26.internal` (lower case) with a
password; their first password is `pendik26` + NIM, and `must_change_password`
keeps them on the change-password page until they pick their own
(`password_changed()`). Google is linked to that same Auth user from the
Account page, so a Google sign-in for anyone not activated finds no profile
and is signed straight out.

Students change their profile only through `update_my_settings()`; name,
NIM, class and role aren't theirs to change.

## Questions and packages (`…0200_questions.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `question_imports` | imported Markdown file | the file itself, with its answer keys: admin only |
| `questions` | question | single choice or short answer; `revision` goes up on every edit |
| `packages` | exam or practice set | title, block, mode, time limit, draft or published, whether to keep the best score |
| `package_questions` | question in a package, in order | |
| `bookmarks` | question a student saved | |
| `package_summaries` (view) | package with its live question count | students see published ones |

Question images are files under `public/question-images/`; `stem_image` and
each option's `image` hold that path. The Markdown format is in
[questions.md](questions.md).

## Attempts (`…0300_attempts.sql`)

`attempts` has one row per try at a package. Students only read it; every
change goes through these functions, which enforce the rules:

| Function | Does |
| --- | --- |
| `start_attempt(package, holder)` | starts one, or returns the one already running (one at a time per student) |
| `get_attempt(id)` | the questions in this attempt's option order, its answers and deadline; keys only for practice |
| `save_attempt(id, holder, answers, …)` | saves answers; refused after the deadline (plus a few seconds' grace) or from a tab that isn't the holder |
| `take_over_attempt(id, holder)` | moves the attempt to this browser tab |
| `submit_attempt(id, holder)` | grades it (`finish_attempt()`) and freezes it |
| `abandon_attempt(id)` | gives up a running attempt |
| `get_attempt_result(id)` | a finished attempt with the keys and explanations |

An attempt freezes its question list, option order, time limit and question
revisions when it starts. The deadline is on the server's clock; a running
attempt past it is graded the next time its owner touches it.
`best_scores` (view) is each student's best finished exam score per package.

## Class Drive (`…0400_drive.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `drive_files` | file in the class Drive folder | path, kind, size, dates; block, category and subject from the folder path; `missing_since` when the sync stops finding it; `hidden_at` when an admin hides it |
| `drive_sync_runs` | sync | status (running, done, failed, held), counts, and `cursor`, the folders still to visit |

Only `drive-sync` writes them, through `drive_touch_videos()`,
`drive_counts()` and `drive_mark_missing()` (service role only). Students read
files that are neither missing nor hidden. How a sync runs is in
[deploying.md](deploying.md#5-class-drive-sync).

## Study progress, leaderboard, readiness, AI (`…0500_study.sql`)

| Table | One row per | Notes |
| --- | --- | --- |
| `progress` | student × key, a JSON value | flashcard reviews, quiz attempts, reading positions, exam plans… The keys are declared in `src/lib/storageSchema.ts`; at most 512 KB a value |
| `leaderboard_parts` | student × scoring source | the points each source is worth now |
| `leaderboard_daily` | student × day | points gained that day, for the weekly board |
| `block_readiness` | student × block | the readiness the app worked out, for the class average |
| `ai_usage` | student × day | AI answers used, against `AI_DAILY_LIMIT` |

Points: 1 per correct answer (quizzes and finished attempts), 2 per learned
flashcard or image-occlusion label, 10 per finished ebook chapter, 5 per study
day. A change to `progress` or a finished attempt rescores that one source
and credits what it gained to today. `leaderboard()` ranks the students who
joined by this week's points, all-time points or current streak.
`class_readiness()` gives the class average only once at least three
classmates have one.

How the app loads and saves progress is in
[storage-and-sync.md](storage-and-sync.md).

## Admin functions (`…0600_admin.sql`)

`admin_list_roster()` (the roster with each student's account state),
`admin_set_role()`, `admin_import_questions()`,
`admin_packages_from_import()` and `admin_set_package_status()`. Creating,
locking, unlocking and resetting accounts needs the service role, so it's the
`admin-accounts` Edge Function instead ([api.md](api.md)).

## Classes: IUP and Reguler (`…0700_tracks.sql`)

The year has two classes that used to have their own apps (IUP had the
medicine app, Reguler had penpro). `track` (`'IUP'`, `'REGULER'` or null)
is on `roster`, `profiles` and `packages`:

- A profile takes its track from the roster when the account is activated,
  and follows it when an admin changes the roster (two triggers).
- A package with a track is only for that class; null means both.
  `track_visible()` applies it to `packages`, `package_summaries` and
  `start_attempt()`. A student with no track, and every admin, sees all.
- `drive_files.track` (set by the sync from the folder) isn't enforced:
  the app shows a student their class's folders and can show the other's
  too.

## Practice from the bank (`…0800_bank_practice.sql`)

The bank is every live question in a published practice package the
student's class can see, so exam-only questions and their keys never reach
it.

| Function | Does |
| --- | --- |
| `bank_options()` | question counts per block, source, year and subject, and how many of them are bookmarked |
| `start_bank_practice(block, sources, years, subjects, bookmarked_only, count, time_limit, title, holder)` | draws up to 200 questions at random into a practice attempt with no package (`attempts.package_id` is null and `attempts.title` names it); empty filters mean any |
| `my_bookmarks()` | the student's bookmarked bank questions with their keys and explanations |

A bank attempt is then taken, saved and graded like any other.

## Drive file order (`…0900_drive_order.sql`)

`drive_files.sort_order` (0–9999, or null): admins set it in Admin → Drive.
Files with an order come first in their folder, then the rest by name.

## Testing

`supabase/tests/` holds SQL tests for the exam rules, the Drive functions,
and classes, bank practice and bookmarks.
They run against a plain Postgres (a stub stands in for Supabase's `auth`
schema):

```sh
PGHOST=localhost PGPORT=5432 PGUSER=postgres bash supabase/tests/run.sh
```

Each run creates a scratch database, applies every migration, runs the tests
and drops it. With the Supabase CLI, `supabase start` then `supabase db reset`
gives a full local stack instead.

## Changing the schema

Add a new file to `supabase/migrations/` (never edit one that's been
applied), named with the next timestamp, and keep its header comment
up to date. Run the SQL tests, then `supabase db push` to apply it.
A new kind of student progress needs no migration: declare its key in
`src/lib/storageSchema.ts` and it's saved in `progress`.
