import { setOwn } from "./records";
import { KEY_PREFIX, storageKey } from "./storageSchema";
import { markDirty } from "./syncDirty";

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // A stored literal "null" parses successfully but isn't the shape callers expect
    // (a CardStateMap, an array, ...) — treat it the same as a missing key, unless the
    // caller's own fallback is null/undefined too (e.g. QuizPlay's in-progress-save slot).
    if (parsed === null || parsed === undefined) {
      return fallback === null || fallback === undefined ? (parsed as T) : fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    const raw = JSON.stringify(value);
    // Skipping identical writes matters for sync: components that re-save an unchanged value
    // on mount must not look like a fresh edit, or they would overwrite newer progress from
    // another device.
    if (window.localStorage.getItem(key) === raw) return;
    window.localStorage.setItem(key, raw);
    markDirty(key);
  } catch {
    // localStorage unavailable (private browsing, quota exceeded, etc.) — fail silently.
  }
}

// Every key is declared in storageSchema.ts, which also says whether and how it syncs.
// Per-subject keys take a subject key, "{blockId}/{subjectId}" (see subjectKey in content.ts).
export const STORAGE_KEYS = {
  cardState: (key: string) => storageKey("flashcards", key),
  tagFilter: (key: string) => storageKey("tagfilter", key),
  occlusionState: (key: string) => storageKey("occlusion", key),
  occlusionPrefs: (key: string) => storageKey("occlusionprefs", key),
  quizProgress: (key: string) => storageKey("quiz", key),
  quizDue: (key: string) => storageKey("quizdue", key),
  quizInProgress: (key: string) => storageKey("quizinprogress", key),
  /** Keyed by block id, or "{blockId}/{packageId}" for one exam package. */
  examHistory: (id: string) => storageKey("examhistory", id),
  examMode: storageKey("exammode"),
  lastRead: (key: string) => storageKey("lastread", key),
  ebookPosition: (key: string) => storageKey("ebook", key),
  ebookCompleted: (key: string) => storageKey("ebookdone", key),
  examDate: (key: string) => storageKey("examdate", key),
  /** A block's exam plan, keyed by block id. */
  examPlan: (blockId: string) => storageKey("examplan", blockId),
  studyLog: storageKey("studylog"),
  todayPlan: storageKey("todayplan"),
  readingPrefs: storageKey("readingprefs"),
  sidebarCollapsed: storageKey("sidebarcollapsed"),
  /** The last pages opened: [{ path, title }], newest first. */
  recentPages: storageKey("recentpages"),
  mapSettings: storageKey("mapsettings"),
  /** The 3D atlas's settings: { follow, ortho, grid, recent: ["skeletal/Femur.r", …] }. */
  atlasPrefs: storageKey("atlas"),
  /** Alfond's settings, e.g. { overlay: false } to hide its floating button. */
  alfondPrefs: storageKey("alfond"),
  alfondChat: storageKey("alfondchat"),
  /** The block the student is in (synced); Home shows it first. */
  currentBlock: storageKey("currentblock"),
  lastExport: storageKey("lastexport"),
  theme: storageKey("theme"),
  activity: storageKey("activity"),
  /** Recorded runs for one Virtual Lab activity, keyed "{exerciseId}/{activitySlug}". */
  labData: (id: string) => storageKey("labdata", id),
} as const;


/** Collect every app-owned localStorage key/value pair, for export. */
export function exportAllProgress(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    try {
      setOwn(out, key, JSON.parse(window.localStorage.getItem(key) ?? "null"));
    } catch {
      // skip unparsable entries
    }
  }
  return out;
}

/** Restore a previously exported progress snapshot, overwriting existing keys. */
export function importAllProgress(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    writeJSON(key, value);
  }
}
