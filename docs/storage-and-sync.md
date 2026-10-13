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

The storage helpers, the saving code and sign-out all follow this table, so a
new kind of progress is declared once, here.

## On the server

`user_state` holds one row per student per key, with the key without its
`pendik:` prefix (`flashcards:1.2/anatomy`) and the value as JSON (at most
512 KB). Row level security lets each student read and write only their own
rows. Nothing in it earns points: the leaderboard counts only the study
records below. See [database.md](database.md#studying-06_studysql).

## Loading and saving

`src/lib/progressSync.ts`, driven by `src/context/AccountContext.tsx`:

1. **Sign-in:** `loadProgress()` reads every row (1,000 at a time) into
   memory. Until it's done the app shows its loading screen; if it fails,
   it says so instead of starting with empty progress.
2. **A change:** `writeJSON()` updates memory and calls `queueSave()`. Saves
   wait 1.5 s after the last change, then upsert every changed key in one
   request (200 rows a batch). A value set to `null` (a finished quiz's
   resume slot) deletes the row.
3. **Coming back to the tab:** `refreshProgress()` reads only the rows
   changed since the last read (by `updated_at`, which the database stamps
   with its own clock, re-reading a minute back to be safe), so progress
   made on another device shows up without downloading everything again. It
   skips this while there are unsaved changes, so it never overwrites them.
   Keys deleted on another device show up at the next sign-in.
4. **Sign-out:** waits for pending saves, then forgets the progress in
   memory.

The save state (saving, saved, failed, how many changes wait) shows on the
Account page, with **Save now**. A failed save keeps its changes and tries
again with the next change, when the connection comes back, or with **Save
now**; closing the tab with unsaved changes asks first.

With no connection, the app still opens from its offline cache and pages
work from what's in memory, but nothing new is saved until it's back online.

## Study records (points)

What earns leaderboard points is sent separately, by
`src/lib/studyRecords.ts`: each graded flashcard or occlusion label
(`record_reviews`), each finished quiz or block exam with the option picked
for every question (`record_quiz`, graded again on the server), each chapter
marked finished (`finish_chapter`) and each study day (`record_study_day`).
They wait in an outbox kept on the device (so offline studying isn't lost on
a reload) and go out a moment after the last one, before the tab is hidden,
when the connection comes back, at sign-out and before the leaderboard is
read. A record the server refuses (an item not in the catalog) is dropped.

## Exams

Past-paper attempts aren't in `user_state`: they're rows in `attempts`, run by
SQL functions with a server-side timer (see [database.md](database.md#exams-and-practice-04_examssql)).
The app loads the student's packages and attempts at sign-in into a small
store, `src/lib/exams.ts`, which Home, the exam plan and readiness read. The
pooled block exam (questions drawn from the block's quiz banks) keeps its
history in `user_state` as `examhistory:{block}`, and its answers are sent as
quiz records.

## Adding a new kind of progress

1. Add its type to `KEY_TYPES` in `storageSchema.ts` with `saved: "server"`.
2. Add a key helper to `STORAGE_KEYS` in `storage.ts`.
3. Read and write it with `readJSON` / `writeJSON` (or `useLocalStorage`).

That's all: it's saved in the account and cleared at sign-out. If it should
earn leaderboard points, it needs a study record: see
[database.md](database.md#changing-the-schema).
