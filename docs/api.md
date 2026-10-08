# Server API

There's no server of our own. The browser talks to Supabase:

- **Tables and SQL functions** through supabase-js (`src/lib/supabase.ts`),
  with the signed-in student's token. Row level security and the functions'
  own checks decide what each call may do; they're described in
  [database.md](database.md). The app's wrappers are in `src/lib/exams.ts`
  (attempts), `src/lib/admin.ts` (admin pages), `src/lib/leaderboard.ts`,
  `src/lib/classReadiness.ts` and `src/lib/progressSync.ts`.
- **Three Edge Functions** (Deno, in `supabase/functions/`) for what needs a
  secret: the AI key, the service role, or Google's credentials. They're
  below.

Shared code for the functions is in `supabase/functions/_shared/`. It has no
imports beyond its own folder, so the same files are unit-tested with Vitest
(`*.test.ts` next to them) and typechecked with `tsconfig.functions.json`.

## Conventions

- Address: `https://<project-ref>.supabase.co/functions/v1/<name>`.
- All take `POST` with a JSON body and answer JSON (except the AI's text
  stream). Errors are `{ "error": "message" }` with a fitting status.
- Browsers from addresses not in the `APP_ORIGINS` secret get no CORS
  headers, so their calls fail.
- `ai` and `admin-accounts` need `Authorization: Bearer <access token>` (and
  the `apikey` header supabase-js sends); Supabase checks the token before
  the function runs (`verify_jwt = true` in `supabase/config.toml`).

## `ai`: "Explain this" and Alfond

For signed-in students on the roster. Secrets: `AI_BASE_URL`, `AI_API_KEY`,
`AI_MODEL`, `AI_DAILY_LIMIT`, `APP_ORIGINS`. Called by `src/lib/aiStream.ts`.

### POST /ai/explain

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
matching passages the browser already found in the ebook and summary.

### POST /ai/chat

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

Both take one answer from the student's daily allowance (`ai_take()`) before
calling the gateway, and give it back (`ai_refund()`) if the answer fails.
The response is a plain-text stream; the header `x-ai-remaining` says how
many answers are left today. `401` without a valid token, `403` for an
account that isn't on the roster, `429` with the allowance used up, `503`
with no AI configured.

## `admin-accounts`: activate, lock, unlock, reset

Admins only (the function checks `profiles.role`). Uses the service role to
change Supabase Auth users. Called by `accountAction()` and
`activateAccounts()` in `src/lib/admin.ts`.

```json
{ "action": "activate", "student_ids": ["2601001", "2601002"] }
```

Creates the Auth user (`<nim>@pendik26.internal`, password `pendik26` + NIM)
and the profile for each roster student, up to 300 at once. Answers
`{ "results": [{ "student_id": "2601001", "ok": true }, …] }`, with a
`message` on each one that failed.

```json
{ "action": "lock", "user_id": "<uuid>" }
{ "action": "unlock", "user_id": "<uuid>" }
{ "action": "reset", "user_id": "<uuid>" }
```

Lock bans the Auth user, so they can't sign in or renew their session;
unlock lifts it; reset sets the password back to the first password and makes
them change it at next sign-in. An admin can't lock or reset their own account.

## `drive-sync`: copy the class Drive

Called by the daily GitHub Action with `x-sync-secret: <DRIVE_SYNC_SECRET>`,
or by an admin from Admin → Drive with their token (`verify_jwt = false`, so
the function checks both itself). Secrets: `GOOGLE_SERVICE_ACCOUNT`,
`DRIVE_ROOT_FOLDER_ID`, `DRIVE_SYNC_SECRET`, `DRIVE_SYNC_BUDGET_MS`,
`APP_ORIGINS`.

```json
{}
```

Does one step of the current sync (or starts one): walks folders until its
time budget runs out, saves the files it found and where it got to, and
answers the run's state, `{ "status": "running" | "done" | "held" | "failed",
"filesFound": …, "remaining": … }`. Call again while it says `running`.

```json
{ "action": "apply", "run_id": "<uuid>" }
```

Admins only: lets a held run go ahead (marks the files it didn't see as
missing).

## Tests

```sh
npm test                 # Vitest, including supabase/functions/_shared/*.test.ts
bash supabase/tests/run.sh   # the SQL rules, see database.md
```
