# Database

MongoDB, in one database (`pendik` by default). Better Auth keeps `user`, `session`, `account`, `verification`
and `rateLimit`; the app keeps the rest. The shapes and indexes are in [`server/db.ts`](../server/db.ts).

| Collection | Holds |
| --- | --- |
| `students` | the roster: `_id` is the NIM, name, cohort, class (track), class group |
| `accounts` | an activated student: `_id` is the Better Auth user id, `nim`, role, `mustChangePassword`, display name, leaderboard opt-in, `lockedAt` |
| `questions`, `imports`, `packages` | the past-paper question bank (answer keys live here, server side only) |
| `attempts` | exam and practice attempts with their frozen questions and graded answers; one in progress per student |
| `bookmarks` | bookmarked bank questions |
| `cardReviews`, `quizAnswers`, `chaptersDone`, `studyDays` | the study records that earn points |
| `points`, `examCorrect` | points per student, day and source (they only go up); exam answers already counted |
| `userState` | everything else a student's app saves (review schedules, plans, settings), by key |
| `readiness` | each student's readiness per block (for the class average) |
| `driveFiles`, `driveSyncRuns` | the class Drive copy and the sync's runs |
| `aiUsage` | questions asked per student per day |
| `auditLog` | what admins did |

**Who can see what.** The browser never talks to MongoDB. Every read and write goes through the API
([api.md](api.md)), which checks the signed-in student first, so each function only touches that student's own
rows (admins: the admin functions). Answer keys are never sent while an attempt is in progress.

**Days** (`day` fields) are UTC `YYYY-MM-DD`, from the server's clock, never the browser's.

**Points:** 1 per quiz or exam question answered right (once a day each), 2 per card or label learned (reviewed on two
different days), 10 per finished chapter, 5 per study day.
