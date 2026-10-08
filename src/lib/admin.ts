import { PACKAGE_COLUMNS, toPackage, type PackageSummary } from "./exams";
import type { ImportQuestion } from "./questionMarkdown";
import { supabase } from "./supabase";

// What the admin pages read and change. Admins reach the tables directly (row-level security lets
// them); steps that must happen together are database functions, and account changes that need
// the service role go through the admin-accounts Edge Function.

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (error) {
    // The function's own { error } message, when it sent one.
    const context = (error as { context?: Response }).context;
    const detail = context ? ((await context.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
    throw new Error(detail ?? error.message);
  }
  return data as T;
}

// --- Students ---------------------------------------------------------------------------------

export interface RosterEntry {
  studentId: string;
  fullName: string;
  classGroup: string | null;
  cohort: string;
  userId: string | null;
  role: "student" | "admin" | null;
  account: "none" | "active" | "locked";
  mustChangePassword: boolean | null;
  googleLinked: boolean;
}

export async function listRoster(): Promise<RosterEntry[]> {
  const rows = await must(supabase.rpc("admin_list_roster"));
  return (rows as Record<string, unknown>[]).map((r) => ({
    studentId: String(r.student_id),
    fullName: String(r.full_name),
    classGroup: (r.class_group as string | null) ?? null,
    cohort: String(r.cohort),
    userId: (r.user_id as string | null) ?? null,
    role: (r.role as RosterEntry["role"]) ?? null,
    account: r.account as RosterEntry["account"],
    mustChangePassword: (r.must_change_password as boolean | null) ?? null,
    googleLinked: Boolean(r.google_linked),
  }));
}

export interface NewRosterRow {
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string;
}

/**
 * Reads pasted roster lines: "student id, full name[, class[, cohort]]", separated by commas,
 * tabs or semicolons (a spreadsheet copy works). A header line is skipped.
 */
export function parseRosterLines(text: string, defaultCohort: string): { rows: NewRosterRow[]; problems: string[] } {
  const rows: NewRosterRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|;|,/).map((c) => c.trim());
    const [id = "", name = "", group = "", cohort = ""] = cells;
    if (i === 0 && /^(nim|student|id)/i.test(id) && !/[0-9]/.test(id)) return;
    if (!/^[0-9A-Za-z]{3,30}$/.test(id)) { problems.push(`Line ${i + 1}: "${id}" isn't a student id.`); return; }
    if (!name) { problems.push(`Line ${i + 1}: no name.`); return; }
    if (seen.has(id)) { problems.push(`Line ${i + 1}: ${id} is listed twice.`); return; }
    seen.add(id);
    rows.push({ student_id: id, full_name: name.slice(0, 120), class_group: group || null, cohort: (cohort || defaultCohort).slice(0, 10) });
  });
  return { rows, problems };
}

export async function addToRoster(rows: NewRosterRow[]): Promise<void> {
  await must(supabase.from("roster").upsert(rows, { onConflict: "student_id" }));
}

export async function removeFromRoster(studentId: string): Promise<void> {
  await must(supabase.from("roster").delete().eq("student_id", studentId));
}

export function activateAccounts(studentIds: string[]): Promise<{ results: { student_id: string; ok: boolean; message?: string }[] }> {
  return invoke("admin-accounts", { action: "activate", student_ids: studentIds });
}

export function accountAction(action: "lock" | "unlock" | "reset", userId: string): Promise<{ ok: boolean }> {
  return invoke("admin-accounts", { action, user_id: userId });
}

export async function setRole(userId: string, role: "student" | "admin"): Promise<void> {
  await must(supabase.rpc("admin_set_role", { p_user_id: userId, p_role: role }));
}

// --- Questions and packages ---------------------------------------------------------------------

export async function listAllPackages(): Promise<PackageSummary[]> {
  const rows = await must(supabase.from("package_summaries").select(PACKAGE_COLUMNS).order("block").order("title"));
  return (rows as Parameters<typeof toPackage>[0][]).map(toPackage);
}

export async function setPackageStatus(packageId: string, status: "draft" | "published"): Promise<void> {
  await must(supabase.rpc("admin_set_package_status", { p_package_id: packageId, p_status: status }));
}

export async function updatePackage(packageId: string, patch: { title?: string; time_limit_minutes?: number | null; track_best?: boolean }): Promise<void> {
  await must(supabase.from("packages").update(patch).eq("id", packageId));
}

export async function deletePackage(packageId: string): Promise<void> {
  await must(supabase.from("packages").update({ deleted_at: new Date().toISOString(), status: "draft" }).eq("id", packageId));
}

export interface AdminQuestion {
  id: string;
  position: number;
  type: "single_choice" | "short_answer";
  subject: string | null;
  stem: string;
  stem_image: string | null;
  stem_image_alt: string | null;
  options: { text: string; image: string | null }[] | null;
  correct_index: number | null;
  accepted_answers: string[] | null;
  explanation: string | null;
  revision: number;
  status: "draft" | "published";
}

export async function packageQuestions(packageId: string): Promise<AdminQuestion[]> {
  const rows = await must(
    supabase
      .from("package_questions")
      .select("position, questions!inner(id, type, subject, stem, stem_image, stem_image_alt, options, correct_index, accepted_answers, explanation, revision, status, deleted_at)")
      .eq("package_id", packageId)
      .is("questions.deleted_at", null)
      .order("position"),
  );
  return (rows as unknown as { position: number; questions: Omit<AdminQuestion, "position"> }[]).map((r) => ({ ...r.questions, position: r.position }));
}

export type QuestionPatch = Partial<Pick<AdminQuestion, "subject" | "stem" | "stem_image" | "stem_image_alt" | "options" | "correct_index" | "accepted_answers" | "explanation">>;

export async function updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
  await must(supabase.from("questions").update(patch).eq("id", questionId));
}

/** Takes a question out of every package; attempts that already used it keep it. */
export async function deleteQuestion(questionId: string): Promise<void> {
  await must(supabase.from("questions").update({ deleted_at: new Date().toISOString() }).eq("id", questionId));
}

export async function importQuestions(title: string, sourceText: string, questions: ImportQuestion[]): Promise<string> {
  return (await must(supabase.rpc("admin_import_questions", { p_title: title, p_source_text: sourceText, p_questions: questions }))) as string;
}

export async function packagesFromImport(input: {
  importId: string;
  examTitle: string;
  practiceTitle: string;
  block: string;
  source: string | null;
  year: number | null;
  timeLimitMinutes: number;
  trackBest: boolean;
}): Promise<{ exam_id: string; practice_id: string; question_count: number }> {
  return (await must(
    supabase.rpc("admin_packages_from_import", {
      p_import_id: input.importId,
      p_exam_title: input.examTitle,
      p_practice_title: input.practiceTitle,
      p_block: input.block,
      p_source: input.source,
      p_year: input.year,
      p_time_limit_minutes: input.timeLimitMinutes,
      p_track_best: input.trackBest,
    }),
  )) as { exam_id: string; practice_id: string; question_count: number };
}

/** About a minute a question, rounded to five minutes. */
export const suggestedMinutes = (questions: number) => Math.max(5, Math.min(300, Math.round(questions / 5) * 5));

// --- Drive --------------------------------------------------------------------------------------

export interface SyncRunRow {
  id: string;
  status: "running" | "done" | "failed" | "held";
  started_by: "schedule" | "admin";
  files_found: number;
  files_added: number;
  files_updated: number;
  files_missing: number;
  calls: number;
  notes: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function listSyncRuns(): Promise<SyncRunRow[]> {
  return (await must(
    supabase.from("drive_sync_runs").select("id, status, started_by, files_found, files_added, files_updated, files_missing, calls, notes, error, started_at, finished_at").order("started_at", { ascending: false }).limit(15),
  )) as SyncRunRow[];
}

export interface SyncStepResult {
  runId: string;
  status: SyncRunRow["status"];
  remaining: number;
  filesFound: number;
}

export function syncStep(): Promise<SyncStepResult> {
  return invoke("drive-sync", {});
}

export function applyHeldSync(runId: string): Promise<SyncStepResult> {
  return invoke("drive-sync", { action: "apply", run_id: runId });
}

export interface AdminDriveFile {
  id: string;
  title: string;
  kind: string;
  block: string | null;
  category: string | null;
  folder_path: string[];
  hidden_at: string | null;
  missing_since: string | null;
}

export async function searchDriveFiles(query: string, onlyHidden: boolean): Promise<AdminDriveFile[]> {
  let q = supabase.from("drive_files").select("id, title, kind, block, category, folder_path, hidden_at, missing_since").order("title").limit(100);
  if (query.trim()) q = q.ilike("title", `%${query.trim().replace(/[%_]/g, "\\$&")}%`);
  if (onlyHidden) q = q.not("hidden_at", "is", null);
  return (await must(q)) as AdminDriveFile[];
}

export async function setFileHidden(id: string, hidden: boolean): Promise<void> {
  await must(supabase.from("drive_files").update({ hidden_at: hidden ? new Date().toISOString() : null }).eq("id", id));
}
