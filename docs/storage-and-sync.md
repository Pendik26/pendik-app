# Storage and sync

The browser is the source of truth. Every bit of progress is a `localStorage`
key, the app works the same signed in or not, and sync is a background job
that keeps one device's keys in step with the account's copy.

## Keys

Keys look like `medicine:{type}` (one value per device) or
`medicine:{type}:{id}`, where the id is a subject key (`1.2/anatomy`), an exam
key (`1.1` or `1.1/ub2025`) or a name (`skeletal-muscle/voltage`).

`src/lib/storageSchema.ts` declares every type once in `KEY_TYPES`:

```ts
flashcards: { id: "subject", sync: "cards", about: "SM-2 state per card id" },
quizinprogress: { id: "subject", sync: false, about: "An unfinished quiz" },
theme: { id: null, sync: false, keepOnClear: true, about: "Light or dark" },
```

- `id` says what the id part is, or `null` for a single value.
- `sync` is the merge rule (below), or `false` to keep the key on the device.
- `keepOnClear` keeps it through "sign out and clear this device" (appearance
  only, never progress).

Everything else reads this table: the storage helpers in `storage.ts`, the
sync engine, sign-out clearing, the legacy-key migration and the server's
leaderboard scoring (the file has no imports so the server can load it). A
well-formed key of a type this build doesn't know, written by a newer version,
syncs as `latest`, so an old copy of the app never drops it.

## Merge rules

When two copies of a key meet (on the server, or when a download meets a
local edit), `src/lib/syncMerge.ts` combines them by the key's rule:

| Rule | Used for | How two copies combine |
| --- | --- | --- |
| `cards` | flashcard and occlusion review state | per card, the copy reviewed more often (then the later due date) |
| `attempts` | quiz and exam history | union of attempts, without duplicates |
| `set` | study days, finished chapters, opened Drive files | union |
| `position` | ebook reading position | the later one, by its own timestamp |
| `counts` | the study log | per day and counter, the larger number (never added twice) |
| `latest` | settings, exam plans, lab data, everything else | the most recently changed copy |

Merging is idempotent, so a change that's sent twice does no harm. Object keys
that come from data (card ids, subject keys) are read and written with the
helpers in `src/lib/records.ts`, so an id like `__proto__` is just a key.

## The sync round

`src/lib/sync.ts`, scheduled by `src/context/AccountContext.tsx`:

1. Writing a syncable key records it in a "dirty" map with the time
   (`syncDirty.ts`, stored as `medicine:sync:dirty`).
2. A sync runs 4 s after a change, every 5 minutes, when the tab regains focus
   and when the network comes back; one at a time.
3. It uploads the dirty keys in batches of 400 to `POST /api/sync`, with
   `since`: the server time of the last successful sync.
4. The server merges each change into its stored copy, saves it with
   `rev = now`, rescores the leaderboard for the keys that affect it, and
   answers with every key changed since `since` (minus 5 s, to cover writes
   that raced the request).
5. The browser applies what came back. If a key was edited locally while the
   request was in flight, the download is merged with that edit, and the key
   stays dirty for the next round.
6. `medicine:sync:state` stores `{ userId, since, lastSyncedAt }`.

**First sync for an account** (no state, or a different user id) uploads
every syncable key with `since = 0`. That is how guest progress joins an
account: it's merged key by key with whatever the account already has, so two
devices used as a guest lose nothing.

**Signing out** keeps the keys (the student carries on as a guest). "Sign out
and clear this device" removes every `medicine:*` key that isn't
`keepOnClear`, plus the sync state and the Class Drive's cached listing.

## On the server

Each synced key of each user is one document in the `progress` collection:
`{ userId, key, value, updatedAt, rev }`, unique on `(userId, key)` and
indexed on `(userId, rev)` for "what changed since". `server/progressStore.ts`
has the MongoDB store and an in-memory one for tests and `npm run dev:api`.

The leaderboard keeps one document per student with a score part per scoring
key. A sync rescores only the keys it wrote, as separate field updates, so it
never re-reads a student's whole history, and two syncs at once can't
overwrite each other (`server/leaderboard.ts`).

Every collection and index is listed in `server/schema.ts` and created once
per cold start:

| Collection | Owner | Holds |
| --- | --- | --- |
| `user`, `session`, `account`, `verification`, `rateLimit` | Better Auth | accounts and sessions (sessions and tokens expire by TTL index) |
| `progress` | sync | one document per user per key |
| `leaderboard` | leaderboard | membership, display name, score parts, readiness per block |
| `aiUsage` | AI | answers used per user per day (expires after two days) |
| `driveSnapshot` | Class Drive | the latest Drive listing and each opened archive folder, for cold starts (30-day TTL) |

Each collection's documents, indexes and queries, the connection settings
and how to test against a real database are in [Database](database.md).

## Legacy keys

Older versions stored progress under the bare subject id
(`medicine:flashcards:anatomy`). `src/lib/progressMigration.ts` renames those
to per-block keys on start-up and after importing an old backup.

## Export and import

**Progress → Export** writes every `medicine:*` key to a JSON file;
**Import** writes them back, replacing the same keys on this device, and
marks them for sync. **Account → Download my data** is the server's copy
(`GET /api/account/export`).

## Adding a new kind of progress

1. Add a type to `KEY_TYPES` with its id kind, merge rule and description.
2. Read and write it through `storageKey()` and the helpers in `storage.ts`
   (or `useLocalStorage`), which mark it dirty for sync.
3. If it should count for the leaderboard, add its scoring in
   `server/leaderboard.ts` with a test.
4. If it holds anything personal, update the privacy policy in
   `public/legal/` and the [privacy help page](../content/help/privacy.md).

`storageSchema.test.ts` and `syncMerge.test.ts` cover the registry and the
rules; `server/sync.e2e.test.ts` runs two browser engines against the real
handler.
