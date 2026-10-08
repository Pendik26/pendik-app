import { useEffect, useState } from "react";
import { readJSON, writeJSON } from "../lib/storage";
import { STORAGE_UPDATED_EVENT } from "../lib/storage";

/**
 * localStorage-backed state, safe to use with a key that changes across
 * renders (e.g. a subject id from useParams) — client-side routing reuses
 * the same component instance across param changes, so without this the
 * previous subject's value would leak into the new one on first render.
 *
 * Only real changes are written back. Saving the value it just read (or the fallback, for a
 * missing key) would count as a fresh edit for sync, and on a new device could overwrite the
 * account's copy with a default.
 */
export function useLocalStorage<T>(key: string, fallback: T) {
  const [trackedKey, setTrackedKey] = useState(key);
  const [value, setValue] = useState<T>(() => readJSON(key, fallback));
  // The value as last read from storage; the write effect skips it.
  const [stored, setStored] = useState<{ key: string; value: T }>(() => ({ key, value }));

  if (key !== trackedKey) {
    const next = readJSON(key, fallback);
    setTrackedKey(key);
    setValue(next);
    setStored({ key, value: next });
  }

  useEffect(() => {
    if (stored.key === key && Object.is(stored.value, value)) return;
    writeJSON(key, value);
  }, [key, value, stored]);

  // A sync that downloads a newer copy of this key from another device updates the state too.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const keys = (e as CustomEvent<{ keys?: string[] } | null>).detail?.keys ?? [];
      if (!keys.includes(key)) return;
      const next = readJSON(key, fallback);
      setValue(next);
      setStored({ key, value: next });
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onUpdated);
    return () => { window.removeEventListener(STORAGE_UPDATED_EVENT, onUpdated); };
    // fallback is a default value; re-subscribing when a caller passes a new literal is pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue] as const;
}
