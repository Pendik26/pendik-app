// Every kind of value the app keeps, in one table. Keys look like "pendik:{type}" (one value)
// or "pendik:{type}:{id}" (one per subject, block or exam package). Progress is saved in the
// student's account on the server (the `progress` table, keyed without the "pendik:" prefix);
// settings that only make sense on one device (theme, sidebar, recent pages) stay in this
// browser's localStorage. The storage helpers, the server-side leaderboard scoring and sign-out
// all read this table, so a new kind of value is declared once, here.

export interface KeyType {
  /** What the id part of the key is, or null for a single value. */
  id: "subject" | "exam" | "name" | null;
  /** "server": saved in the student's account. "device": kept in this browser only. */
  saved: "server" | "device";
  about: string;
}

export const KEY_TYPES = {
  flashcards: { id: "subject", saved: "server", about: "SM-2 review state per card id" },
  tagfilter: { id: "subject", saved: "server", about: "Selected flashcard tags" },
  occlusion: { id: "subject", saved: "server", about: "SM-2 review state per image-occlusion label" },
  occlusionprefs: { id: "subject", saved: "server", about: "Image occlusion: mode, regions, last label, view toggles" },
  quiz: { id: "subject", saved: "server", about: "Quiz attempts: score, total, date, missed ids" },
  quizdue: { id: "subject", saved: "server", about: "Quiz question ids due for review" },
  quizinprogress: { id: "subject", saved: "server", about: "Snapshot of an unfinished quiz, to resume it" },
  examhistory: { id: "exam", saved: "server", about: "Exam attempts, per block or block/package" },
  exammode: { id: null, saved: "server", about: "Preferred exam mode" },
  examdate: { id: "subject", saved: "server", about: "Old per-deck exam date (read as a fallback for the block's exam plan)" },
  examplan: { id: "exam", saved: "server", about: "A block's exam plan: date, minutes a day, target score, study time" },
  studylog: { id: null, saved: "server", about: "How much was studied each day, per subject and kind, and at which hours" },
  todayplan: { id: null, saved: "device", about: "Today's plan as drawn up this morning (device-only snapshot)" },
  lastread: { id: "subject", saved: "server", about: "When a summary was last opened" },
  ebook: { id: "subject", saved: "server", about: "Reading position in an ebook" },
  ebookdone: { id: "subject", saved: "server", about: "Finished ebook chapter ids" },
  readingprefs: { id: null, saved: "server", about: "Reader font size and font" },
  currentblock: { id: null, saved: "server", about: "The block the student is in" },
  activity: { id: null, saved: "server", about: "Study days (UTC dates)" },
  labdata: { id: "name", saved: "server", about: "Virtual Lab data table per activity, e.g. skeletal-muscle/voltage" },
  theme: { id: null, saved: "device", about: "Light or dark theme" },
  sidebarcollapsed: { id: null, saved: "device", about: "Sidebar collapsed on desktop" },
  recentpages: { id: null, saved: "device", about: "Pages opened recently, offered first in the command palette (device-only)" },
  mapsettings: { id: null, saved: "server", about: "Knowledge map: filters, colors, display and forces" },
  atlas: { id: null, saved: "server", about: "3D anatomy: recently opened structures, whether the view turns around the selection, perspective or orthographic, and the floor grid" },
  alfond: { id: null, saved: "server", about: "Alfond settings: whether its floating button shows on every page" },
  alfondchat: { id: null, saved: "device", about: "Alfond's recent conversation (device-only)" },
    driveseen: { id: null, saved: "server", about: "Class Drive file ids the student has opened" },
    language: { id: null, saved: "device", about: "Interface language: id or en" },
} as const satisfies Record<string, KeyType>;

export type KeyTypeName = keyof typeof KEY_TYPES;

export const KEY_PREFIX = "pendik:";

// A lowercase type, then an optional id of the characters subject, block and package ids use.
const KEY_RE = /^pendik:([a-z]+)(?::([A-Za-z0-9._/-]{1,120}))?$/;

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

/** Whether a key is saved in the student's account (as opposed to this browser only). */
export function savedOnServer(key: string): boolean {
  const parsed = parseKey(key);
  return parsed !== null && keyType(parsed.type)?.saved === "server";
}

/** The key as the server's `progress` table stores it: without the "pendik:" prefix. */
export function serverKey(key: string): string {
  return key.slice(KEY_PREFIX.length);
}

/** The app key for a row of the `progress` table. */
export function appKey(serverKey: string): string {
  return KEY_PREFIX + serverKey;
}
