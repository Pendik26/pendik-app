// Copies the class Google Drive into drive_files, a few hundred folders per call.
//
// One sync is a "run" (drive_sync_runs). Each call picks up the run's queue of folders still to
// visit, lists as many as fit in its time budget, saves the files it found, and leaves the rest of
// the queue for the next call; the caller (GitHub Actions, or the admin page) calls again until
// the run is done. Files the run never saw are then marked missing, unless that would hide more
// than a set share of the Drive at once (or the walk was incomplete): then the run is "held" for
// an admin to look at, and nothing is marked.
//
// No dependencies beyond drivePath.ts: server/drive.ts passes in the Drive API and the database,
// and the tests pass in fakes.

import { kindOf, placeOf, youtubeIds, youtubeRowId } from "./drivePath.js";

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

/** Things a run noticed that an admin may want to tidy in the Drive; none of them stops the run. */
export type AnomalyKind =
  | "outside_pattern" // a file not under a BLOK folder, so it has no block
  | "no_course" // a file directly in a BLOK folder, with no category folder
  | "duplicate" // two files with the same name in one folder
  | "too_deep" // a folder deeper than maxDepth, not walked
  | "too_many_folders" // a folder past maxFolders, not walked
  | "unlistable" // a folder Drive wouldn't list
  | "broken_shortcut" // a shortcut whose target is gone or hidden
  | "unreadable_doc" // a Google Doc that couldn't be read for video links
  | "youtube_no_id"; // a Doc with a YouTube link that names no video

export type Anomalies = Partial<Record<AnomalyKind, { count: number; examples: string[] }>>;

const ANOMALY_EXAMPLES = 5;

function flag(run: SyncRun, kind: AnomalyKind, where: string) {
  const all = (run.notes.anomalies ?? {}) as Anomalies;
  const entry = all[kind] ?? { count: 0, examples: [] };
  entry.count += 1;
  if (entry.examples.length < ANOMALY_EXAMPLES) entry.examples.push(where);
  all[kind] = entry;
  run.notes.anomalies = all;
}

const YOUTUBE_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>)\]]*/gi;

/** YouTube links in a text that don't name a video (a channel, a search, a cut-off link). */
export function youtubeLinksWithoutId(text: string): string[] {
  return [...text.matchAll(YOUTUBE_LINK)].map((m) => m[0]).filter((link) => youtubeIds(link).length === 0);
}

export interface SyncOptions {
  /** Read every Google Doc again for video links, not just the ones that changed. Only for a new run. */
  rereadDocs?: boolean;
}

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
  options: SyncOptions = {},
): Promise<SyncResult> {
  const started = now();
  let run = await store.runningRun();
  if (run && started - Date.parse(run.startedAt) > config.staleAfterMs) {
    run.status = "failed";
    run.error = "Left unfinished; a new sync was started.";
    await store.saveRun(run, true);
    run = null;
  }
  if (!run) {
    run = await store.createRun(startedBy, { queue: [{ id: config.rootFolderId, path: [] }], visited: [], skipped: 0 });
    if (options.rereadDocs) run.notes = { ...run.notes, rereadDocs: true };
  }
  run.calls += 1;
  const rereadDocs = run.notes.rereadDocs === true;
  const at = (path: string[], name?: string) => [...path, ...(name === undefined ? [] : [name])].join(" / ") || "(root)";

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
          flag(run, "unlistable", at(f.path));
        }
      }
    }

    const seenAt = new Date(now()).toISOString();
    const byId = new Map(batch.map((f) => [f.id, f]));
    const rows: FileRow[] = [];
    const docs: FileRow[] = [];
    const names = new Set<string>();
    for (const child of children) {
      const parent = (child.parents ?? []).map((p) => byId.get(p)).find((p) => p !== undefined);
      if (!parent) continue;
      const isShortcut = child.mimeType === SHORTCUT;
      const id = isShortcut ? child.shortcutDetails?.targetId : child.id;
      const mimeType = isShortcut ? child.shortcutDetails?.targetMimeType : child.mimeType;
      if (!id || !mimeType) {
        if (isShortcut) flag(run, "broken_shortcut", at(parent.path, child.name));
        continue;
      }
      if (mimeType === FOLDER) {
        const path = [...parent.path, child.name.trim()];
        if (path.length > config.maxDepth) {
          cursor.skipped += 1;
          flag(run, "too_deep", at(path));
        } else if (visited.size + cursor.queue.length >= config.maxFolders) {
          cursor.skipped += 1;
          flag(run, "too_many_folders", at(path));
        } else if (!visited.has(id)) cursor.queue.push({ id, path });
        continue;
      }
      const row = fileRow(child, id, mimeType, parent.path, seenAt);
      const nameKey = `${parent.id}\u0000${child.name.trim().toLowerCase()}`;
      if (names.has(nameKey)) flag(run, "duplicate", at(parent.path, child.name));
      names.add(nameKey);
      if (!row.block) flag(run, "outside_pattern", at(parent.path, child.name));
      else if (!row.category) flag(run, "no_course", at(parent.path, child.name));
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
      if (!rereadDocs && before !== undefined && before === doc.drive_modified_at) {
        unchangedDocs.push(doc.drive_file_id);
        continue;
      }
      let text: string;
      try {
        text = await drive.exportText(doc.drive_file_id);
      } catch {
        flag(run, "unreadable_doc", at(doc.folder_path, doc.title));
        unchangedDocs.push(doc.drive_file_id);
        continue;
      }
      videos.push(...videoRows(doc, youtubeIds(text)));
      if (youtubeLinksWithoutId(text).length > 0) flag(run, "youtube_no_id", at(doc.folder_path, doc.title));
    }

    const all = [...unique, ...videos];
    if (all.length) await store.upsert(all);
    if (unchangedDocs.length) await store.touchVideosOf(unchangedDocs, seenAt);
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

/** The Drive API over fetch, with an access token, or with an API key for a folder shared by link. */
export function driveApi(token: () => Promise<string>, fetchImpl: typeof fetch = fetch, base = "https://www.googleapis.com/drive/v3", apiKey = ""): DriveApi {
  const get = async (url: string) => {
    const res = apiKey
      ? await fetchImpl(`${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(20_000) })
      : await fetchImpl(url, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(20_000) });
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
