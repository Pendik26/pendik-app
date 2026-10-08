# API reference

The whole API is one Vercel Function, `api/index.ts`, which builds the app in
`server/app.ts` once per cold start and routes by path. `vercel.json`
rewrites `/api/*` to it. In development, `npm run dev:api` serves the same
handler from the Vite dev server (`server/devApi.ts`) with in-memory storage,
or with your database if `MONGODB_URI` is set.

Without `MONGODB_URI` and `BETTER_AUTH_SECRET`, every route answers `503`
and the app runs as a guest-only static site.

## Conventions

- Requests and responses are JSON, except the AI routes, which stream plain
  text.
- Signed-in routes use the Better Auth session cookie; there are no API keys
  for clients.
- Errors are `{ "error": "A sentence a student can read." }` with the status:
  `400` invalid input, `401` signed out, `405` wrong method, `413` too large,
  `429` AI allowance used up, `502` Google Drive unreachable, `503` feature
  not configured, `500` anything else.
- Responses are `cache-control: no-store`, except the Drive listing (below).

## Routes

| Method | Path | Sign-in | What it does |
| --- | --- | --- | --- |
| any | `/api/auth/*` | – | Better Auth: sign up, sign in (email or Google), sessions, profile, delete account |
| GET | `/api/config` | – | which features are switched on |
| POST | `/api/sync` | yes | upload changed progress keys, download what changed since the last sync |
| GET | `/api/account/export` | yes | everything stored for the account |
| GET | `/api/leaderboard` | yes | a ranked board, and the student's own row |
| PUT | `/api/leaderboard/me` | yes | join or leave, change the display name |
| GET, PUT | `/api/readiness` | yes | the class's average readiness for a block; record your own |
| POST | `/api/ai/explain` | yes | stream an explanation of a quiz question or flashcard |
| POST | `/api/ai/chat` | yes | stream Alfond's reply |
| GET | `/api/drive` | yes | the Class Drive listing |
| GET | `/api/drive/folder?key=` | yes | one archive folder's contents, read when it's opened |

### GET /api/config

```json
{ "accounts": true, "google": true, "ai": true, "drive": false }
```

The app reads this once at start-up to decide what to show (the Google
button, the AI button and Alfond, the Class Drive).

### POST /api/sync

```json
{
  "since": 1759000000000,
  "changes": [
    {
      "key": "medicine:flashcards:1.2/anatomy",
      "value": {},
      "updatedAt": 1759000123456
    }
  ]
}
```

- `since` is the `serverTime` of the previous sync, or `0` for the first.
- Up to 1,000 changes and 2 MB per request. Every key must be a syncable
  `medicine:*` key (see [storage and sync](storage-and-sync.md)), and
  `updatedAt` a time no later than a day ahead; otherwise the whole request is
  rejected with `400`.
- Each change is merged into the stored copy by the key's rule.

Response:

```json
{
  "serverTime": 1759000200000,
  "entries": [{ "key": "…", "value": {}, "updatedAt": 1759000150000 }]
}
```

`entries` is every key changed since `since` minus 5 seconds.

### GET /api/account/export

```json
{
  "exportedAt": "2026-10-06T07:00:00.000Z",
  "user": {
    "id": "…",
    "name": "…",
    "email": "…",
    "cohort": "2026",
    "createdAt": "…"
  },
  "progress": [
    { "key": "medicine:…", "value": {}, "updatedAt": "2026-10-05T12:00:00Z" }
  ]
}
```

### GET /api/leaderboard

Query: `period` = `week` (default), `all` or `streak`; `scope` = `everyone`
(default) or `cohort` (only when the student has a cohort).

The response has `rows` (up to 100 of `{ rank, name, cohort, value, me }`,
with `me` true on the student's own row), `total`, the `points` table, and
`me` (joined, display name, rank, this period's value, week, streak and
stats). Points are
always computed on the server from synced progress; see
[calculations](calculations.md#leaderboard).

### PUT /api/leaderboard/me

```json
{ "joined": true, "displayName": "Night owl" }
```

Either field may be left out. Display names are 2 to 32 characters.

### /api/readiness

- `PUT { "block": "1.2", "value": 63.5 }` records the student's readiness
  (0–100) for a block. The app sends it when it moves by a whole point.
- `GET ?block=1.2` answers
  `{ "cohort": "2026", "count": 12, "average": 58 }`: the cohort's average
  (everyone's, without a cohort). `average` is `null` until at least 3
  students have one.

### POST /api/ai/explain

```json
{
  "subject": "Physiology",
  "question": "A triad consists of:",
  "options": ["…", "…"],
  "answer": "One T-tubule and two terminal cisternae",
  "chosen": "Two T-tubules and one terminal cisterna",
  "explanation": "The bank's own explanation",
  "notes": [{ "title": "Chapter 1: The triad", "text": "…" }]
}
```

`question` and `answer` are required; the rest is optional and trimmed to
fixed limits (8 options, 4 notes of 2,400 characters). The notes are the
matching passages the browser already found.

### POST /api/ai/chat

```json
{
  "messages": [{ "role": "user", "content": "What does this mean?" }],
  "page": {
    "title": "Chapter 2 · Physiology",
    "path": "/ebooks/1.2/physiology/chapter-02",
    "text": "…"
  }
}
```

The last 12 messages are kept (3,000 characters each), and the conversation
must end with the student's message. `page` is optional (up to 6,000
characters of text).

Both AI routes take one answer from the student's daily allowance before
calling the gateway, and give it back if the answer fails. The response is a
plain-text stream; the header `x-ai-remaining` says how many answers are left
today. With the allowance used up they answer `429`; with no AI configured,
`503`.

### GET /api/drive

Query: `refresh=1` asks for a fresh read of Google Drive (honoured once the
listing is 30 s old).

```json
{
  "updatedAt": 1759000000000,
  "complete": true,
  "root": {
    "name": "…",
    "folders": [],
    "files": [
      {
        "id": "…",
        "name": "…",
        "kind": "slides",
        "size": 1234,
        "modifiedTime": "…",
        "createdTime": "…"
      }
    ]
  }
}
```

Folders are sent by name only, never with their Drive ids: the class folder
may be shared as editable, and its ids would let anyone open it. Files carry
the id Google's viewer needs. `complete` is `false` when the walk stopped
early (too many folders, or a folder failed to list).

The response carries an `ETag` and `cache-control: private, no-cache`; a
request with a matching `If-None-Match` gets `304` with no body. Without a
configured Drive it answers `503`, and `502` if Google can't be reached and
there's no saved copy.

Linked folders (every folder shortcut in the class folder, and any folder in
`GOOGLE_DRIVE_ON_DEMAND_FOLDERS`, see
[deploying](deploying.md#class-drive-optional)) come with `"archive": true`.
Their own folders (one per cohort, say) come with no contents and a
`"deferred"` key instead:

```json
{
  "name": "ANGKATAN 2020",
  "folders": [],
  "files": [],
  "deferred": "r8_axc-74j3ZJjTh"
}
```

### GET /api/drive/folder

Query: `key` (16 characters, from a `deferred` folder) and optionally
`refresh=1`. Answers with that folder's own listing, in the same shape as
`/api/drive` (its `root` is the folder), walked on first request with a folder
budget of its own and then kept like the main listing. The key is a hash of
the folder's id, which never leaves the server. `400` for a malformed key,
`404` for a key that isn't in the current listing; ETags work the same way.

The crawl and cache are described in
[calculations](calculations.md#sync-and-the-class-drive) and
[deploying](deploying.md#class-drive-optional).

## Tests

`server/app.test.ts`, `server/ai.test.ts`, `server/drive.test.ts`,
`server/leaderboard.test.ts` and `server/readiness.test.ts` run the handler
with in-memory stores and a stubbed fetch. `server/sync.e2e.test.ts` drives
two browser sync engines against it. `server/mongo.integration.test.ts` runs
against a real MongoDB when `MONGODB_TEST_URI` is set.
