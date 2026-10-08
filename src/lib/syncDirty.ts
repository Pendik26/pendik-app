import { setOwn } from "./records";
import { storageKey } from "./storageSchema";
import { isSyncableKey } from "./syncMerge";

// Which synced keys changed on this device since the last successful sync, and when. Kept in
// localStorage directly (not through writeJSON) so recording a change never records itself.
export const DIRTY_KEY = storageKey("sync", "dirty");
export const DIRTY_EVENT = "medicine:sync-dirty";

export type DirtyMap = Partial<Record<string, number>>;

export function readDirty(storage: Storage = window.localStorage): DirtyMap {
  try {
    const parsed = JSON.parse(storage.getItem(DIRTY_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as DirtyMap) : {};
  } catch {
    return {};
  }
}

export function writeDirty(map: DirtyMap, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(DIRTY_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable: the next full sync still picks the change up.
  }
}

/** Records that `key` changed now, and tells the sync scheduler. */
export function markDirty(key: string, now: number = Date.now()): void {
  if (!isSyncableKey(key)) return;
  const map = readDirty();
  setOwn(map, key, now);
  writeDirty(map);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DIRTY_EVENT));
}
