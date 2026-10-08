# Storage and saving

A student's progress is saved in their account, on the server only. At
sign-in the app loads all of it into memory; pages read from memory, and each
change is sent to the server a moment after it's made. Device settings
(theme, language, sidebar, recent pages) stay in the browser's
`localStorage`. Pages don't need to know which is which: they all use the
same helpers in `src/lib/storage.ts` (`readJSON`, `writeJSON`).

## Keys

Keys look like `pendik:{type}` (one value) or `pendik:{type}:{id}`, where the
id is a subject key (`1.2/anatomy`), an exam key (`1.1`) or a name
(`skeletal-muscle/voltage`).

`src/lib/storageSchema.ts` declares every type once in `KEY_TYPES`:

```ts
flashcards: { id: "subject", saved: "server", about: "SM-2 review state per card id" },
theme: { id: null, saved: "device", about: "Light or dark theme" },
```

- `id` says what the id part is, or `null` for a single value.
- `saved` is `"server"` (the student's account) or `"device"` (this browser
  only).

The storage helpers, the saving code, sign-out and the leaderboard's scoring
in the database (`progress_score()`) all follow this table, so a new kind of
progress is declared once, here.

## On the server

The `progress` table holds one row per student per key, with the key
without its `pendik:` prefix (`flashcards:1.2/anatomy`) and the value as
JSON (at most 512 KB). Row level security lets each student read and write
only their own rows. See [database.md](database.md#study-progress-leaderboard-readiness-ai-0500_studysql).

## Loading and saving

`src/lib/progressSync.ts`, driven by `src/context/AccountContext.tsx`:

1. **Sign-in:** `loadProgress()` reads every row (1,000 at a time) into
   memory. Until it's done the app shows its loading screen; if it fails,
   it says so instead of starting with empty progress.
2. **A change:** `writeJSON()` updates memory and calls `queueSave()`. Saves
   wait 1.5 s after the last change, then upsert every changed key in one
   request (200 rows a batch). A value set to `null` (a finished quiz's
   resume slot) deletes the row.
3. **Coming back to the tab:** `refreshProgress()` reads the account again,
   so progress made on another device shows up. It skips this while there
   are unsaved changes, so it never overwrites them.
4. **Sign-out:** waits for pending saves, then forgets the progress in
   memory.

The save state (saving, saved, failed, how many changes wait) shows on the
Account page, with **Save now**. A failed save keeps its changes and tries
again with the next change, when the connection comes back, or with **Save
now**; closing the tab with unsaved changes asks first.

With no connection, the app still opens from its offline cache and pages
work from what's in memory, but nothing new is saved until it's back online.

## Exams

Past-paper attempts aren't in `progress`: they're rows in `attempts`, run by
SQL functions with a server-side timer (see [database.md](database.md#attempts-0300_attemptssql)).
The app loads the student's packages and attempts at sign-in into a small
store, `src/lib/exams.ts`, which Home, the exam plan and readiness read. The
pooled block exam (questions drawn from the block's quiz banks) is still kept
in `progress` as `examhistory:{block}`.

## Adding a new kind of progress

1. Add its type to `KEY_TYPES` in `storageSchema.ts` with `saved: "server"`.
2. Add a key helper to `STORAGE_KEYS` in `storage.ts`.
3. Read and write it with `readJSON` / `writeJSON` (or `useLocalStorage`).

That's all: it's saved in the account and cleared at sign-out. If it should
earn leaderboard points, add it to `progress_score()` in a new migration.
