// POST /functions/v1/drive-sync: one step of copying the class Google Drive into drive_files.
// Call it again while the answer says "running".
//
// Callers: GitHub Actions on a schedule (header x-sync-secret: DRIVE_SYNC_SECRET), or an admin
// from the admin page (their session). An admin can also send { "action": "apply", "run_id" }
// to go ahead with a held run.
//
// Secrets: GOOGLE_SERVICE_ACCOUNT (the service account's JSON key; share the class folder with
// its email), DRIVE_ROOT_FOLDER_ID, DRIVE_SYNC_SECRET, APP_ORIGINS.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { applyHeldRun, DEFAULT_SYNC, driveApi, syncStep, type FileRow, type SyncCursor, type SyncRun, type SyncStore } from "../_shared/driveSync.ts";
import { parseServiceAccount, serviceAccountToken } from "../_shared/googleAuth.ts";
import { allowedOrigins, corsHeaders, jsonError } from "../_shared/http.ts";

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origins = allowedOrigins(env("APP_ORIGINS"));
const account = parseServiceAccount(env("GOOGLE_SERVICE_ACCOUNT"));
const rootFolderId = /\/folders\/([A-Za-z0-9_-]+)/.exec(env("DRIVE_ROOT_FOLDER_ID"))?.[1] ?? env("DRIVE_ROOT_FOLDER_ID");

interface RunRow {
  id: string;
  status: SyncRun["status"];
  started_at: string;
  cursor: SyncCursor | unknown[];
  files_found: number;
  files_added: number;
  files_updated: number;
  files_missing: number;
  calls: number;
  notes: Record<string, unknown>;
  error: string | null;
}

const toRun = (r: RunRow): SyncRun => ({
  id: r.id,
  status: r.status,
  startedAt: r.started_at,
  cursor: Array.isArray(r.cursor) ? { queue: [], visited: [], skipped: 0 } : r.cursor,
  filesFound: r.files_found,
  filesAdded: r.files_added,
  filesUpdated: r.files_updated,
  filesMissing: r.files_missing,
  calls: r.calls,
  notes: r.notes ?? {},
  error: r.error,
});

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

const chunks = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

const store: SyncStore = {
  async runningRun() {
    const { data, error } = await db.from("drive_sync_runs").select("*").eq("status", "running").maybeSingle();
    fail("reading the sync", error);
    return data ? toRun(data as RunRow) : null;
  },
  async createRun(startedBy, cursor) {
    const { data, error } = await db.from("drive_sync_runs").insert({ started_by: startedBy, cursor }).select("*").single();
    // Two calls at once: the other one made the run.
    if (error?.code === "23505") {
      const running = await store.runningRun();
      if (running) return running;
    }
    fail("starting the sync", error);
    return toRun(data as RunRow);
  },
  async saveRun(run, finished) {
    const { error } = await db.from("drive_sync_runs").update({
      status: run.status,
      cursor: run.cursor,
      files_found: run.filesFound,
      files_added: run.filesAdded,
      files_updated: run.filesUpdated,
      files_missing: run.filesMissing,
      calls: run.calls,
      notes: run.notes,
      error: run.error ?? null,
      ...(finished ? { finished_at: new Date().toISOString() } : {}),
    }).eq("id", run.id);
    fail("saving the sync", error);
  },
  async existing(ids) {
    const out = new Map<string, string | null>();
    for (const part of chunks(ids, 200)) {
      const { data, error } = await db.from("drive_files").select("drive_file_id, drive_modified_at").in("drive_file_id", part);
      fail("reading files", error);
      for (const r of data as { drive_file_id: string; drive_modified_at: string | null }[]) {
        // Compare as Drive writes times: the database gives them back in its own format.
        out.set(r.drive_file_id, r.drive_modified_at && new Date(r.drive_modified_at).toISOString());
      }
    }
    return out;
  },
  async upsert(rows: FileRow[]) {
    for (const part of chunks(rows, 500)) {
      const { error } = await db.from("drive_files").upsert(part, { onConflict: "drive_file_id" });
      fail("saving files", error);
    }
  },
  async touchVideosOf(docIds, at) {
    const { error } = await db.rpc("drive_touch_videos", { p_doc_ids: docIds, p_at: at });
    fail("updating videos", error);
  },
  async liveCount() {
    const { data, error } = await db.rpc("drive_counts", { p_since: new Date().toISOString() });
    fail("counting files", error);
    return (data as { live: number }[])[0]?.live ?? 0;
  },
  async unseenSince(at) {
    const { data, error } = await db.rpc("drive_counts", { p_since: at });
    fail("counting files", error);
    return (data as { unseen: number }[])[0]?.unseen ?? 0;
  },
  async markMissing(at) {
    const { data, error } = await db.rpc("drive_mark_missing", { p_since: at });
    fail("hiding missing files", error);
    return data as number;
  },
};

let cachedToken: { value: string; until: number } | null = null;
async function googleToken(): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  if (!account) throw new Error("GOOGLE_SERVICE_ACCOUNT isn't set.");
  const value = await serviceAccountToken(account, "https://www.googleapis.com/auth/drive.readonly");
  cachedToken = { value, until: Date.now() + 50 * 60_000 };
  return value;
}

/** Compares without leaking how much of the secret matched. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAdmin(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return false;
  const { data: profile } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return (profile as { role?: string } | null)?.role === "admin";
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get("origin"), origins);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return jsonError(405, "Use POST.", cors);

  const scheduled = sameSecret(request.headers.get("x-sync-secret") ?? "", env("DRIVE_SYNC_SECRET"));
  if (!scheduled && !(await isAdmin(request))) return jsonError(401, "Not allowed.", cors);
  if (!account || !rootFolderId) return jsonError(503, "The Drive sync isn't set up: GOOGLE_SERVICE_ACCOUNT and DRIVE_ROOT_FOLDER_ID.", cors);

  const body = (await request.json().catch(() => ({}))) as { action?: string; run_id?: string };
  try {
    if (body.action === "apply") {
      if (scheduled) return jsonError(403, "Only an admin can apply a held sync.", cors);
      const { data } = await db.from("drive_sync_runs").select("*").eq("id", body.run_id ?? "").maybeSingle();
      if (!data) return jsonError(404, "No such sync.", cors);
      return Response.json(await applyHeldRun(store, toRun(data as RunRow)), { headers: cors });
    }
    const budget = Number(env("DRIVE_SYNC_BUDGET_MS"));
    const result = await syncStep(
      store,
      driveApi(googleToken),
      { ...DEFAULT_SYNC, rootFolderId, ...(budget > 0 ? { budgetMs: budget } : {}) },
      scheduled ? "schedule" : "admin",
    );
    return Response.json(result, { headers: cors });
  } catch (e) {
    console.error(e);
    return jsonError(500, e instanceof Error ? e.message : String(e), cors);
  }
});
