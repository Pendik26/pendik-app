import { timingSafeEqual } from "node:crypto";
import type { MongoClient, Db } from "mongodb";
import { answerAi, type AiConfig } from "./ai.js";
import type { Auth } from "./auth.js";
import { ApiError, audit, refuse, type Args, type Caller, type Ctx } from "./context.js";
import { collections, today, type Collections } from "./db.js";
import { driveFiles, adminDriveFiles, adminSetFileHidden, adminSetFileOrder, adminSyncRuns, driveSyncStep, type DriveSyncConfig } from "./drive.js";
import * as exams from "./exams.js";
import { loadQuestionImage, MAX_IMAGE_BYTES, storeQuestionImage } from "./images.js";
import * as people from "./people.js";
import * as schedule from "./schedule.js";
import * as study from "./study.js";
import { allowedOrigins, corsHeaders } from "./http.js";

// The whole API as one fetch-style handler (api/index.ts serves it on Vercel):
//   /api/auth/*          Better Auth: sign-in, sign-out, password, Google
//   /api/config          what this site has switched on
//   POST /api/rpc/<name> the app's functions, below: { ...arguments } -> { data } or { error }
//   POST /api/ai/<kind>  "Explain this" and Alfond, streamed as plain text
//   POST /api/drive-sync one step of copying the class Drive (a secret, or an admin)
//   POST /api/question-image  an admin uploads a question picture (the file as the body)
//   GET  /api/question-image/<id>  a stored picture, for signed-in students
// Every function but sign-in needs a signed-in student on the roster; the admin_* ones an admin.

export interface AppDeps {
  db: Db;
  client?: MongoClient;
  auth: Auth;
  /** "Explain this" through an AI gateway; absent when the AI settings aren't configured. */
  ai?: { config: AiConfig; fetch?: typeof fetch };
  drive?: DriveSyncConfig;
  /** The secret a scheduled sync sends (DRIVE_SYNC_SECRET). */
  driveSyncSecret?: string;
  /** Addresses allowed to call the API from another origin (APP_ORIGINS). */
  origins?: string;
}

type Fn = (ctx: Ctx, args: Args) => unknown;

const FUNCTIONS: Record<string, Fn> = {
  my_account: (ctx) => people.myAccount(ctx),
  update_my_settings: people.updateMySettings,
  password_changed: (ctx) => people.passwordChanged(ctx),
  leaderboard: people.leaderboard,
  save_readiness: people.saveReadiness,
  class_readiness: people.classReadiness,

  record_reviews: study.recordReviews,
  record_quiz: study.recordQuiz,
  finish_chapter: study.finishChapter,
  record_study_day: (ctx) => study.recordStudyDay(ctx),
  user_state_list: study.userStateList,
  user_state_save: study.userStateSave,

  package_summaries: (ctx) => exams.packageSummaries(ctx),
  my_attempts: (ctx) => exams.myAttempts(ctx),
  start_attempt: exams.startAttempt,
  get_attempt: exams.getAttempt,
  save_attempt: exams.saveAttempt,
  take_over_attempt: exams.takeOverAttempt,
  submit_attempt: exams.submitAttempt,
  abandon_attempt: exams.abandonAttempt,
  get_attempt_result: exams.getAttemptResult,
  bank_options: (ctx) => exams.bankOptions(ctx),
  start_bank_practice: exams.startBankPractice,
  bookmark_ids: (ctx) => exams.bookmarkIds(ctx),
  set_bookmark: exams.setBookmark,
  my_bookmarks: (ctx) => exams.myBookmarks(ctx),

  drive_files: (ctx) => driveFiles(ctx),

  schedule_events: (ctx) => schedule.scheduleEvents(ctx),
  schedule_groups: (ctx) => schedule.scheduleGroups(ctx),
  schedule_docs: (ctx) => schedule.scheduleDocs(ctx),
  lecturers: (ctx) => schedule.lecturers(ctx),
  report_lecturer: schedule.reportLecturer,

  admin_search_questions: exams.adminSearchQuestions,
  admin_question_facets: (ctx) => exams.adminQuestionFacets(ctx),
  admin_update_question: exams.adminUpdateQuestion,
  admin_delete_question: exams.adminDeleteQuestion,
  admin_restore_question: exams.adminRestoreQuestion,
  admin_import_questions: exams.adminImportQuestions,
  admin_package_questions: exams.adminPackageQuestions,
  admin_packages_from_import: exams.adminPackagesFromImport,
  admin_set_package_status: exams.adminSetPackageStatus,
  admin_update_package: exams.adminUpdatePackage,
  admin_delete_package: exams.adminDeletePackage,
  admin_restore_package: exams.adminRestorePackage,
  admin_deleted_packages: (ctx) => exams.adminDeletedPackages(ctx),
  admin_add_students: people.adminAddStudents,
  admin_set_track: people.adminSetTrack,
  admin_remove_student: people.adminRemoveStudent,
  admin_set_role: people.adminSetRole,
  admin_audit_log: (ctx) => people.adminAuditLog(ctx),
  admin_drive_files: adminDriveFiles,
  admin_set_file_order: adminSetFileOrder,
  admin_set_file_hidden: adminSetFileHidden,
  admin_sync_runs: (ctx) => adminSyncRuns(ctx),
  admin_save_events: schedule.adminSaveEvents,
  admin_delete_events: schedule.adminDeleteEvents,
  admin_save_lecturer: schedule.adminSaveLecturer,
  admin_delete_lecturer: schedule.adminDeleteLecturer,
  admin_save_schedule_doc: schedule.adminSaveScheduleDoc,
  admin_delete_schedule_doc: schedule.adminDeleteScheduleDoc,
  admin_lecturer_reports: (ctx) => schedule.adminLecturerReports(ctx),
  admin_resolve_report: schedule.adminResolveReport,
};

const NO_STORE = { "cache-control": "no-store" };

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...NO_STORE, ...headers } });
}

const error = (status: number, code: string, headers: Record<string, string> = {}) => json({ error: code }, status, headers);

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_AI_BYTES = { explain: 16_000, chat: 48_000 };

export function createApp(deps: AppDeps) {
  const { auth } = deps;
  const c: Collections = collections(deps.db);
  const origins = allowedOrigins(deps.origins);

  /** The signed-in student, or the reason there isn't one. */
  async function caller(request: Request): Promise<Caller> {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new ApiError(401, "not_signed_in");
    const account = await c.accounts.findOne({ _id: session.user.id });
    if (!account) throw new ApiError(403, "not_on_roster");
    if (account.lockedAt) throw new ApiError(403, "locked");
    const student = await c.students.findOne({ _id: account.nim });
    if (!student) throw new ApiError(403, "not_on_roster");
    return { userId: account._id, account, student };
  }

  async function rpc(request: Request, name: string, cors: Record<string, string>): Promise<Response> {
    if (request.method !== "POST") return error(405, "use_post", cors);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "too_big", cors);
    let args: Args = {};
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
        args = parsed as Args;
      } catch {
        return error(400, "invalid_json", cors);
      }
    }
    const ctx: Ctx = { c, caller: await caller(request), now: new Date() };
    if (name === "admin_list_roster") return json({ data: await people.adminListRoster(ctx, auth) }, 200, cors);
    if (name === "admin_accounts") return json({ data: await people.adminAccounts(ctx, auth, args) }, 200, cors);
    const fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
    if (!fn) return error(404, "unknown_function", cors);
    return json({ data: (await fn(ctx, args)) ?? null }, 200, cors);
  }

  async function askAi(request: Request, kind: "explain" | "chat", cors: Record<string, string>): Promise<Response> {
    if (request.method !== "POST") return error(405, "use_post", cors);
    if (!deps.ai) return error(503, "AI isn't switched on for this site.", cors);
    const who = await caller(request);
    const body = await request.text();
    if (body.length > MAX_AI_BYTES[kind]) return error(413, kind === "chat" ? "That message is too long." : "That question is too long to explain.", cors);
    const day = today();
    const response = await answerAi(kind, body, deps.ai.config, {
      take: async (limit) => {
        const doc = await c.aiUsage.findOneAndUpdate(
          { userId: who.userId, day, count: { $lt: limit } },
          { $inc: { count: 1 } },
          { returnDocument: "after" },
        ).catch(() => null);
        if (doc) return limit - doc.count;
        // Either no document yet (create it) or the allowance is used up.
        try {
          await c.aiUsage.insertOne({ userId: who.userId, day, count: 1 });
          return limit - 1;
        } catch {
          return -1;
        }
      },
      refund: async () => {
        await c.aiUsage.updateOne({ userId: who.userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } });
      },
    }, deps.ai.fetch);
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  }

  async function uploadQuestionImage(request: Request, cors: Record<string, string>): Promise<Response> {
    if (request.method !== "POST") return error(405, "use_post", cors);
    const who = await caller(request);
    if (who.account.role !== "admin") throw refuse("admins_only", 403);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return error(413, "image_too_big", cors);
    const body = new Uint8Array(await request.arrayBuffer());
    const name = new URL(request.url).searchParams.get("name") ?? "image";
    const stored = await storeQuestionImage(c, body, name, who.userId, new Date());
    await audit({ c, caller: who, now: new Date() }, "image.upload", stored.id, { name, bytes: body.length });
    return json({ data: stored }, 200, cors);
  }

  async function questionImage(request: Request, id: string, cors: Record<string, string>): Promise<Response> {
    if (request.method !== "GET") return error(405, "use_get", cors);
    await caller(request);
    const { contentType, bytes } = await loadQuestionImage(c, id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-type": contentType, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff", ...cors },
    });
  }

  async function driveSync(request: Request, cors: Record<string, string>): Promise<Response> {
    if (request.method !== "POST") return error(405, "use_post", cors);
    const scheduled = sameSecret(request.headers.get("x-sync-secret") ?? "", deps.driveSyncSecret ?? "");
    if (!scheduled) {
      const who = await caller(request);
      if (who.account.role !== "admin") throw refuse("admins_only", 403);
    }
    if (!deps.drive) return error(503, "drive_not_set_up", cors);
    const body = (await request.json().catch(() => ({}))) as { action?: string; run_id?: string };
    return json(await driveSyncStep(c, deps.drive, scheduled ? "schedule" : "admin", body), 200, cors);
  }

  return async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const cors = corsHeaders(request.headers.get("origin"), origins);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (pathname.startsWith("/api/auth/")) return await auth.handler(request);
      if (pathname === "/api/config" && request.method === "GET") return json({ ai: Boolean(deps.ai), drive: Boolean(deps.drive) }, 200, cors);
      if (pathname.startsWith("/api/rpc/")) return await rpc(request, pathname.slice("/api/rpc/".length), cors);
      if (pathname === "/api/ai/explain" || pathname === "/api/ai/chat") return await askAi(request, pathname.endsWith("chat") ? "chat" : "explain", cors);
      if (pathname === "/api/drive-sync") return await driveSync(request, cors);
      if (pathname === "/api/question-image") return await uploadQuestionImage(request, cors);
      if (pathname.startsWith("/api/question-image/")) return await questionImage(request, pathname.slice("/api/question-image/".length), cors);
      return error(404, "not_found", cors);
    } catch (err) {
      if (err instanceof ApiError) return error(err.status, err.message, cors);
      console.error(err);
      return error(500, "server_error", cors);
    }
  };
}

export type App = ReturnType<typeof createApp>;
