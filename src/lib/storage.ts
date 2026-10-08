import { KEY_PREFIX, savedOnServer, storageKey } from "./storageSchema";

// Where every value the app keeps is read and written. Progress keys are saved in the student's
// account on the server: they're loaded into memory once at sign-in (progressSync.ts), read from
// memory, and each change is sent to the server shortly after it's made. Device settings (theme,
// sidebar, recent pages) stay in this browser's localStorage. Callers don't need to know which.

/** Fired with { keys } when values change underneath the pages (loaded at sign-in, or refreshed). */
export const STORAGE_UPDATED_EVENT = "pendik:storage-updated";
/** Fired with { key } when a progress value changed and needs saving. */
export const PROGRESS_CHANGED_EVENT = "pendik:progress-changed";

/** The signed-in student's progress, as JSON text per key. */
const progress = new Map<string, string>();

/** Replaces what's in memory with the account's progress (sign-in, refresh, sign-out). */
export function replaceProgress(entries: Iterable<[string, unknown]>): string[] {
  const changed = new Set(progress.keys());
  progress.clear();
  for (const [key, value] of entries) {
    progress.set(key, JSON.stringify(value));
    changed.add(key);
  }
  return [...changed];
}

/** Puts one value from the server into memory without marking it as changed. */
export function setProgressFromServer(key: string, value: unknown): void {
  progress.set(key, JSON.stringify(value));
}

/** The progress in memory, for saving and for "Download my data". */
export function progressValue(key: string): unknown {
  const raw = progress.get(key);
  return raw === undefined ? undefined : JSON.parse(raw);
}

export function progressKeys(): string[] {
  return [...progress.keys()];
}

function readRaw(key: string): string | null {
  if (savedOnServer(key)) return progress.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = readRaw(key);
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
  const raw = JSON.stringify(value);
  // Skipping identical writes matters: components that re-save an unchanged value on mount
  // must not send a save for nothing.
  if (readRaw(key) === raw) return;
  if (savedOnServer(key)) {
    progress.set(key, raw);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT, { detail: { key } }));
    return;
  }
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // localStorage unavailable (private browsing, quota exceeded, etc.) — fail silently.
  }
}

/** Removes this browser's device settings (sign out and clear this device). */
export function clearDeviceSettings(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(KEY_PREFIX) && key !== STORAGE_KEYS.theme && key !== STORAGE_KEYS.language) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // nothing to clear
  }
}

// Every key is declared in storageSchema.ts, which also says whether it's saved on the server.
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
  /** The block the student is in; Home shows it first. */
  currentBlock: storageKey("currentblock"),
  theme: storageKey("theme"),
  language: storageKey("language"),
  activity: storageKey("activity"),
  /** Class Drive file ids the student has opened ("new" badges). */
  driveSeen: storageKey("driveseen"),
  /** Recorded runs for one Virtual Lab activity, keyed "{exerciseId}/{activitySlug}". */
  labData: (id: string) => storageKey("labdata", id),
} as const;

/** Every progress value in the account, for "Download my data". */
export function exportAllProgress(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of progressKeys()) Object.defineProperty(out, key, { value: progressValue(key), enumerable: true });
  return out;
}
