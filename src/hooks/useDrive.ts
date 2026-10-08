import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDrive, graftFolders, readDriveCache, withFolder, writeDriveCache, type DriveCache } from "../lib/drive";
import type { DriveTree } from "../lib/driveTypes";
import { storageKey } from "../lib/storageSchema";
import { useAccount } from "./useAccount";
import { useLocalStorage } from "./useLocalStorage";

export type DriveState =
  /** The site has no class Drive connected (or no accounts at all). */
  | { status: "off" }
  | { status: "signed-out" }
  | { status: "loading" }
  /** `problem`: the last check failed, so this is the listing from before. */
  | {
      status: "ready";
      /** With the archive folders opened so far filled in. */
      tree: DriveTree;
      refreshing: boolean;
      problem: string | null;
      /** Reads an archive folder from the server (when it's opened). */
      loadFolder: (key: string, refresh?: boolean) => void;
      /** An archive folder being read, or why reading it failed. */
      folderState: (key: string) => { loading: boolean; problem: string | null };
    }
  | { status: "error"; message: string };

/** The server is asked again when the page comes back into view after this long. */
const RECHECK_MS = 5 * 60_000;

// One listing per account, shared by every page that shows the Drive: from the device's copy at
// once, then checked with the server (a 304 when nothing changed).
let current: DriveCache | null = null;
let checkedAt = 0;
let pending: Promise<void> | null = null;
let problem: string | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

/** Archive folders being read, and the ones that failed (with why). */
const folderLoads = new Map<string, Promise<void>>();
const folderProblems = new Map<string, string>();
/** Archive folders checked with the server on this visit (a kept copy is checked once). */
const foldersChecked = new Set<string>();

/** This account's listing: the one in memory, else the device's copy (read once). */
function cacheFor(userId: string): DriveCache | null {
  if (current?.userId !== userId) current = readDriveCache(userId);
  return current;
}

function load(userId: string, refresh = false): Promise<void> {
  cacheFor(userId);
  pending ??= fetchDrive({ refresh, etag: current?.etag })
    .then((result) => {
      if (!result.ok) {
        problem = result.message;
        return;
      }
      problem = null;
      checkedAt = Date.now();
      if ("tree" in result) {
        // Opened archive folders stay: they're read on their own.
        current = { userId, etag: result.etag, tree: result.tree, folders: current?.userId === userId ? current.folders : undefined };
        writeDriveCache(current);
      }
    })
    .finally(() => {
      pending = null;
      notify();
    });
  notify();
  return pending;
}

function loadFolder(userId: string, key: string, refresh = false): Promise<void> {
  const cache = cacheFor(userId);
  const had = cache?.folders?.[key];
  if (!refresh && had && foldersChecked.has(key)) return Promise.resolve();
  let running = folderLoads.get(key);
  if (!running) {
    running = fetchDrive({ key, refresh, etag: had?.etag })
      .then((result) => {
        if (!result.ok) {
          folderProblems.set(key, result.message);
          return;
        }
        folderProblems.delete(key);
        foldersChecked.add(key);
        const base = cacheFor(userId);
        const tree = "tree" in result ? result.tree : had?.tree;
        if (!base || !tree) return;
        current = withFolder(base, key, { etag: "tree" in result ? result.etag : (had?.etag ?? null), tree, openedAt: Date.now() });
        writeDriveCache(current);
      })
      .finally(() => {
        folderLoads.delete(key);
        notify();
      });
    folderLoads.set(key, running);
    notify();
  }
  return running;
}

// The tree with opened archive folders filled in, worked out once per listing.
const grafted = new WeakMap<DriveCache, DriveTree>();
function treeOf(cache: DriveCache): DriveTree {
  let tree = grafted.get(cache);
  if (!tree) {
    tree = cache.folders ? { ...cache.tree, root: graftFolders(cache.tree.root, cache.folders) } : cache.tree;
    grafted.set(cache, tree);
  }
  return tree;
}

/** The class Drive's folder tree, for a signed-in student. */
export function useDrive(): DriveState & { refresh: () => void } {
  const { status, config, user } = useAccount();
  const [, rerender] = useState(0);
  const userId = user?.id ?? "";
  const enabled = status === "signed-in" && config?.drive === true;

  useEffect(() => {
    const update = () => { rerender((n) => n + 1); };
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  // Checked once per visit, and again when the page comes back after a while.
  useEffect(() => {
    if (!enabled) return;
    if (current?.userId !== userId || Date.now() - checkedAt > RECHECK_MS) {
      if (!pending) void load(userId);
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - checkedAt > RECHECK_MS && !pending) void load(userId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, userId]);

  const refresh = useCallback(() => {
    if (enabled && !pending) void load(userId, true);
  }, [enabled, userId]);

  const openFolder = useCallback(
    (key: string, refresh = false) => {
      if (enabled) void loadFolder(userId, key, refresh);
    },
    [enabled, userId],
  );
  const folderState = useCallback((key: string) => ({ loading: folderLoads.has(key), problem: folderProblems.get(key) ?? null }), []);

  const cache = enabled ? cacheFor(userId) : null;

  let state: DriveState;
  if (status === "checking" || (status === "signed-in" && !config)) state = { status: "loading" };
  else if (config?.drive !== true) state = { status: "off" };
  else if (status !== "signed-in") state = { status: "signed-out" };
  else if (cache) state = { status: "ready", tree: treeOf(cache), refreshing: pending !== null, problem, loadFolder: openFolder, folderState };
  else if (problem && !pending) state = { status: "error", message: problem };
  else state = { status: "loading" };
  return { ...state, refresh };
}

/** Most file ids kept: far more than a semester's files. */
const OPENED_LIMIT = 3000;

/** Which Drive files this student has opened (synced, so "new" clears on every device). */
export function useDriveOpened(): { opened: ReadonlySet<string>; markOpened: (id: string) => void } {
  const [ids, setIds] = useLocalStorage<string[]>(storageKey("driveseen"), []);
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
