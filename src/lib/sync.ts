import { deleteOwn, own } from "./records";
import { KEY_PREFIX, keptOnClear, storageKey } from "./storageSchema";
import { isSyncableKey, mergeEntry, type SyncEntry } from "./syncMerge";
import { readDirty, writeDirty } from "./syncDirty";

// Progress sync: this device's `medicine:*` keys ⇄ the account's copy on the server. The
// browser stays the source of truth (the app works offline and as a guest); a sync uploads the
// keys changed since the last one, and downloads what changed on the server since then, with
// both sides merged by the rules in syncMerge.ts.

export const SYNC_STATE_KEY = storageKey("sync", "state");
export const STORAGE_UPDATED_EVENT = "medicine:storage-updated";

export interface SyncState {
  userId: string;
  /** Server time of the last successful sync; the next one asks for changes since then. */
  since: number;
  lastSyncedAt: number;
}

export type SyncResult =
  | { status: "ok"; applied: string[]; uploaded: number }
  | { status: "signed-out" }
  | { status: "error"; message: string };

interface SyncDeps {
  storage: Storage;
  fetch: typeof fetch;
  now: () => number;
}

const defaultDeps = (): SyncDeps => ({ storage: window.localStorage, fetch: window.fetch.bind(window), now: Date.now });

const BATCH = 400;

export function readSyncState(storage: Storage = window.localStorage): SyncState | null {
  try {
    const s = JSON.parse(storage.getItem(SYNC_STATE_KEY) ?? "null");
    return s && typeof s.userId === "string" && typeof s.since === "number" ? (s as SyncState) : null;
  } catch {
    return null;
  }
}

function syncableKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && isSyncableKey(k)) keys.push(k);
  }
  return keys;
}

function readValue(storage: Storage, key: string): { ok: true; value: unknown } | { ok: false } {
  const raw = storage.getItem(key);
  if (raw === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/** How many local changes are waiting to be uploaded. */
export function pendingChangeCount(storage: Storage = window.localStorage): number {
  return Object.keys(readDirty(storage)).length;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * One sync round. The first sync of an account on a device uploads every local key, which is
 * how progress made as a guest joins the account. Concurrent calls share one request.
 */
export function syncNow(userId: string, options: { keepalive?: boolean } = {}, deps: SyncDeps = defaultDeps()): Promise<SyncResult> {
  inFlight ??= runSync(userId, options, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(userId: string, { keepalive }: { keepalive?: boolean }, deps: SyncDeps): Promise<SyncResult> {
  const { storage } = deps;
  const state = readSyncState(storage);
  const firstForUser = !state || state.userId !== userId;
  const dirty = readDirty(storage);
  const requestStart = deps.now();

  const keys = firstForUser ? syncableKeys(storage) : Object.keys(dirty).filter(isSyncableKey);
  const changes: SyncEntry[] = [];
  for (const key of keys) {
    const v = readValue(storage, key);
    if (v.ok) changes.push({ key, value: v.value, updatedAt: own(dirty, key) ?? 0 });
  }

  const since = firstForUser ? 0 : state.since;
  let serverTime = since;
  const received = new Map<string, SyncEntry>();
  try {
    // Large first uploads go in batches; every batch also returns what changed on the server.
    for (let i = 0; i === 0 || i < changes.length; i += BATCH) {
      const res = await deps.fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive,
        body: JSON.stringify({ since, changes: changes.slice(i, i + BATCH) }),
      });
      if (res.status === 401) return { status: "signed-out" };
      if (!res.ok) return { status: "error", message: `Sync failed (${res.status}).` };
      const data = (await res.json()) as { serverTime: number; entries: SyncEntry[] };
      for (const e of data.entries) received.set(e.key, e);
      serverTime = data.serverTime;
    }
  } catch {
    return { status: "error", message: "You're offline. Changes will sync when you reconnect." };
  }

  // Apply the server's copies. A key edited on this device while the request was running keeps
  // that edit, merged with the server copy, and stays queued for the next sync.
  const latestDirty = readDirty(storage);
  const applied: string[] = [];
  for (const entry of received.values()) {
    if (!isSyncableKey(entry.key)) continue;
    const editedSince = latestDirty[entry.key];
    let value = entry.value;
    if (editedSince !== undefined && editedSince > requestStart) {
      const local = readValue(storage, entry.key);
      if (local.ok) value = mergeEntry(entry, { key: entry.key, value: local.value, updatedAt: editedSince }).value;
    }
    const raw = JSON.stringify(value);
    if (storage.getItem(entry.key) !== raw) {
      try {
        storage.setItem(entry.key, raw);
        applied.push(entry.key);
      } catch {
        // Storage full; the value is still safe on the server.
      }
    }
  }

  for (const key of keys) {
    const changedAt = own(latestDirty, key);
    if (changedAt !== undefined && changedAt <= requestStart) deleteOwn(latestDirty, key);
  }
  writeDirty(latestDirty, storage);
  storage.setItem(SYNC_STATE_KEY, JSON.stringify({ userId, since: serverTime, lastSyncedAt: deps.now() } satisfies SyncState));

  if (applied.length && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { keys: applied } }));
  }
  return { status: "ok", applied, uploaded: changes.length };
}

/** Forgets which account this device synced with (on sign-out). Local progress is kept. */
export function clearSyncState(storage: Storage = window.localStorage): void {
  storage.removeItem(SYNC_STATE_KEY);
  writeDirty({}, storage);
}

/** Removes all of the app's stored data from this device (sign out and clear). */
export function clearLocalProgress(storage: Storage = window.localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(KEY_PREFIX) && !keptOnClear(k)) keys.push(k);
  }
  keys.forEach((k) => { storage.removeItem(k); });
}
