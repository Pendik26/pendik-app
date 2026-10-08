# Database

Accounts, synced progress, the leaderboard, the AI allowance and the Class
Drive's cached listing live in one MongoDB database (MongoDB Atlas in
production; the cluster itself, its limits and how to scale it are in the
[MongoDB Atlas cluster](atlas.md) page). Everything else (content, the
knowledge map, search) is static and never touches it. Without `MONGODB_URI`
the site still works, as guest only.

## Connection

```text
browser ──► Vercel Function api/index.ts (sin1) ──► Atlas (Singapore)
              │  one MongoClient per function instance (server/mongo.ts)
              └─ server/app.ts routes ─► stores: progressStore, leaderboard,
                                         ai, drive, Better Auth's adapter
```

- **Settings:** `MONGODB_URI` (an Atlas `mongodb+srv://` string for a user
  with `readWrite` on this database only) and `MONGODB_DB` (default
  `medicine`). Set them in Vercel's environment variables; never commit them.
  `.env.example` shows the shape.
- **One client per instance.** `getMongo()` keeps the connecting client on
  `globalThis`, so a warm function instance reuses its connection pool across
  requests. A failed connect is forgotten, so the next request tries again.
- **Pool:** at most 5 connections per instance. A connection idle for 60
  seconds is closed (`maxIdleTimeMS`), so instances winding down don't hold
  connections against the cluster's limit (500 on the free tier).
- **Timeouts:** an unreachable cluster fails after 5 seconds
  (`serverSelectionTimeoutMS`, not the driver's 30), and a query that hangs
  after 20 (`socketTimeoutMS`). The API then answers `503` or `500` quickly,
  and the app keeps working offline.
- **Region:** the function runs in `sin1` (Singapore, `vercel.json`), next to
  the Atlas cluster, so each query is a few milliseconds. Move both together.
- **Network access:** Atlas allows Vercel either by `0.0.0.0/0` (the database
  user's password is then the protection) or through the Vercel ↔ Atlas
  integration.
- **Indexes** are created once per cold start, off the request path
  (`ensureIndexes()` in `server/schema.ts`); when they exist it's one quick
  round trip per collection.

## Collections

Every collection and index is declared in `server/schema.ts`.

| Collection | Owner | One document per | Expires |
| --- | --- | --- | --- |
| `user` | Better Auth | account | when deleted |
| `session` | Better Auth | signed-in device | at `expiresAt` (60 days, renewed daily) |
| `account` | Better Auth | sign-in method (password, Google) | with the user |
| `verification` | Better Auth | pending token | at `expiresAt` |
| `rateLimit` | Better Auth | rate-limited key | overwritten |
| `progress` | sync | user × synced key | with the user |
| `leaderboard` | leaderboard | user | with the user |
| `aiUsage` | AI | user × UTC day | two days after the day |
| `driveSnapshot` | Class Drive | listing (the tree, each opened archive folder) | 30 days unsaved |

### `progress`

```js
{ userId, key: "medicine:quiz:1.2/anatomy", value: [/* … */],
  updatedAt: 1759740000000, rev: 1759740001234 }
```

One document per synced `localStorage` key (see
[Storage and sync](storage-and-sync.md)). `updatedAt` is the browser's time
of the change, used to merge; `rev` is the server's time of the write, used
to answer "what changed since". A sync reads the keys it sends (`$in`), writes
them in one unordered `bulkWrite` of upserts, and reads back what changed
since the client's last `rev`. Reads project only `key`, `value`,
`updatedAt` and `rev`.

| Index | Serves |
| --- | --- |
| `user_key` `{ userId, key }`, unique | reads and upserts of one key |
| `user_rev` `{ userId, rev }` | "changed since" and the account export |

### `leaderboard`

```js
{ userId, joined: true, displayName: "Siti", cohort: "2025",
  parts: { "medicine:quiz:1%2E2/anatomy": { correctAnswers: 18 }, … },
  daily: { "2026-10-06": 20, … },
  readiness: { "1_2": 74 },
  updatedAt: 1759740000000 }
```

- `parts` holds one small score per scoring key. Dots are stored as `%2E`,
  since MongoDB reads a dot in a field name as a path. A sync `$set`s only the
  parts it changed, so two syncs at once can't overwrite each other.
- `daily` is points gained per UTC day, for two weeks (older days are
  `$unset` as new ones are added); the weekly board sums the last seven.
- `readiness` is the exam readiness per block (`1.2` stored as `1_2`), for the
  class average. Averages are an aggregation over students who have one, and
  are only shown when at least three do.
- Reading the board fetches only what the period needs: `daily` for the
  week, `parts` for all time and streaks, and never `readiness`. It filters
  by cohort in the query.

| Index | Serves |
| --- | --- |
| `user` `{ userId }`, unique | the student's own record, every sync |
| `joined` `{ joined }` | the board |

### `aiUsage`

```js
{ _id: "<userId>:2026-10-06", userId, day: "2026-10-06", count: 7,
  expiresAt: ISODate("2026-10-08") }
```

Each AI answer is one atomic `findOneAndUpdate` with `$inc` and an upsert, so
the daily limit holds even with requests in parallel. A failed answer is
refunded. A TTL index on `expiresAt` deletes the day's document two days
later.

### `driveSnapshot`

```js
{ _id: "tree", tree: { root, updatedAt, complete, deferred }, savedAt }
{ _id: "folder:<key>", tree: { root, updatedAt, complete }, savedAt }
```

The last listing of the class Drive, and of each archive folder someone has
opened, so a cold start serves at once instead of walking Drive first.
`deferred` maps the opaque keys the browser uses to archive folders' ids,
which never leave the server. A TTL index on `savedAt` deletes a listing
nobody has asked for in 30 days; the next request just reads Drive again.

### Better Auth's collections

Better Auth (`server/auth.ts`) owns `user`, `session`, `account`,
`verification` and `rateLimit` and creates no indexes on MongoDB itself;
`schema.ts` adds them: unique `email` and session `token`, `userId` on
sessions and accounts, `providerId + accountId` on accounts, and TTL indexes
that delete expired sessions and verification tokens. Passwords are hashed
(scrypt), and Google's OAuth tokens are stored encrypted.

The cohort a student enters is an extra `user` field. Sessions last 60 days
and are renewed once a day of use.

## What each request does

| Request | Database work |
| --- | --- |
| Any signed-in route | the session and its user (two indexed reads), or none from the session cookie cache |
| `POST /api/sync` | progress: one `$in` read, one `bulkWrite`, one "changed since" read; leaderboard: one read and one update when scoring keys changed |
| `GET /api/leaderboard` | the student's record, then one projected read of the joined students |
| `GET /api/readiness` | one aggregation |
| `POST /api/ai/*` | one `findOneAndUpdate` (and a refund on failure) |
| `GET /api/drive*` | none when the listing is in memory; one read on a cold start; one replace after Drive is walked |
| `GET /api/account/export` | every progress document of the student |
| Account deletion | `deleteMany` on progress, `deleteOne` on the leaderboard, then Better Auth's user, sessions and accounts |

**Session cookie cache.** Better Auth keeps the session and user in a
signed cookie for five minutes. Routes that only read (the Drive listings and
the class average) use it and skip the two lookups. Every route that can
write something (sync, the leaderboard, readiness, AI, export) checks the
database each time, so nothing is saved for an account that was just signed
out or deleted on another device. When the cached cookie is renewed, the
API sends the new cookie with its answer.

## Sizes

A student's data is small: a few dozen `progress` documents (a flashcard
deck's review state is the largest, tens of kilobytes) and one leaderboard
document of a few kilobytes. A class of a few hundred students fits easily in
the free tier's 512 MB. The largest single document is the Class Drive
listing, about a hundred kilobytes per few thousand files, well under
MongoDB's 16 MB document limit. Archives are split per cohort folder, so they
can't make it grow without bound.

## Privacy and deletion

- Deleting an account removes the student's progress and leaderboard record
  first, then Better Auth deletes the user, sessions and sign-in methods.
- **Account → Download my data** (`GET /api/account/export`) returns the
  user record and every synced key.
- Nothing personal is in `aiUsage` beyond the user id and a count, and it is
  gone after two days. The Drive listings hold no personal data.
- See the [privacy policy](../public/legal/privacy.html) for what students are
  told.

## Running and testing

- `npm run dev:api` serves the API from the Vite dev server with in-memory
  stores (no database needed); set `MONGODB_URI` in `.env.local` and use
  `vercel dev` to run against a real database.
- `server/mongo.integration.test.ts` runs the MongoDB stores against a real
  server in a throwaway database, which it drops afterwards:

  ```bash
  MONGODB_TEST_URI=mongodb://127.0.0.1:27017 \
    npx vitest run server/mongo.integration.test.ts
  ```

  It checks that every declared index is created (TTLs included), progress
  writes and reads, concurrent score updates, the board's projections, and
  the Drive snapshots.

## Changing the schema

1. Declare new collections and indexes in `server/schema.ts`. Indexes are
   created on the next cold start; give each a `name`, and never reuse a name
   with different keys (MongoDB refuses, and the old index stays).
2. Read and write through a store class with an in-memory twin for tests, as
   `progressStore.ts` and `leaderboard.ts` do, and project only the fields
   you use.
3. Documents written by older versions stay in the database: read them
   tolerantly (missing fields) or repair them on first use, as the
   leaderboard does for records from before score parts.
4. Anything personal must be deleted with the account (`onDeleteUser` in
   `api/index.ts`) and included in the export.
5. Update this page and the table in
   [Storage and sync](storage-and-sync.md).

## Operations

- **Backups:** the free tier has no automatic backups. Students' progress
  also lives in their browsers and their own exports, but for a copy of the
  server's, run `mongodump --uri "$MONGODB_URI"` from a trusted machine.
- **Monitoring:** Atlas → Metrics shows connections, operations and
  storage; the Performance Advisor (missing indexes) needs a dedicated tier.
  The cluster's limits and how to scale it are in
  [MongoDB Atlas cluster](atlas.md).
- **Rotating the password:** change the database user's password in Atlas,
  update `MONGODB_URI` in Vercel and redeploy. Old function instances drop
  their connections within a minute of going idle.
