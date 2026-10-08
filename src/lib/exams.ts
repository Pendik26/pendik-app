import { useSyncExternalStore } from "react";
import { errorCode, supabase } from "./supabase";

// Exam and practice packages, run by the database (see supabase/migrations/…_attempts.sql): the
// browser shows questions and sends answers; the server keeps time, holds the keys and grades.
//
// The packages and the student's own attempts are loaded at sign-in and kept here, so pages and
// the study plan can read them without waiting; they're read again after each submit.

export type PackageMode = "exam" | "practice";

export interface PackageSummary {
  id: string;
  title: string;
  block: string | null;
  source: string | null;
  year: number | null;
  mode: PackageMode;
  timeLimitMinutes: number | null;
  trackBest: boolean;
  status: "draft" | "published";
  questionCount: number;
}

export interface AttemptSummary {
  id: string;
  packageId: string;
  mode: PackageMode;
  status: "in_progress" | "finished" | "abandoned";
  score: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  blankCount: number | null;
  timeLimitMinutes: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ExamRecords {
  loaded: boolean;
  packages: PackageSummary[];
  /** The student's attempts, newest first. */
  attempts: AttemptSummary[];
}

interface PackageRow {
  id: string;
  title: string;
  block: string | null;
  source: string | null;
  year: number | null;
  mode: PackageMode;
  time_limit_minutes: number | null;
  track_best: boolean;
  status: "draft" | "published";
  question_count: number;
}

interface AttemptRow {
  id: string;
  package_id: string;
  mode: PackageMode;
  status: AttemptSummary["status"];
  score: number | string | null;
  correct_count: number | null;
  wrong_count: number | null;
  blank_count: number | null;
  time_limit_minutes: number | null;
  started_at: string;
  finished_at: string | null;
}

export const toPackage = (r: PackageRow): PackageSummary => ({
  id: r.id,
  title: r.title,
  block: r.block,
  source: r.source,
  year: r.year,
  mode: r.mode,
  timeLimitMinutes: r.time_limit_minutes,
  trackBest: r.track_best,
  status: r.status,
  questionCount: r.question_count,
});

const toAttempt = (r: AttemptRow): AttemptSummary => ({
  id: r.id,
  packageId: r.package_id,
  mode: r.mode,
  status: r.status,
  // numeric comes back as a string.
  score: r.score === null ? null : Number(r.score),
  correctCount: r.correct_count,
  wrongCount: r.wrong_count,
  blankCount: r.blank_count,
  timeLimitMinutes: r.time_limit_minutes,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

const EMPTY: ExamRecords = { loaded: false, packages: [], attempts: [] };
let records: ExamRecords = EMPTY;
const listeners = new Set<() => void>();

function setRecords(next: ExamRecords) {
  records = next;
  for (const l of listeners) l();
}

export const PACKAGE_COLUMNS = "id, title, block, source, year, mode, time_limit_minutes, track_best, status, question_count";
const ATTEMPT_COLUMNS =
  "id, package_id, mode, status, score, correct_count, wrong_count, blank_count, time_limit_minutes, started_at, finished_at";

/** Reads the published packages and the student's attempts (at sign-in and after a submit). */
export async function loadExamRecords(): Promise<void> {
  const [packages, attempts] = await Promise.all([
    supabase.from("package_summaries").select(PACKAGE_COLUMNS).eq("status", "published").order("title"),
    supabase.from("attempts").select(ATTEMPT_COLUMNS).order("started_at", { ascending: false }).limit(500),
  ]);
  if (packages.error) throw packages.error;
  if (attempts.error) throw attempts.error;
  setRecords({
    loaded: true,
    packages: (packages.data as PackageRow[]).map(toPackage),
    attempts: (attempts.data as AttemptRow[]).map(toAttempt),
  });
}

export function clearExamRecords(): void {
  setRecords(EMPTY);
}

export function examRecords(): ExamRecords {
  return records;
}

export function useExamRecords(): ExamRecords {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => records,
    () => EMPTY,
  );
}

/** A block's packages: exams first, then practice, each by title. */
export function packagesForBlock(blockId: string, from: ExamRecords = records): PackageSummary[] {
  return from.packages
    .filter((p) => p.block === blockId)
    .sort((a, b) => (a.mode === b.mode ? a.title.localeCompare(b.title) : a.mode === "exam" ? -1 : 1));
}

export function finishedAttempts(packageId: string, from: ExamRecords = records): AttemptSummary[] {
  return from.attempts.filter((a) => a.packageId === packageId && a.status === "finished");
}

export function bestScore(packageId: string, from: ExamRecords = records): number | null {
  const scores = finishedAttempts(packageId, from).map((a) => a.score).filter((s): s is number => s !== null);
  return scores.length ? Math.max(...scores) : null;
}

/** The attempt the student has running, if any (there is at most one). */
export function runningAttempt(from: ExamRecords = records): AttemptSummary | null {
  return from.attempts.find((a) => a.status === "in_progress") ?? null;
}

// ---------------------------------------------------------------------------------------------
// Taking a package.

/** Each tab has its own id, so the server can tell which tab holds an attempt. */
export function tabHolderId(): string {
  const KEY = "pendik:tab-holder";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return (holderFallback ??= crypto.randomUUID());
  }
}
let holderFallback: string | undefined;

export interface AttemptOption {
  text: string;
  image: string | null;
}

export interface AttemptQuestion {
  id: string;
  type: "single_choice" | "short_answer";
  subject: string | null;
  stem: string;
  stemImage: string | null;
  stemImageAlt: string | null;
  revision: number;
  options: AttemptOption[] | null;
  /** Only in practice attempts and results: the correct option's position as shown. */
  correct?: number | null;
  acceptedAnswers?: string[] | null;
  explanation?: string | null;
}

/** An answer as saved: the chosen option's position as shown, or a typed answer. */
export type AttemptAnswer = { choice: number } | { text: string; self_mark?: boolean };

export interface RunningAttempt {
  id: string;
  status: "in_progress";
  mode: PackageMode;
  packageId: string;
  title: string;
  holder: "you" | "other" | "free";
  secondsLeft: number | null;
  answers: Record<string, AttemptAnswer>;
  flagged: string[];
  tabLeaves: number;
  questions: AttemptQuestion[] | null;
}

export type AttemptState = RunningAttempt | { id: string; status: "finished" | "abandoned" };

interface QuestionJson {
  id: string;
  type: AttemptQuestion["type"];
  subject: string | null;
  stem: string;
  stem_image: string | null;
  stem_image_alt?: string | null;
  revision: number;
  options: AttemptOption[] | null;
  correct?: number | null;
  accepted_answers?: string[] | null;
  explanation?: string | null;
}

const toQuestion = (q: QuestionJson): AttemptQuestion => ({
  id: q.id,
  type: q.type,
  subject: q.subject,
  stem: q.stem,
  stemImage: q.stem_image,
  stemImageAlt: q.stem_image_alt ?? null,
  revision: q.revision,
  options: q.options,
  ...("correct" in q ? { correct: q.correct, acceptedAnswers: q.accepted_answers ?? null, explanation: q.explanation ?? null } : {}),
});

/** Messages for the codes the attempt functions raise. */
export const ATTEMPT_ERRORS: Record<string, string> = {
  package_not_found: "exam.errNotFound",
  package_empty: "exam.errEmpty",
  attempt_not_found: "exam.errNotFound",
  attempt_not_running: "exam.errFinished",
  time_up: "exam.errTimeUp",
  held_elsewhere: "exam.errElsewhere",
  cannot_abandon: "exam.errCannotAbandon",
};

export class AttemptError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = errorCode(error) ?? "unknown";
    throw new AttemptError(code, error.message);
  }
  return data as T;
}

/** Starts a package, or returns the attempt already running (which may be another package's). */
export function startAttempt(packageId: string): Promise<{ attempt_id: string; resumed: boolean }> {
  return call("start_attempt", { p_package_id: packageId, p_holder: tabHolderId() });
}

export async function getAttempt(attemptId: string): Promise<AttemptState> {
  const raw = await call<Record<string, unknown>>("get_attempt", { p_attempt_id: attemptId, p_holder: tabHolderId() });
  if (raw.status !== "in_progress") return { id: String(raw.id), status: raw.status as "finished" | "abandoned" };
  return {
    id: String(raw.id),
    status: "in_progress",
    mode: raw.mode as PackageMode,
    packageId: String(raw.package_id),
    title: String(raw.title),
    holder: raw.holder_state as RunningAttempt["holder"],
    secondsLeft: raw.seconds_left as number | null,
    answers: (raw.answers ?? {}) as Record<string, AttemptAnswer>,
    flagged: (raw.flagged ?? []) as string[],
    tabLeaves: Number(raw.tab_leaves ?? 0),
    questions: raw.questions ? (raw.questions as QuestionJson[]).map(toQuestion) : null,
  };
}

export function saveAttempt(
  attemptId: string,
  answers: Record<string, AttemptAnswer>,
  flagged: string[],
  tabLeaves: number,
): Promise<void> {
  return call("save_attempt", {
    p_attempt_id: attemptId,
    p_holder: tabHolderId(),
    p_answers: answers,
    p_flagged: flagged,
    p_tab_leaves: tabLeaves,
  });
}

export function takeOverAttempt(attemptId: string): Promise<void> {
  return call("take_over_attempt", { p_attempt_id: attemptId, p_holder: tabHolderId() });
}

export async function submitAttempt(attemptId: string, answers: Record<string, AttemptAnswer>): Promise<void> {
  await call("submit_attempt", { p_attempt_id: attemptId, p_holder: tabHolderId(), p_answers: answers });
  await loadExamRecords().catch(() => undefined);
}

export async function abandonAttempt(attemptId: string): Promise<void> {
  await call("abandon_attempt", { p_attempt_id: attemptId });
  await loadExamRecords().catch(() => undefined);
}

export interface ResultItem {
  questionId: string;
  chosen: number | null;
  text: string | null;
  correct: number | null;
  isCorrect: boolean | null;
  graded: boolean;
}

export interface AttemptResult {
  id: string;
  mode: PackageMode;
  packageId: string;
  title: string;
  score: number | null;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  tabLeaves: number;
  startedAt: string;
  finishedAt: string;
  items: ResultItem[];
  /** Questions edited since this attempt (their revision moved on). */
  changed: Set<string>;
  questions: AttemptQuestion[];
}

export async function getAttemptResult(attemptId: string): Promise<AttemptResult> {
  const raw = await call<Record<string, unknown>>("get_attempt_result", { p_attempt_id: attemptId });
  const questions = (raw.questions as QuestionJson[]).map(toQuestion);
  const revisions = (raw.question_revisions ?? {}) as Record<string, number>;
  const items = ((raw.items ?? []) as Record<string, unknown>[]).map((i) => ({
    questionId: String(i.question_id),
    chosen: (i.chosen as number | null) ?? null,
    text: (i.text as string | null) ?? null,
    correct: (i.correct as number | null) ?? null,
    isCorrect: (i.is_correct as boolean | null) ?? null,
    graded: Boolean(i.graded),
  }));
  return {
    id: String(raw.id),
    mode: raw.mode as PackageMode,
    packageId: String(raw.package_id),
    title: String(raw.title),
    score: raw.score === null ? null : Number(raw.score),
    correctCount: Number(raw.correct_count ?? 0),
    wrongCount: Number(raw.wrong_count ?? 0),
    blankCount: Number(raw.blank_count ?? 0),
    tabLeaves: Number(raw.tab_leaves ?? 0),
    startedAt: String(raw.started_at),
    finishedAt: String(raw.finished_at),
    items,
    changed: new Set(questions.filter((q) => revisions[q.id] !== undefined && revisions[q.id] !== q.revision).map((q) => q.id)),
    questions,
  };
}

/** Whether a typed answer matches one of the accepted answers (case, spacing and accents aside). */
export function matchesAccepted(text: string, accepted: readonly string[]): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = norm(text);
  return t.length > 0 && accepted.some((a) => norm(a) === t);
}
