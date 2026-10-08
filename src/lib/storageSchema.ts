// Every kind of value the app keeps in localStorage, in one table. Keys look like
// "medicine:{type}" (one value per device) or "medicine:{type}:{id}" (one per subject, block
// or exam package). The storage helpers, the sync engine and merge rules, sign-out clearing,
// the legacy-key migration and the server's leaderboard scoring all read this table, so a new
// kind of progress is declared once, here. Import-free so the server can load it.

/**
 * How sync combines two copies of one key (see syncMerge.ts):
 * - cards: per flashcard, the more-reviewed copy wins
 * - attempts: union of quiz or exam attempts
 * - set: union of strings (study days, finished chapters)
 * - position: the later reading position, by its own timestamp
 * - counts: nested daily counters; per counter, the larger copy (a day studied on two devices
 *   keeps the bigger count rather than double-counting)
 * - latest: the most recently changed copy
 * false keeps the key on this device only.
 */
export type MergeRule = "cards" | "attempts" | "set" | "position" | "counts" | "latest";

export interface KeyType {
  /** What the id part of the key is, or null for a single value. */
  id: "subject" | "exam" | "name" | null;
  sync: MergeRule | false;
  /** Survives "sign out and clear this device" (appearance, not progress). */
  keepOnClear?: true;
  about: string;
}

export const KEY_TYPES = {
  flashcards: { id: "subject", sync: "cards", about: "SM-2 review state per card id" },
  tagfilter: { id: "subject", sync: "latest", about: "Selected flashcard tags" },
  occlusion: { id: "subject", sync: "cards", about: "SM-2 review state per image-occlusion label" },
  occlusionprefs: { id: "subject", sync: "latest", about: "Image occlusion: mode, regions, last label, view toggles" },
  quiz: { id: "subject", sync: "attempts", about: "Quiz attempts: score, total, date, missed ids" },
  quizdue: { id: "subject", sync: "latest", about: "Quiz question ids due for review" },
  quizinprogress: { id: "subject", sync: false, about: "Snapshot of an unfinished quiz (large, device-only)" },
  examhistory: { id: "exam", sync: "attempts", about: "Exam attempts, per block or block/package" },
  exammode: { id: null, sync: "latest", about: "Preferred exam mode" },
  examdate: { id: "subject", sync: "latest", about: "Old per-deck exam date (read as a fallback for the block's exam plan)" },
  examplan: { id: "exam", sync: "latest", about: "A block's exam plan: date, minutes a day, target score, study time" },
  studylog: { id: null, sync: "counts", about: "How much was studied each day, per subject and kind, and at which hours" },
  todayplan: { id: null, sync: false, about: "Today's plan as drawn up this morning (device-only snapshot)" },
  lastread: { id: "subject", sync: "latest", about: "When a summary was last opened" },
  ebook: { id: "subject", sync: "position", about: "Reading position in an ebook" },
  ebookdone: { id: "subject", sync: "set", about: "Finished ebook chapter ids" },
  readingprefs: { id: null, sync: "latest", about: "Reader font size and font" },
  currentblock: { id: null, sync: "latest", about: "The block the student is in" },
  activity: { id: null, sync: "set", about: "Study days (UTC dates)" },
  labdata: { id: "name", sync: "latest", about: "Virtual Lab data table per activity, e.g. skeletal-muscle/voltage" },
  theme: { id: null, sync: false, keepOnClear: true, about: "Light or dark theme" },
  sidebarcollapsed: { id: null, sync: false, about: "Sidebar collapsed on desktop" },
  recentpages: { id: null, sync: false, about: "Pages opened recently, offered first in the command palette (device-only)" },
  mapsettings: { id: null, sync: "latest", about: "Knowledge map: filters, colors, display and forces" },
  atlas: { id: null, sync: "latest", about: "3D anatomy: recently opened structures, whether the view turns around the selection, perspective or orthographic, and the floor grid" },
  alfond: { id: null, sync: "latest", about: "Alfond settings: whether its floating button shows on every page" },
  alfondchat: { id: null, sync: false, about: "Alfond's recent conversation (device-only)" },
  lastexport: { id: null, sync: false, about: "When progress was last exported (backup nudge)" },
  driveseen: { id: null, sync: "set", about: "Class Drive file ids the student has opened" },
  drivecache: { id: null, sync: false, about: "The class Drive listing as last loaded, for one account (removed on sign-out)" },
  sync: { id: "name", sync: false, about: "Sync bookkeeping: medicine:sync:state and medicine:sync:dirty" },
} as const satisfies Record<string, KeyType>;

export type KeyTypeName = keyof typeof KEY_TYPES;

export const KEY_PREFIX = "medicine:";

// A lowercase type, then an optional id of the characters subject, block and package ids use.
const KEY_RE = /^medicine:([a-z]+)(?::([A-Za-z0-9._/-]{1,160}))?$/;

/** The storage key for a type, and for its subject/block/package id when it has one. */
export function storageKey(type: KeyTypeName, id?: string): string {
  return id === undefined ? `${KEY_PREFIX}${type}` : `${KEY_PREFIX}${type}:${id}`;
}

/** Splits a key into its type and id; null when it isn't a well-formed app key. */
export function parseKey(key: string): { type: string; id: string | null } | null {
  const m = KEY_RE.exec(key);
  // The id group is optional in the pattern, so it can be missing.
  return m ? { type: m[1], id: (m[2] as string | undefined) ?? null } : null;
}

function keyType(type: string): KeyType | undefined {
  return Object.hasOwn(KEY_TYPES, type) ? KEY_TYPES[type as KeyTypeName] : undefined;
}

/**
 * The merge rule for a key, or null when it doesn't sync. Well-formed keys of a type this
 * build doesn't know (written by a newer version) sync as "latest", so an older copy of the
 * app never drops or rejects them.
 */
export function mergeRuleFor(key: string): MergeRule | null {
  const parsed = parseKey(key);
  if (!parsed) return null;
  const spec = keyType(parsed.type);
  if (!spec) return "latest";
  return spec.sync === false ? null : spec.sync;
}

/** Whether "sign out and clear this device" keeps this key. */
export function keptOnClear(key: string): boolean {
  const parsed = parseKey(key);
  const spec = parsed && keyType(parsed.type);
  return Boolean(spec && "keepOnClear" in spec && spec.keepOnClear);
}
