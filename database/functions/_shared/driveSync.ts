// Copies the class Google Drive into drive_files, a few hundred folders per call.
//
// One sync is a "run" (drive_sync_runs). Each call picks up the run's queue of folders still to
// visit, lists as many as fit in its time budget, saves the files it found, and leaves the rest of
// the queue for the next call; the caller (GitHub Actions, or the admin page) calls again until
// the run is done. Files the run never saw are then marked missing, unless that would hide more
// than a set share of the Drive at once (or the walk was incomplete): then the run is "held" for
// an admin to look at, and nothing is marked.
//
// No dependencies beyond drivePath.ts: the Edge Function passes in the Drive API and the database (see drive-sync/index.ts),
// and the tests pass in fakes.

import { kindOf, placeOf, youtubeIds, youtubeRowId } from "./drivePath.ts";

export const FOLDER = "application/vnd.google-apps.folder";
const SHORTCUT = "application/vnd.google-apps.shortcut";
const GOOGLE_DOC = "application/vnd.google-apps.document";

export interface ApiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}

export interface DriveApi {
  /** Everything directly inside any of these folders (not trashed). */
  listChildren(folderIds: string[]): Promise<ApiFile[]>;
  /** A Google Doc as plain text. */
  exportText(fileId: string): Promise<string>;
}

export interface FileRow {
  drive_file_id: string;
  title: string;
  kind: string;
  semester: number | null;
  track: string | null;
  block: string | null;
  block_name: string | null;
  category: string | null;
  subject: string | null;
  folder_path: string[];
  mime_type: string | null;
  size_bytes: number | null;
  web_url: string;
  youtube_id: string | null;
  drive_modified_at: string | null;
  synced_at: string;
  missing_since: null;
}

interface QueuedFolder {
  id: string;
  path: string[];
}

export interface SyncCursor {
  queue: QueuedFolder[];
  visited: string[];
  /** Folders that couldn't be listed, or weren't walked because of the limits. */
  skipped: number;
}

export type RunStatus = "running" | "done" | "failed" | "held";

export interface SyncRun {
  id: string;
  status: RunStatus;
  startedAt: string;
  cursor: SyncCursor;
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  filesMissing: number;
  calls: number;
  notes: Record<string, unknown>;
  error?: string | null;
}

export interface SyncStore {
  runningRun(): Promise<SyncRun | null>;
  createRun(startedBy: "schedule" | "admin", cursor: SyncCursor): Promise<SyncRun>;
  saveRun(run: SyncRun, finished: boolean): Promise<void>;
  /** For these ids, the drive_modified_at saved last time (null when Drive gave none). */
  existing(ids: string[]): Promise<Map<string, string | null>>;
  upsert(rows: FileRow[]): Promise<void>;
  /** Marks the saved video rows of these Docs as seen now (the Doc itself didn't change). */
  touchVideosOf(docIds: string[], at: string): Promise<void>;
  /** Files currently shown (not missing). */
  liveCount(): Promise<number>;
  /** Shown files not seen since `at`. */
  unseenSince(at: string): Promise<number>;
  /** Marks shown files not seen since `at` as missing; returns how many. */
  markMissing(at: string): Promise<number>;
}

export interface SyncConfig {
  rootFolderId: string;
  /** How long one call keeps walking before it saves and returns. */
  budgetMs: number;
  maxFolders: number;
  maxDepth: number;
  /** Hold the run instead of hiding more than this share of the shown files at once. */
  maxMissingShare: number;
  /** A run left running this long (a caller gave up) is failed and a new one started. */
  staleAfterMs: number;
}

export const DEFAULT_SYNC: Omit<SyncConfig, "rootFolderId"> = {
  budgetMs: 40_000,
  maxFolders: 3000,
  maxDepth: 12,
  maxMissingShare: 0.3,
  staleAfterMs: 6 * 3600_000,
};

const FOLDERS_PER_REQUEST = 20;

export interface SyncResult {
  runId: string;
  status: RunStatus;
  /** Folders still to visit; call again while the status is "running". */
  remaining: number;
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  filesMissing: number;
  notes: Record<string, unknown>;
}

const result = (run: SyncRun): SyncResult => ({
  runId: run.id,
  status: run.status,
  remaining: run.cursor.queue.length,
  filesFound: run.filesFound,
  filesAdded: run.filesAdded,
  filesUpdated: run.filesUpdated,
  filesMissing: run.filesMissing,
  notes: run.notes,
});

function fileRow(file: ApiFile, id: string, mimeType: string, path: string[], at: string): FileRow {
  const place = placeOf(path);
  const size = file.size ? Number(file.size) : null;
  return {
    drive_file_id: id,
    title: file.name,
    kind: kindOf(mimeType, file.name),
    semester: place.semester,
    track: place.track,
    block: place.block,
    block_name: place.blockName,
    category: place.category,
    subject: place.subject,
    folder_path: path,
    mime_type: mimeType,
    size_bytes: size !== null && Number.isFinite(size) ? size : null,
    web_url: `https://drive.google.com/file/d/${id}/view`,
    youtube_id: null,
    drive_modified_at: file.modifiedTime ?? null,
    synced_at: at,
    missing_since: null,
  };
}

function videoRows(doc: FileRow, ids: string[]): FileRow[] {
  return ids.map((videoId, i) => ({
    ...doc,
    drive_file_id: youtubeRowId(doc.drive_file_id, videoId),
    title: ids.length > 1 ? `${doc.title} (video ${i + 1})` : `${doc.title} (video)`,
    kind: "youtube",
    mime_type: null,
    size_bytes: null,
    web_url: `https://www.youtube.com/watch?v=${videoId}`,
    youtube_id: videoId,
  }));
}

/** One call's worth of syncing. Starts a run when none is going. */
export async function syncStep(
  store: SyncStore,
  drive: DriveApi,
  config: SyncConfig,
  startedBy: "schedule" | "admin",
  now: () => number = Date.now,
): Promise<SyncResult> {
  const started = now();
  let run = await store.runningRun();
  if (run && started - Date.parse(run.startedAt) > config.staleAfterMs) {
    run.status = "failed";
    run.error = "Left unfinished; a new sync was started.";
    await store.saveRun(run, true);
    run = null;
  }
  run ??= await store.createRun(startedBy, { queue: [{ id: config.rootFolderId, path: [] }], visited: [], skipped: 0 });
  run.calls += 1;

  const cursor = run.cursor;
  const visited = new Set(cursor.visited);

  while (cursor.queue.length > 0 && now() - started < config.budgetMs) {
    const batch: QueuedFolder[] = [];
    while (batch.length < FOLDERS_PER_REQUEST && cursor.queue.length > 0) {
      const next = cursor.queue.shift() as QueuedFolder;
      if (visited.has(next.id)) continue;
      visited.add(next.id);
      batch.push(next);
    }
    if (batch.length === 0) continue;

    let children: ApiFile[];
    try {
      children = await drive.listChildren(batch.map((f) => f.id));
    } catch {
      // One more try, folder by folder, so one bad folder doesn't take the others with it.
      children = [];
      for (const f of batch) {
        try {
          children.push(...(await drive.listChildren([f.id])));
        } catch {
          cursor.skipped += 1;
        }
      }
    }

    const at = new Date(now()).toISOString();
    const byId = new Map(batch.map((f) => [f.id, f]));
    const rows: FileRow[] = [];
    const docs: FileRow[] = [];
    for (const child of children) {
      const parent = (child.parents ?? []).map((p) => byId.get(p)).find((p) => p !== undefined);
      if (!parent) continue;
      const isShortcut = child.mimeType === SHORTCUT;
      const id = isShortcut ? child.shortcutDetails?.targetId : child.id;
      const mimeType = isShortcut ? child.shortcutDetails?.targetMimeType : child.mimeType;
      if (!id || !mimeType) continue;
      if (mimeType === FOLDER) {
        const path = [...parent.path, child.name.trim()];
        if (path.length > config.maxDepth || visited.size + cursor.queue.length >= config.maxFolders) cursor.skipped += 1;
        else if (!visited.has(id)) cursor.queue.push({ id, path });
        continue;
      }
      const row = fileRow(child, id, mimeType, parent.path, at);
      rows.push(row);
      if (mimeType === GOOGLE_DOC) docs.push(row);
    }
    // A file reachable twice (a shortcut beside the original) is kept once.
    const unique = [...new Map(rows.map((r) => [r.drive_file_id, r])).values()];
    const saved = await store.existing(unique.map((r) => r.drive_file_id));
    for (const r of unique) {
      if (!saved.has(r.drive_file_id)) run.filesAdded += 1;
      else if (saved.get(r.drive_file_id) !== r.drive_modified_at) run.filesUpdated += 1;
    }

    // Videos linked from Docs: read again only the Docs that changed.
    const videos: FileRow[] = [];
    const unchangedDocs: string[] = [];
    for (const doc of new Map(docs.map((d) => [d.drive_file_id, d])).values()) {
      const before = saved.get(doc.drive_file_id);
      if (before !== undefined && before === doc.drive_modified_at) {
        unchangedDocs.push(doc.drive_file_id);
        continue;
      }
      try {
        videos.push(...videoRows(doc, youtubeIds(await drive.exportText(doc.drive_file_id))));
      } catch {
        unchangedDocs.push(doc.drive_file_id);
      }
    }

    const all = [...unique, ...videos];
    if (all.length) await store.upsert(all);
    if (unchangedDocs.length) await store.touchVideosOf(unchangedDocs, at);
    run.filesFound += unique.length;
  }

  cursor.visited = [...visited];
  if (cursor.queue.length > 0) {
    await store.saveRun(run, false);
    return result(run);
  }

  // The walk is done: hide what wasn't seen, unless that looks like a mistake.
  const live = await store.liveCount();
  const unseen = await store.unseenSince(run.startedAt);
  if (cursor.skipped > 0) {
    run.status = "held";
    run.notes = { ...run.notes, reason: "incomplete", skippedFolders: cursor.skipped, unseen };
  } else if (run.filesFound === 0 || (unseen > 10 && unseen > live * config.maxMissingShare)) {
    run.status = "held";
    run.notes = { ...run.notes, reason: "too_many_missing", unseen, live };
  } else {
    run.filesMissing = await store.markMissing(run.startedAt);
    run.status = "done";
  }
  // The folder ids aren't kept once the run is over.
  run.cursor = { queue: [], visited: [], skipped: cursor.skipped };
  await store.saveRun(run, true);
  return result(run);
}

/** An admin's go-ahead for a held run: hides the files it didn't see. */
export async function applyHeldRun(store: SyncStore, run: SyncRun): Promise<SyncResult> {
  if (run.status !== "held") return result(run);
  run.filesMissing = await store.markMissing(run.startedAt);
  run.status = "done";
  run.notes = { ...run.notes, appliedByAdmin: true };
  await store.saveRun(run, true);
  return result(run);
}

/** The Drive API over fetch, with an access token. */
export function driveApi(token: () => Promise<string>, fetchImpl: typeof fetch = fetch, base = "https://www.googleapis.com/drive/v3"): DriveApi {
  const get = async (url: string) => {
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Drive answered ${res.status}`);
    return res;
  };
  return {
    async listChildren(folderIds) {
      const out: ApiFile[] = [];
      let pageToken = "";
      do {
        const params = new URLSearchParams({
          q: `(${folderIds.map((id) => `'${id.replace(/[^A-Za-z0-9_-]/g, "")}' in parents`).join(" or ")}) and trashed = false`,
          fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,shortcutDetails(targetId,targetMimeType))",
          pageSize: "1000",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const data = (await (await get(`${base}/files?${params}`)).json()) as { files?: ApiFile[]; nextPageToken?: string };
        out.push(...(data.files ?? []));
        pageToken = data.nextPageToken ?? "";
      } while (pageToken);
      return out;
    },
    async exportText(fileId) {
      const res = await get(`${base}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`);
      return (await res.text()).slice(0, 2_000_000);
    },
  };
}
