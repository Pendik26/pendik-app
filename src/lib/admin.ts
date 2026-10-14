import type { Track } from "../context/accountContextValue";
import { toPackage, type PackageRow, type PackageSummary } from "./exams";
import type { ImportQuestion } from "./questionMarkdown";
import { must, rpc } from "./db/client";

// What the admin pages read and change: the server's admin functions, which refuse anyone who
// isn't an admin.

// --- Students ---------------------------------------------------------------------------------

export interface RosterEntry {
  studentId: string;
  fullName: string;
  classGroup: string | null;
  cohort: string;
  track: Track | null;
  userId: string | null;
  role: "student" | "admin" | null;
  account: "none" | "active" | "locked";
  mustChangePassword: boolean | null;
  googleLinked: boolean;
}

interface RosterRow {
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string;
  track: Track | null;
  user_id: string | null;
  role: "student" | "admin" | null;
  account: RosterEntry["account"];
  must_change_password: boolean | null;
  google_linked: boolean;
}

export async function listRoster(): Promise<RosterEntry[]> {
  const rows = await must(rpc<RosterRow[]>("admin_list_roster"));
  return rows.map((r) => ({
    studentId: r.student_id,
    fullName: r.full_name,
    classGroup: r.class_group,
    cohort: r.cohort,
    track: r.track,
    userId: r.user_id,
    role: r.role,
    account: r.account,
    mustChangePassword: r.must_change_password,
    googleLinked: r.google_linked,
  }));
}

export interface NewRosterRow {
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string;
  track: Track | null;
}

/** "IUP", "Reguler" or "Regular" (any case) as a track, else null. */
export function trackOf(cell: string): Track | null {
  if (/^iup$/i.test(cell)) return "IUP";
  if (/^regul[ae]r$/i.test(cell)) return "REGULER";
  return null;
}

/**
 * Reads pasted roster lines: "student id, full name[, class[, cohort]]", separated by commas,
 * tabs or semicolons (a spreadsheet copy works). A header line is skipped. A cell after the name
 * that says IUP or Reguler sets that student's track; otherwise they get `defaultTrack`.
 */
export function parseRosterLines(text: string, defaultCohort: string, defaultTrack: Track | null = null): { rows: NewRosterRow[]; problems: string[] } {
  const rows: NewRosterRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|;|,/).map((c) => c.trim());
    const [id = "", name = "", ...rest] = cells;
    const trackCell = rest.find((c) => trackOf(c));
    const [group = "", cohort = ""] = rest.filter((c) => c !== trackCell);
    if (i === 0 && /^(nim|student|id)/i.test(id) && !/[0-9]/.test(id)) return;
    if (!/^[0-9A-Za-z]{3,30}$/.test(id)) { problems.push(`Line ${i + 1}: "${id}" isn't a student id.`); return; }
    if (!name) { problems.push(`Line ${i + 1}: no name.`); return; }
    if (seen.has(id)) { problems.push(`Line ${i + 1}: ${id} is listed twice.`); return; }
    seen.add(id);
    rows.push({ student_id: id, full_name: name.slice(0, 120), class_group: group || null, cohort: (cohort || defaultCohort).slice(0, 10), track: trackCell ? trackOf(trackCell) : defaultTrack });
  });
  return { rows, problems };
}

/** Adds students to the roster; a student already on it is updated (the server does the upsert). */
export async function addToRoster(rows: NewRosterRow[]): Promise<void> {
  await must(rpc("admin_add_students", { p_rows: rows }));
}

/** Moves a student to the other class (the track lives on the roster only). */
export async function setTrack(studentId: string, track: Track | null): Promise<void> {
  await must(rpc("admin_set_track", { p_student_id: studentId, p_track: track }));
}

/** Removes a student who has no account yet (the server refuses an activated one). */
export async function removeFromRoster(studentId: string): Promise<void> {
  await must(rpc("admin_remove_student", { p_student_id: studentId }));
}

export function activateAccounts(studentIds: string[]): Promise<{ results: { student_id: string; ok: boolean; message?: string }[] }> {
  return must(rpc<{ results: { student_id: string; ok: boolean; message?: string }[] }>("admin_accounts", { action: "activate", student_ids: studentIds }));
}

export function accountAction(action: "lock" | "unlock" | "reset", userId: string): Promise<{ ok: boolean }> {
  return must(rpc<{ ok: boolean }>("admin_accounts", { action, user_id: userId }));
}

export async function setRole(userId: string, role: "student" | "admin"): Promise<void> {
  await must(rpc("admin_set_role", { p_user_id: userId, p_role: role }));
}

// --- Questions and packages ---------------------------------------------------------------------

export async function listAllPackages(): Promise<PackageSummary[]> {
  const rows = await must(rpc<PackageRow[]>("package_summaries"));
  return rows.map(toPackage);
}

export async function setPackageStatus(packageId: string, status: "draft" | "published"): Promise<void> {
  await must(rpc("admin_set_package_status", { p_package_id: packageId, p_status: status }));
}

export async function updatePackage(packageId: string, patch: { title?: string; time_limit_minutes?: number | null; track_best?: boolean; track?: Track | null }): Promise<void> {
  await must(rpc("admin_update_package", { p_package_id: packageId, p_patch: patch }));
}

export async function deletePackage(packageId: string): Promise<void> {
  await must(rpc("admin_delete_package", { p_package_id: packageId }));
}

/** Packages an admin has deleted, newest first. */
export async function listDeletedPackages(): Promise<PackageSummary[]> {
  const rows = await must(rpc<PackageRow[]>("admin_deleted_packages"));
  return rows.map(toPackage);
}

/** Brings a deleted package back, as a draft. */
export async function restorePackage(packageId: string): Promise<void> {
  await must(rpc("admin_restore_package", { p_package_id: packageId }));
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
  /** True for a question an admin deleted (only listed when asked for). */
  deleted?: boolean;
}

export async function packageQuestions(packageId: string): Promise<AdminQuestion[]> {
  return must(rpc<AdminQuestion[]>("admin_package_questions", { p_package_id: packageId }));
}

/** A question in the bank, with what it is and which packages use it. */
export interface BankQuestion extends AdminQuestion {
  block: string;
  source: string | null;
  year: number | null;
  packages: string[];
}

export interface BankFilter {
  block?: string;
  source?: string;
  year?: number;
  subject?: string;
  text?: string;
  /** Only deleted questions, to bring them back. */
  deleted?: boolean;
}

/** Most questions one search shows. */
export const BANK_PAGE = 100;

/** Questions in the bank matching every filter given, newest import first (at most BANK_PAGE). */
export async function searchQuestions(filter: BankFilter): Promise<BankQuestion[]> {
  const rows = await must(
    rpc<Omit<BankQuestion, "position">[]>("admin_search_questions", {
      p_block: filter.block ?? null,
      p_source: filter.source ?? null,
      p_year: filter.year ?? null,
      p_subject: filter.subject ?? null,
      p_text: filter.text?.trim() || null,
      p_deleted: filter.deleted === true,
    }),
  );
  return rows.slice(0, BANK_PAGE).map((r, i) => ({ ...r, position: i + 1, packages: r.packages ?? [] }));
}

export interface QuestionFacets {
  blocks: string[];
  sources: string[];
  years: number[];
  subjects: string[];
}

/** The blocks, sources, years and subjects in the bank, for the filters (worked out by the server). */
export async function questionFacets(): Promise<QuestionFacets> {
  const f = await must(rpc<QuestionFacets>("admin_question_facets"));
  const sorted = <T,>(xs: T[]) => [...xs].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return { blocks: sorted(f.blocks), sources: sorted(f.sources), years: sorted(f.years).reverse(), subjects: sorted(f.subjects) };
}

export type QuestionPatch = Partial<Pick<AdminQuestion, "subject" | "stem" | "stem_image" | "stem_image_alt" | "options" | "correct_index" | "accepted_answers" | "explanation">>;

/** Saves an edit; the question's revision goes up when anything a student sees changed. */
export async function updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
  await must(rpc("admin_update_question", { p_question_id: questionId, p_patch: patch }));
}

/** Brings a deleted question back. */
export async function restoreQuestion(questionId: string): Promise<void> {
  await must(rpc("admin_restore_question", { p_question_id: questionId }));
}

/** Takes a question out of every package; attempts that already used it keep it. */
export async function deleteQuestion(questionId: string): Promise<void> {
  await must(rpc("admin_delete_question", { p_question_id: questionId }));
}

export async function importQuestions(title: string, sourceText: string, questions: ImportQuestion[]): Promise<string> {
  return must(rpc<string>("admin_import_questions", { p_title: title, p_source_text: sourceText, p_questions: questions }));
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
  return must(
    rpc<{ exam_id: string; practice_id: string; question_count: number }>("admin_packages_from_import", {
      p_import_id: input.importId,
      p_exam_title: input.examTitle,
      p_practice_title: input.practiceTitle,
      p_block: input.block,
      p_source: input.source,
      p_year: input.year,
      p_time_limit_minutes: input.timeLimitMinutes,
      p_track_best: input.trackBest,
    }),
  );
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
  return must(rpc<SyncRunRow[]>("admin_sync_runs"));
}

export interface SyncStepResult {
  runId: string;
  status: SyncRunRow["status"];
  remaining: number;
  filesFound: number;
}

async function syncCall(body: object): Promise<SyncStepResult> {
  const res = await fetch("/api/drive-sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (Partial<SyncStepResult> & { error?: string }) | null;
  if (!res.ok || !data || data.error) throw new Error(data?.error ?? "server_error");
  return data as SyncStepResult;
}

export function syncStep(): Promise<SyncStepResult> {
  return syncCall({});
}

export function applyHeldSync(runId: string): Promise<SyncStepResult> {
  return syncCall({ action: "apply", run_id: runId });
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
  sort_order: number | null;
}

export async function searchDriveFiles(query: string, onlyHidden: boolean): Promise<AdminDriveFile[]> {
  return must(rpc<AdminDriveFile[]>("admin_drive_files", { p_query: query.trim() || null, p_only_hidden: onlyHidden }));
}

/** Puts a file in an admin's order within its folder (lower first), or back to by-name (null). */
export async function setFileOrder(id: string, order: number | null): Promise<void> {
  await must(rpc("admin_set_file_order", { p_id: id, p_order: order }));
}

export async function setFileHidden(id: string, hidden: boolean): Promise<void> {
  await must(rpc("admin_set_file_hidden", { p_id: id, p_hidden: hidden }));
}

// --- Schedule ---------------------------------------------------------------------------------

export const saveScheduleEvents = (events: unknown[]) => must(rpc<{ saved: number }>("admin_save_events", { p_events: events }));
export const clearScheduleGroup = (group: string, kind: "tutor" | "sl") => must(rpc<{ deleted: number }>("admin_delete_events", { p_group: group, p_kind: kind }));
export const saveLecturer = (name: string, phones: string[], id?: string) => must(rpc("admin_save_lecturer", { p_name: name, p_phones: phones, p_id: id ?? null }));
export const deleteLecturer = (id: string) => must(rpc("admin_delete_lecturer", { p_id: id }));
export const saveScheduleDoc = (doc: { title: string; url: string; block: string; track: "IUP" | "REGULER" | null }) =>
  must(rpc("admin_save_schedule_doc", { p_title: doc.title, p_url: doc.url, p_block: doc.block, p_track: doc.track }));
export const deleteScheduleDoc = (id: string) => must(rpc("admin_delete_schedule_doc", { p_id: id }));
export const listLecturerReports = () => must(rpc<import("./schedule").LecturerReport[]>("admin_lecturer_reports"));
export const resolveLecturerReport = (id: string) => must(rpc("admin_resolve_report", { p_id: id }));
