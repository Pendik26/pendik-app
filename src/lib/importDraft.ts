import { useSyncExternalStore } from "react";
import { readJSON, removeDeviceValue, STORAGE_KEYS, writeJSON } from "./storage";

// An unfinished question import, kept in this browser so a refresh or a closed tab doesn't lose
// the file text or the pictures already uploaded (those are on the server; the labels that name
// them are not). It is a convenience, not a backup: another device or cleared site data starts fresh.

export interface ImportDraft {
  text: string;
  /** Label -> the path of the uploaded picture. */
  uploaded: Record<string, string>;
}

/** Longest text kept; a past-paper file is far smaller. */
const MAX_TEXT = 1_000_000;

/** The saved draft if it is well formed and has something in it. */
export function readImportDraft(): ImportDraft | null {
  const raw = readJSON<unknown>(STORAGE_KEYS.importDraft, null);
  if (typeof raw !== "object" || raw === null) return null;
  const { text, uploaded } = raw as { text?: unknown; uploaded?: unknown };
  if (typeof text !== "string" || !text.trim()) return null;
  const pairs = typeof uploaded === "object" && uploaded !== null && !Array.isArray(uploaded) ? Object.entries(uploaded) : [];
  const clean: Record<string, string> = {};
  for (const [label, path] of pairs) if (typeof path === "string") Object.defineProperty(clean, label, { value: path, enumerable: true });
  return { text, uploaded: clean };
}

/**
 * Keeps the draft. False when this browser couldn't keep it (too long, storage full or blocked),
 * so the page can say a refresh would lose it.
 */
export function saveImportDraft(draft: ImportDraft): boolean {
  // An empty page never wipes a draft waiting to be continued; discarding does that on purpose.
  let ok = true;
  if (draft.text.trim()) {
    if (draft.text.length > MAX_TEXT) ok = false;
    else {
      writeJSON(STORAGE_KEYS.importDraft, draft);
      ok = readImportDraft()?.text === draft.text;
    }
  }
  if (ok !== kept) {
    kept = ok;
    for (const l of listeners) l();
  }
  return ok;
}

let kept = true;
const listeners = new Set<() => void>();

/** Whether the last draft save worked, for the page to warn when it didn't. */
export function useImportDraftKept(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => kept,
    () => true,
  );
}

export function clearImportDraft(): void {
  removeDeviceValue(STORAGE_KEYS.importDraft);
}
