import type { Collections, DriveFileDoc, DriveSyncRunDoc } from "./db.js";
import { isDuplicate } from "./db.js";
import { audit, refuse, requireAdmin, text, type Args, type Ctx } from "./context.js";
import { applyHeldRun, DEFAULT_SYNC, driveApi, syncStep, type FileRow, type SyncRun, type SyncStore } from "./driveSync.js";
import { parseServiceAccount, serviceAccountToken } from "./googleAuth.js";

// The class Google Drive, copied into the `driveFiles` collection by a sync (daily from GitHub
// Actions, or from the admin page), and read by every signed-in student.
//
// Block, category and subject come from the folder path (server/drivePath.ts). A file the sync no
// longer finds is marked missing (missing_since), not deleted, and comes back if it reappears.
// Admins can hide a file (hidden_at) and put files in an order of their own within a folder
// (sort_order); the sync never touches either.

const STUDENT_COLUMNS = ["drive_file_id", "title", "kind", "folder_path", "size_bytes", "drive_modified_at", "created_at", "synced_at", "track", "sort_order", "mime_type"] as const;

/** Every file a student sees: not missing, not hidden. */
export async function driveFiles(ctx: Ctx) {
  const rows = await ctx.c.driveFiles.find({ missing_since: null, hidden_at: null }).sort({ title: 1 }).toArray();
  return rows.map((r) => Object.fromEntries(STUDENT_COLUMNS.map((k) => [k, r[k] ?? null])));
}

export async function adminDriveFiles(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  const query = text(args, "p_query")?.trim();
  const filter: Record<string, unknown> = {};
  if (query) filter.title = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (args.p_only_hidden === true) filter.hidden_at = { $ne: null };
  const rows = await ctx.c.driveFiles.find(filter).sort({ title: 1 }).limit(100).toArray();
  return rows.map((r) => ({
    id: r._id, title: r.title, kind: r.kind, block: r.block, category: r.category, folder_path: r.folder_path,
    hidden_at: r.hidden_at, missing_since: r.missing_since, sort_order: r.sort_order,
  }));
}

export async function adminSetFileOrder(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const raw = args.p_order;
  if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 9999)) throw refuse("bad_order");
  const order: number | null = raw;
  await ctx.c.driveFiles.updateOne({ _id: text(args, "p_id") ?? "" }, { $set: { sort_order: order, updated_at: ctx.now.toISOString() } });
  return null;
}

export async function adminSetFileHidden(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const hidden = args.p_hidden === true;
  await ctx.c.driveFiles.updateOne({ _id: text(args, "p_id") ?? "" }, { $set: { hidden_at: hidden ? ctx.now.toISOString() : null, updated_at: ctx.now.toISOString() } });
  await audit(ctx, hidden ? "drive.hide" : "drive.show", text(args, "p_id"));
  return null;
}

export async function adminSyncRuns(ctx: Ctx) {
  requireAdmin(ctx);
  const rows = await ctx.c.driveSyncRuns.find().sort({ started_at: -1 }).limit(15).toArray();
  return rows.map(({ _id, cursor: _cursor, updated_at: _updated, ...r }) => ({ id: _id, ...r }));
}

// ---------------------------------------------------------------------------------------------
// The sync

const toRun = (r: DriveSyncRunDoc): SyncRun => ({
  id: r._id,
  status: r.status,
  startedAt: r.started_at,
  cursor: r.cursor,
  filesFound: r.files_found,
  filesAdded: r.files_added,
  filesUpdated: r.files_updated,
  filesMissing: r.files_missing,
  calls: r.calls,
  notes: r.notes ?? {},
  error: r.error,
});

/** The sync's storage in MongoDB. */
export function mongoSyncStore(c: Collections): SyncStore {
  const store: SyncStore = {
    async runningRun() {
      const r = await c.driveSyncRuns.findOne({ status: "running" });
      return r ? toRun(r) : null;
    },
    async createRun(startedBy, cursor) {
      const now = new Date().toISOString();
      const doc: DriveSyncRunDoc = {
        _id: crypto.randomUUID(), status: "running", started_by: startedBy, cursor, files_found: 0, files_added: 0,
        files_updated: 0, files_missing: 0, calls: 0, notes: {}, error: null, started_at: now, updated_at: now, finished_at: null,
      };
      try {
        await c.driveSyncRuns.insertOne(doc);
      } catch (e) {
        // Two calls at once: the other one made the run.
        if (isDuplicate(e)) {
          const running = await store.runningRun();
          if (running) return running;
        }
        throw e;
      }
      return toRun(doc);
    },
    async saveRun(run, finished) {
      const now = new Date().toISOString();
      await c.driveSyncRuns.updateOne({ _id: run.id }, {
        $set: {
          status: run.status, cursor: run.cursor, files_found: run.filesFound, files_added: run.filesAdded,
          files_updated: run.filesUpdated, files_missing: run.filesMissing, calls: run.calls, notes: run.notes,
          error: run.error ?? null, updated_at: now, ...(finished ? { finished_at: now } : {}),
        },
      });
    },
    async existing(ids) {
      const rows = await c.driveFiles.find({ drive_file_id: { $in: ids } }, { projection: { drive_file_id: 1, drive_modified_at: 1 } }).toArray();
      return new Map(rows.map((r) => [r.drive_file_id, r.drive_modified_at]));
    },
    async upsert(rows: FileRow[]) {
      if (!rows.length) return;
      const now = new Date().toISOString();
      await c.driveFiles.bulkWrite(rows.map((row) => ({
        updateOne: {
          filter: { drive_file_id: row.drive_file_id },
          update: {
            $set: { ...row, updated_at: now },
            $setOnInsert: { _id: crypto.randomUUID(), hidden_at: null, sort_order: null, created_at: now },
          },
          upsert: true,
        },
      })), { ordered: false });
    },
    async touchVideosOf(docIds, at) {
      const rows = await c.driveFiles.find({ kind: "youtube" }, { projection: { drive_file_id: 1 } }).toArray();
      const wanted = new Set(docIds);
      const ids = rows.filter((r) => wanted.has(r.drive_file_id.split(":")[1] ?? "")).map((r) => r.drive_file_id);
      if (ids.length) await c.driveFiles.updateMany({ drive_file_id: { $in: ids } }, { $set: { synced_at: at, missing_since: null } });
    },
    liveCount: () => c.driveFiles.countDocuments({ missing_since: null }),
    unseenSince: (at) => c.driveFiles.countDocuments({ missing_since: null, synced_at: { $lt: at } }),
    async markMissing(at) {
      const { modifiedCount } = await c.driveFiles.updateMany({ missing_since: null, synced_at: { $lt: at } }, { $set: { missing_since: new Date().toISOString() } });
      return modifiedCount;
    },
  };
  return store;
}

export interface DriveSyncConfig {
  /** A Google Cloud API key, for a folder shared by link; used instead of the service account. */
  apiKey?: string;
  serviceAccountJson: string;
  rootFolderId: string;
  budgetMs?: number;
}

export function driveSyncConfigFromEnv(env: Record<string, string | undefined>): DriveSyncConfig | null {
  const apiKey = env.GOOGLE_DRIVE_API_KEY?.trim() ?? "";
  const serviceAccountJson = (env.GOOGLE_SERVICE_ACCOUNT_JSON ?? env.GOOGLE_SERVICE_ACCOUNT)?.trim() ?? "";
  const root = (env.GOOGLE_DRIVE_FOLDER_ID ?? env.DRIVE_ROOT_FOLDER_ID)?.trim() ?? "";
  const rootFolderId = /\/folders\/([A-Za-z0-9_-]+)/.exec(root)?.[1] ?? root;
  if (!rootFolderId || (!apiKey && !parseServiceAccount(serviceAccountJson))) return null;
  const budget = Number(env.DRIVE_SYNC_BUDGET_MS);
  return { ...(apiKey ? { apiKey } : {}), serviceAccountJson, rootFolderId, ...(budget > 0 ? { budgetMs: budget } : {}) };
}

let cachedToken: { value: string; until: number } | null = null;

/** One step of copying the class Drive into driveFiles; call again while the answer says "running". */
export async function driveSyncStep(c: Collections, config: DriveSyncConfig, startedBy: "schedule" | "admin", body: { action?: string; run_id?: string; reread_docs?: boolean }) {
  const account = parseServiceAccount(config.serviceAccountJson);
  if (!account && !config.apiKey) throw refuse("drive_not_set_up", 503);
  const token = async () => {
    if (!account) return "";
    if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
    const value = await serviceAccountToken(account, "https://www.googleapis.com/auth/drive.readonly");
    cachedToken = { value, until: Date.now() + 50 * 60_000 };
    return value;
  };
  const store = mongoSyncStore(c);
  if (body.action === "apply") {
    if (startedBy !== "admin") throw refuse("admins_only", 403);
    const run = await c.driveSyncRuns.findOne({ _id: body.run_id ?? "" });
    if (!run) throw refuse("no_such_sync", 404);
    return applyHeldRun(store, toRun(run));
  }
  return syncStep(store, driveApi(token, fetch, undefined, config.apiKey), { ...DEFAULT_SYNC, rootFolderId: config.rootFolderId, ...(config.budgetMs ? { budgetMs: config.budgetMs } : {}) }, startedBy, Date.now, { rereadDocs: body.reread_docs === true });
}

export type { DriveFileDoc };
