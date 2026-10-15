# Running Pendik

Checks and routines for the live site. Nothing here needs code; most steps are in Vercel, Atlas or the app.

## After every deploy: a five-minute walk-through

Do this on the live site with a test student (not a real one) after a deploy that touches sign-in, exams or the database.

1. Sign in with the NIM and first password; the app forces a new password. Sign out and in again with the new one.
2. Home, Schedule and Class Drive load; Drive shows files.
3. Start a practice package, answer two questions, leave, come back: **Continue** appears on Home.
4. Take a short exam package and submit. The result page shows right and wrong answers and the score.
5. As admin: Data → Students lists the roster; Question bank search returns questions; Drive sync shows the last run.
6. In Atlas → Collections, the test student's attempt is in `attempts`, with the answers just given.

The API side of steps 3 and 4 is tested on every pull request (`server/app.test.ts`, "runs an exam"). This walk-through
is what confirms the deploy, its environment variables and Atlas are wired together.

## Backups (MongoDB Atlas)

Exam attempts and study progress cannot be recreated, so they need real backups.

- The free cluster has no Cloud Backup. Either move to a paid tier (M10 and up: Cluster → Backup → turn on, daily
  snapshots, keep at least 7 days) or run `mongodump` on a schedule from a machine you control.
- Practise a restore once, into a **new** throwaway cluster or database, and check `accounts`, `attempts` and `userState`
  have rows. A backup that has never been restored is not yet a backup.
- Question imports (`imports`) hold the original Markdown with answer keys, so a lost question bank can be rebuilt from it.

## Monitoring

- **Errors:** Vercel → project → Logs, filter by status 5xx. Turn on Vercel's error notifications (Settings → Notifications)
  so a failing `/api` raises an email.
- **Uptime:** point a free monitor (UptimeRobot, Better Stack or similar) at `https://<site>/api/config`. It answers 200
  with JSON without signing in, and fails (503) when `MONGODB_URI` or `BETTER_AUTH_SECRET` is missing. It does not read the
  database, so also watch Atlas (below) for a cluster that is down.
- **Drive sync:** the admin Drive tab shows a sync alarm when a run stalls; the daily GitHub Action also fails visibly.
- **Atlas:** Alerts → add "connections above 80%" and "storage above 80%".

## Limits on the API

Each student has per-minute limits (see [api.md](api.md#limits)). If a class on one Wi-Fi hits 429 `too_many_requests` in
real use, raise the numbers in `server/rateLimit.ts`; they are per student, not per address.

## Study content is public inside the bundle

The built site is public. Page routes need sign-in, but the study files in the bundle (flashcards, quiz banks, ebooks,
summaries, module PDFs) can be fetched by anyone who has the file's address. Exam answer keys are **not** in the bundle;
they stay in MongoDB and are only sent after an attempt ends.

Decision to make: keep it (simplest, works offline, what the app does now) or move the files behind sign-in (serve them
from the API or private storage). Until then, do not put anything in `content/` that must stay private to the class.

## Keeping real people out of the repo

The repository is public. `npm run check:student-data` (also run by CI on every pull request) fails on student ids and
Indonesian mobile numbers in tracked files. Use made-up values in tests, and import rosters and phone lists through the
admin pages, never as files in the repo.
