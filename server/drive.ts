import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { DriveFile, DriveFileKind, DriveFolder, DriveTree } from "../src/lib/driveTypes.js";

// The class's shared Google Drive folder, listed through the Drive API with an API key (the
// folder is shared by link, so no Google sign-in is needed). The whole tree is walked and kept
// for a few minutes, so files added to or removed from Drive show up on the next refresh. The
// latest listing is also saved to the database, so a cold start doesn't have to walk it first.
//
// Big archives (a past cohorts' folder with years of material) would use up the walk's folder
// budget and push other files out, so they're "on demand": the archive's own folders (one per
// cohort) are listed, and each is walked, with a budget of its own, only when a student opens
// it. Every shortcut to a folder is treated this way, and so is any folder named in
// GOOGLE_DRIVE_ON_DEMAND_FOLDERS. The browser asks for one by an opaque key; folder ids stay
// on the server.

export interface DriveConfig {
  apiKey: string;
  folderId: string;
  /** The Drive API's address; tests point it at a fake. */
  apiBase: string;
  /** How long a listing is used before Drive is asked again. */
  ttlMs: number;
  /** Archive folders: listed at the top, their subfolders walked only when opened. */
  onDemand?: string[];
}

/** A folder id or share link from the settings, as an id (or null). */
function folderIdOf(raw: string): string | null {
  const id = /\/folders\/([A-Za-z0-9_-]+)/.exec(raw)?.[1] ?? raw.trim();
  return ID_RE.test(id) ? id : null;
}

/** The key the browser uses for an on-demand folder: not the id, which grants edit access. */
export function folderKey(id: string): string {
  return createHash("sha256").update(`drive-folder:${id}`).digest("base64url").slice(0, 16);
}

/** A tree as the server keeps it: with the ids behind its on-demand folders' keys. */
export interface ServerDriveTree extends DriveTree {
  deferred?: Record<string, string>;
}

/** What the browser gets: the ids left out. */
export function publicTree({ root, updatedAt, complete }: DriveTree): DriveTree {
  return { root, updatedAt, complete };
}

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;
const FOLDER = "application/vnd.google-apps.folder";
const SHORTCUT = "application/vnd.google-apps.shortcut";
/** Limits on one walk, so a huge or looping folder can't run away. */
const MAX_FOLDERS = 600;
const MAX_DEPTH = 10;
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;
/** A stale listing waits this long for a fresh one before being served as it is. */
const STALE_WAIT_MS = 3_000;
/** After a failed walk, Drive isn't asked again for this long. */
const RETRY_AFTER_MS = 30_000;
/** A student's "refresh" only reaches Drive when the listing is at least this old. */
const MIN_FORCED_AGE_MS = 30_000;

/** The Drive settings, or undefined when the class Drive isn't connected. */
export function driveConfigFromEnv(env: Record<string, string | undefined>): DriveConfig | undefined {
  const apiKey = env.GOOGLE_DRIVE_API_KEY?.trim();
  // Either the folder id or its share link.
  const folderId = folderIdOf(env.GOOGLE_DRIVE_FOLDER_ID ?? "");
  if (!apiKey || !folderId) return undefined;
  const minutes = Number(env.GOOGLE_DRIVE_REFRESH_MINUTES);
  // Archive folders, separated by commas, spaces or new lines.
  const onDemand = [...new Set((env.GOOGLE_DRIVE_ON_DEMAND_FOLDERS ?? "").split(/[\s,]+/).map(folderIdOf).filter((id): id is string => id !== null && id !== folderId))];
  return {
    apiKey,
    folderId,
    apiBase: env.GOOGLE_DRIVE_API_URL?.replace(/\/$/, "") || "https://www.googleapis.com/drive/v3",
    ttlMs: (Number.isFinite(minutes) && minutes >= 1 ? minutes : 5) * 60_000,
    onDemand,
  };
}

export function kindOf(mimeType: string, name: string): DriveFileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") || ["ppt", "pptx", "key", "odp"].includes(ext)) return "slides";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.startsWith("text/") || ["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "document";
  return "other";
}

interface ApiFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Folders listed in one request: their ids go into one query, joined with "or". */
const FOLDERS_PER_REQUEST = 25;

/** Every item directly inside any of these folders, page by page. */
async function listChildren(config: DriveConfig, folderIds: readonly string[], fetchImpl: typeof fetch): Promise<ApiFile[]> {
  const out: ApiFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `(${folderIds.map((id) => `'${id}' in parents`).join(" or ")}) and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,shortcutDetails(targetId,targetMimeType))",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      key: config.apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetchImpl(`${config.apiBase}/files?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Drive answered ${res.status} listing a folder`);
    const body = (await res.json()) as { files?: ApiFile[]; nextPageToken?: string };
    out.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** Runs the tasks, at most `limit` at a time. */
async function inPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: (T | undefined)[] = Array.from({ length: tasks.length }, () => undefined);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks.at(i);
      if (task) results.splice(i, 1, await task());
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results.filter((r): r is T => r !== undefined);
}

/** An archive folder's name, from Drive. */
async function folderName(config: DriveConfig, id: string, fetchImpl: typeof fetch): Promise<string> {
  const params = new URLSearchParams({ fields: "name,mimeType", supportsAllDrives: "true", key: config.apiKey });
  const res = await fetchImpl(`${config.apiBase}/files/${encodeURIComponent(id)}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Drive answered ${res.status} for a folder`);
  const body = (await res.json()) as ApiFile;
  const name = body.name?.trim();
  if (body.mimeType !== FOLDER || !name) throw new Error("Not a folder");
  return name;
}

/** A folder to list; an archive's subfolders are listed but not walked. */
type Pending = { id: string; folder: DriveFolder; depth: number; onDemand?: boolean };

/**
 * Walks the whole folder tree, level by level, listing many folders per request (a semester
 * of about 150 folders takes around ten requests instead of 150). Only the top folder failing
 * to list is an error.
 */
export async function crawlDrive(config: DriveConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<ServerDriveTree> {
  const root: DriveFolder = { name: "", folders: [], files: [] };
  const onDemand = config.onDemand ?? [];
  const seen = new Set([config.folderId, ...onDemand]);
  const deferred: Record<string, string> = {};
  let complete = true;

  /** Files the items into their folders, and returns the subfolders to list next. */
  const place = (items: ApiFile[], byId: Map<string, Pending>, fallback?: Pending): Pending[] => {
    const next: Pending[] = [];
    for (const item of items) {
      const name = item.name?.trim();
      if (!item.id || !name) continue;
      const parent = fallback ?? item.parents?.map((p) => byId.get(p)).find((p) => p !== undefined);
      if (!parent) continue;
      const isShortcut = item.mimeType === SHORTCUT;
      const targetId = isShortcut ? item.shortcutDetails?.targetId : item.id;
      const mimeType = (isShortcut ? item.shortcutDetails?.targetMimeType : item.mimeType) ?? "";
      if (!targetId || !ID_RE.test(targetId)) continue;
      if (mimeType === FOLDER && parent.onDemand) {
        // A cohort in an archive: listed by name, walked when it's opened.
        const key = folderKey(targetId);
        if (deferred[key]) continue;
        deferred[key] = targetId;
        parent.folder.folders.push({ name, folders: [], files: [], deferred: key });
      } else if (mimeType === FOLDER) {
        // A shortcut can point back up the tree: each folder is walked once.
        if (seen.has(targetId)) continue;
        if (parent.depth + 1 > MAX_DEPTH || seen.size >= MAX_FOLDERS) {
          complete = false;
          continue;
        }
        seen.add(targetId);
        // A shortcut to a folder elsewhere (another cohort's archive, a shared drive) is treated
        // as an archive: its own files and folders are listed, and each of those folders is
        // walked only when it's opened, so a big linked tree can't use up this walk's budget.
        const child: DriveFolder = isShortcut ? { name, folders: [], files: [], archive: true } : { name, folders: [], files: [] };
        parent.folder.folders.push(child);
        next.push({ id: targetId, folder: child, depth: parent.depth + 1, ...(isShortcut ? { onDemand: true } : {}) });
      } else {
        const size = Number(item.size);
        const file: DriveFile = {
          id: targetId,
          name,
          kind: kindOf(mimeType, name),
          size: item.size !== undefined && Number.isFinite(size) ? size : null,
          modifiedTime: item.modifiedTime ?? "",
        };
        if (item.createdTime) file.createdTime = item.createdTime;
        parent.folder.files.push(file);
      }
    }
    return next;
  };

  /** One request for a batch; if it fails, each folder on its own, so one bad folder stays one. */
  const listBatch = async (batch: Pending[]): Promise<Pending[]> => {
    const byId = new Map(batch.map((p) => [p.id, p]));
    try {
      return place(await listChildren(config, batch.map((p) => p.id), fetchImpl), byId, batch.length === 1 ? batch.at(0) : undefined);
    } catch (err) {
      if (batch.length === 1) {
        if (batch.at(0)?.folder === root) throw err;
        complete = false;
        return [];
      }
      const each = await inPool(batch.map((p) => () => listBatch([p])), CONCURRENCY);
      return each.flat();
    }
  };

  let level: Pending[] = [{ id: config.folderId, folder: root, depth: 0 }];
  // Archives go at the top, next to the class's own folders.
  const archives = await Promise.all(
    onDemand.map((id) =>
      folderName(config, id, fetchImpl).then(
        (name) => ({ id, name }),
        () => {
          complete = false;
          return null;
        },
      ),
    ),
  );
  for (const archive of archives) {
    if (!archive) continue;
    const folder: DriveFolder = { name: archive.name, folders: [], files: [], archive: true };
    root.folders.push(folder);
    level.push({ id: archive.id, folder, depth: 1, onDemand: true });
  }
  while (level.length > 0) {
    const batches: Pending[][] = [];
    for (let i = 0; i < level.length; i += FOLDERS_PER_REQUEST) batches.push(level.slice(i, i + FOLDERS_PER_REQUEST));
    level = (await inPool(batches.map((b) => () => listBatch(b)), CONCURRENCY)).flat();
  }

  const sortAll = (folder: DriveFolder) => {
    folder.folders.sort((a, b) => byName.compare(a.name, b.name));
    folder.files.sort((a, b) => byName.compare(a.name, b.name));
    folder.folders.forEach(sortAll);
  };
  sortAll(root);
  return { root, updatedAt: now(), complete, ...(Object.keys(deferred).length > 0 ? { deferred } : {}) };
}

/** Where the latest listings are kept between cold starts: the tree, and each opened archive folder. */
export interface DriveSnapshotStore {
  load(id?: string): Promise<ServerDriveTree | null>;
  save(tree: ServerDriveTree, id?: string): Promise<void>;
}

export class MemoryDriveSnapshotStore implements DriveSnapshotStore {
  private trees = new Map<string, ServerDriveTree>();
  async load(id = "tree") {
    return this.trees.get(id) ?? null;
  }
  async save(tree: ServerDriveTree, id = "tree") {
    this.trees.set(id, tree);
  }
}

/**
 * The driveSnapshot collection: { _id: "tree", tree, savedAt } for the class Drive, and
 * { _id: "folder:<key>", tree, savedAt } for each archive folder someone has opened (removed
 * after 30 days unopened by a TTL index, see schema.ts).
 */
export class MongoDriveSnapshotStore implements DriveSnapshotStore {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  private get col() {
    return this.db.collection<{ _id: string; tree: ServerDriveTree; savedAt: Date }>("driveSnapshot");
  }
  async load(id = "tree") {
    return (await this.col.findOne({ _id: id }, { projection: { tree: 1 } }))?.tree ?? null;
  }
  async save(tree: ServerDriveTree, id = "tree") {
    await this.col.replaceOne({ _id: id }, { tree, savedAt: new Date() }, { upsert: true });
  }
}

/** One listing (the tree, or an archive folder): fresh enough, walked at most once at a time. */
class Listing {
  private current: ServerDriveTree | null = null;
  private loaded = false;
  private walking: Promise<ServerDriveTree> | null = null;
  private failedAt = -Infinity;

  private readonly crawl: () => Promise<ServerDriveTree>;
  private readonly snapshots: DriveSnapshotStore;
  private readonly snapshotId: string;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(crawl: () => Promise<ServerDriveTree>, snapshots: DriveSnapshotStore, snapshotId: string, ttlMs: number, now: () => number) {
    this.crawl = crawl;
    this.snapshots = snapshots;
    this.snapshotId = snapshotId;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async get(refresh: boolean): Promise<ServerDriveTree> {
    if (!this.loaded) {
      this.loaded = true;
      this.current = await this.snapshots.load(this.snapshotId).catch(() => null);
    }
    const current = this.current;
    const age = current ? this.now() - current.updatedAt : Infinity;
    const wanted = refresh ? age >= MIN_FORCED_AGE_MS : age >= this.ttlMs;
    const failedRecently = this.now() - this.failedAt < RETRY_AFTER_MS;
    if (current && (!wanted || failedRecently)) return current;
    if (!current) {
      if (failedRecently && !this.walking) throw new Error("The class Drive failed to list a moment ago");
      return this.walk();
    }
    // A stale listing is served if Drive is slow; the walk carries on for the next request.
    const timeout = new Promise<ServerDriveTree>((resolve) => setTimeout(() => { resolve(current); }, STALE_WAIT_MS));
    return Promise.race([this.walk().catch(() => current), timeout]);
  }

  private walk(): Promise<ServerDriveTree> {
    this.walking ??= this.crawl()
      .then((tree) => {
        this.current = tree;
        this.snapshots.save(tree, this.snapshotId).catch((err: unknown) => { console.error("Saving the Drive listing failed", err); });
        return tree;
      })
      .catch((err: unknown) => {
        this.failedAt = this.now();
        console.error("Listing the class Drive failed", err);
        throw err;
      })
      .finally(() => {
        this.walking = null;
      });
    return this.walking;
  }
}

/** At most this many archive folders are kept in memory at once (the least recently opened go). */
const MAX_OPEN_FOLDERS = 40;

/** The listings the API serves: the class Drive's tree, and archive folders as they're opened. */
export class DriveIndex {
  private main: Listing;
  private folders = new Map<string, Listing>();
  private config: DriveConfig;
  private snapshots: DriveSnapshotStore;
  private fetchImpl: typeof fetch;
  private now: () => number;

  constructor(
    config: DriveConfig,
    snapshots: DriveSnapshotStore = new MemoryDriveSnapshotStore(),
    fetchImpl: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.snapshots = snapshots;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.main = new Listing(() => crawlDrive(config, fetchImpl, now), snapshots, "tree", config.ttlMs, now);
  }

  /** The folder tree. `refresh` asks Drive again unless the listing is very recent. */
  async tree({ refresh = false } = {}): Promise<ServerDriveTree> {
    return this.main.get(refresh);
  }

  /**
   * An archive folder's contents, by its key, walked on first use and kept like the tree.
   * Null when no such folder is in the tree.
   */
  async folder(key: string, { refresh = false } = {}): Promise<DriveTree | null> {
    let listing = this.folders.get(key);
    if (!listing) {
      const id = (await this.main.get(false)).deferred?.[key];
      if (!id) return null;
      const config = { ...this.config, folderId: id, onDemand: [] };
      listing = new Listing(() => crawlDrive(config, this.fetchImpl, this.now), this.snapshots, `folder:${key}`, this.config.ttlMs, this.now);
      if (this.folders.size >= MAX_OPEN_FOLDERS) {
        const oldest = this.folders.keys().next();
        if (!oldest.done) this.folders.delete(oldest.value);
      }
    } else this.folders.delete(key);
    // Most recently opened last.
    this.folders.set(key, listing);
    return listing.get(refresh);
  }
}
