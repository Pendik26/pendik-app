import { supabase } from "./supabase";
import { appKey, savedOnServer, serverKey } from "./storageSchema";
import { progressValue, replaceProgress, setProgressFromServer, STORAGE_UPDATED_EVENT } from "./storage";

// Loading and saving the signed-in student's progress (the `progress` table). Everything is
// loaded once at sign-in; after that each changed key is saved a moment after its last change,
// in one upsert. When the tab comes back into view the account is read again, so progress made
// on another device shows up.

export interface SaveState {
  phase: "idle" | "saving" | "error";
  /** Keys changed and not saved yet. */
  pending: number;
  lastSavedAt?: number;
  message?: string;
}

const SAVE_DELAY_MS = 1500;
const BATCH = 200;

const pending = new Set<string>();
let userId: string | null = null;
let timer: number | undefined;
let saving: Promise<void> | null = null;
let state: SaveState = { phase: "idle", pending: 0 };
const listeners = new Set<(s: SaveState) => void>();

function setState(next: Partial<SaveState>) {
  state = { ...state, ...next, pending: pending.size };
  for (const l of listeners) l(state);
}

export function subscribeSaveState(listener: (s: SaveState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

async function fetchAll(): Promise<[string, unknown][]> {
  const rows: [string, unknown][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("progress").select("key, value").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data as { key: string; value: unknown }[]) rows.push([appKey(r.key), r.value]);
    if (data.length < 1000) return rows;
  }
}

function announce(keys: string[]) {
  if (keys.length) window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { keys } }));
}

/** Loads the account's progress into memory. Throws when it can't be loaded. */
export async function loadProgress(id: string): Promise<void> {
  userId = id;
  pending.clear();
  announce(replaceProgress(await fetchAll()));
  setState({ phase: "idle", message: undefined });
}

/** Reads the account again (another device may have saved), keeping this tab's unsaved changes. */
export async function refreshProgress(): Promise<void> {
  if (!userId || pending.size > 0 || saving) return;
  let rows: [string, unknown][];
  try {
    rows = await fetchAll();
  } catch {
    return; // offline: keep what's in memory
  }
  if (pending.size > 0) return;
  const changed: string[] = [];
  for (const [key, value] of rows) {
    const before = JSON.stringify(progressValue(key));
    if (before !== JSON.stringify(value)) {
      setProgressFromServer(key, value);
      changed.push(key);
    }
  }
  announce(changed);
}

/** Forgets the progress in memory (sign-out). */
export function clearProgress(): void {
  userId = null;
  pending.clear();
  window.clearTimeout(timer);
  announce(replaceProgress([]));
  setState({ phase: "idle", lastSavedAt: undefined, message: undefined });
}

/** Records that a key changed; it's saved shortly. */
export function queueSave(key: string): void {
  if (!userId || !savedOnServer(key)) return;
  pending.add(key);
  setState({});
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void saveNow(), SAVE_DELAY_MS);
}

/** Saves every changed key now. Concurrent calls share one save. */
export function saveNow(): Promise<void> {
  saving ??= runSave().finally(() => {
    saving = null;
    // Changes made while saving go out in the next round.
    if (pending.size > 0 && state.phase !== "error") queueSave([...pending][0]);
  });
  return saving;
}

async function runSave(): Promise<void> {
  if (!userId || pending.size === 0) return;
  const owner = userId;
  const keys = [...pending];
  pending.clear();
  setState({ phase: "saving" });
  try {
    // A value cleared to null (e.g. a finished quiz's resume slot) is removed from the account.
    const cleared = keys.filter((k) => progressValue(k) == null);
    const kept = keys.filter((k) => progressValue(k) != null);
    for (let i = 0; i < kept.length; i += BATCH) {
      const rows = kept.slice(i, i + BATCH).map((key) => ({
        user_id: owner,
        key: serverKey(key),
        value: progressValue(key),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("progress").upsert(rows, { onConflict: "user_id,key" });
      if (error) throw new Error(error.message);
    }
    if (cleared.length) {
      const { error } = await supabase.from("progress").delete().eq("user_id", owner).in("key", cleared.map(serverKey));
      if (error) throw new Error(error.message);
    }
    setState({ phase: "idle", lastSavedAt: Date.now(), message: undefined });
  } catch (e) {
    for (const k of keys) pending.add(k);
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    setState({
      phase: "error",
      message: offline ? "You're offline. Your latest progress will be saved when you're back online." : (e as Error).message,
    });
  }
}

export function pendingSaves(): number {
  return pending.size;
}
