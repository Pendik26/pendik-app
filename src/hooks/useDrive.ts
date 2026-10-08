import { useCallback, useEffect, useMemo, useState } from "react";
import { treeFromRows, type DriveFileRow } from "../lib/drive";
import type { DriveTree } from "../lib/driveTypes";
import { STORAGE_KEYS } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { useLocalStorage } from "./useLocalStorage";

export type DriveState =
  | { status: "loading" }
  /** `problem`: the last check failed, so this is the listing from before. */
  | {
      status: "ready";
      tree: DriveTree;
      refreshing: boolean;
      problem: string | null;
      /** Kept for the pages' folder views; every folder is already loaded. */
      loadFolder: (key: string, refresh?: boolean) => void;
      folderState: (key: string) => { loading: boolean; problem: string | null };
    }
  | { status: "error"; message: string };

/** Read again when the page comes back into view after this long. */
const RECHECK_MS = 5 * 60_000;
const COLUMNS = "drive_file_id, title, kind, folder_path, size_bytes, drive_modified_at, created_at, synced_at";

// One listing per visit, shared by every page that shows the Drive.
let tree: DriveTree | null = null;
let checkedAt = 0;
let pending: Promise<void> | null = null;
let problem: string | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

async function fetchRows(): Promise<DriveFileRow[]> {
  const rows: DriveFileRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("drive_files").select(COLUMNS).order("title").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as DriveFileRow[]));
    if (data.length < 1000) return rows;
  }
}

function load(): Promise<void> {
  pending ??= fetchRows()
    .then((rows) => {
      tree = treeFromRows(rows);
      problem = null;
      checkedAt = Date.now();
    })
    .catch((e: Error) => {
      problem = navigator.onLine ? e.message : "You're offline.";
    })
    .finally(() => {
      pending = null;
      notify();
    });
  notify();
  return pending;
}

const noFolderLoad = () => {};
const folderState = () => ({ loading: false, problem: null });

/** The class Drive's folder tree, from the synced `drive_files` table. */
export function useDrive(): DriveState & { refresh: () => void } {
  const [, rerender] = useState(0);

  useEffect(() => {
    const update = () => { rerender((n) => n + 1); };
    listeners.add(update);
    if ((!tree || Date.now() - checkedAt > RECHECK_MS) && !pending) void load();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - checkedAt > RECHECK_MS && !pending) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const refresh = useCallback(() => { if (!pending) void load(); }, []);

  let state: DriveState;
  if (tree) state = { status: "ready", tree, refreshing: pending !== null, problem, loadFolder: noFolderLoad, folderState };
  else if (problem && !pending) state = { status: "error", message: problem };
  else state = { status: "loading" };
  return { ...state, refresh };
}

/** Most file ids kept: far more than a semester's files. */
const OPENED_LIMIT = 3000;

/** Which Drive files this student has opened (saved in the account, so "new" clears everywhere). */
export function useDriveOpened(): { opened: ReadonlySet<string>; markOpened: (id: string) => void } {
  const [ids, setIds] = useLocalStorage<string[]>(STORAGE_KEYS.driveSeen, []);
  const opened = useMemo(() => new Set(Array.isArray(ids) ? ids : []), [ids]);
  const markOpened = useCallback(
    (id: string) => {
      setIds((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.includes(id) ? list : [...list, id].slice(-OPENED_LIMIT);
      });
    },
    [setIds],
  );
  return { opened, markOpened };
}
