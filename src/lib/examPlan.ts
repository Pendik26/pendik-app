import { blockById, studyBlocks } from "./blocks";
import { ebookSubjects, flashcardSubjects, keyOf, quizSubjects } from "./content";
import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

// A block's exam plan: when the exam is, how long the student studies a day, and what score
// they're aiming for. The date comes from the block's official date unless the student sets
// their own (or, from before plans existed, a date they gave one of the block's decks).

export interface ExamPlanSettings {
  /** "YYYY-MM-DD"; overrides the block's official date. */
  date?: string;
  /** Study minutes a day for today's plan. */
  minutes?: number;
  /** Target exam score, in percent. */
  target?: number;
  /** Usual study time ("HH:MM"), for the calendar file. */
  time?: string;
}

export const DEFAULT_MINUTES = 60;
export const DEFAULT_TARGET = 70;
export const DEFAULT_TIME = "19:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readExamPlan(blockId: string): ExamPlanSettings {
  const raw = readJSON<unknown>(STORAGE_KEYS.examPlan(blockId), {});
  return typeof raw === "object" && raw !== null ? (raw as ExamPlanSettings) : {};
}

export function writeExamPlan(blockId: string, patch: ExamPlanSettings): ExamPlanSettings {
  // Cleared settings (undefined or "") are left out rather than stored.
  const next = Object.fromEntries(Object.entries({ ...readExamPlan(blockId), ...patch }).filter(([, v]: [string, unknown]) => v !== undefined && v !== "")) as ExamPlanSettings;
  writeJSON(STORAGE_KEYS.examPlan(blockId), next);
  return next;
}

/** Subjects with study material in a block. */
export function blockSubjectKeys(blockId: string): string[] {
  const keys = new Set<string>();
  for (const s of [...flashcardSubjects, ...quizSubjects, ...ebookSubjects]) if (s.blockId === blockId) keys.add(keyOf(s));
  return [...keys].sort();
}

/** Blocks that have something to study. */
export function plannableBlocks() {
  return studyBlocks.filter((b) => blockSubjectKeys(b.id).length > 0);
}

/** The exam date in force, and where it came from. */
export function examDateFor(blockId: string, plan: ExamPlanSettings = readExamPlan(blockId)): { date: string | null; source: "mine" | "official" | "deck" | null } {
  if (plan.date && DATE_RE.test(plan.date)) return { date: plan.date, source: "mine" };
  const official = blockById(blockId)?.examDate;
  if (official && DATE_RE.test(official)) return { date: official, source: "official" };
  const legacy = blockSubjectKeys(blockId)
    .map((k) => readJSON<string>(STORAGE_KEYS.examDate(k), ""))
    .filter((d) => DATE_RE.test(d))
    .sort();
  if (legacy.length) return { date: legacy[legacy.length - 1], source: "deck" };
  return { date: null, source: null };
}

/** Local midnight of a "YYYY-MM-DD" date. */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export { localDateKey as localDayKey } from "./activity";

/** Whole days from today to the exam (0 on exam day, negative after it). */
export function daysUntil(date: string, today: Date = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDay(date).getTime() - start.getTime()) / 86_400_000);
}

export type Phase = "no-date" | "learn" | "strengthen" | "mock" | "final" | "exam-day" | "past";

/** Days before the exam at which each phase starts. */
export const PHASE_STARTS = { strengthen: 14, mock: 3, final: 1 } as const;

export function phaseFor(daysLeft: number | null): Phase {
  if (daysLeft === null) return "no-date";
  if (daysLeft < 0) return "past";
  if (daysLeft === 0) return "exam-day";
  if (daysLeft <= PHASE_STARTS.final) return "final";
  if (daysLeft <= PHASE_STARTS.mock) return "mock";
  if (daysLeft <= PHASE_STARTS.strengthen) return "strengthen";
  return "learn";
}

export const PHASE_INFO: Record<Phase, { name: string; focus: string }> = {
  "no-date": { name: "No exam date", focus: "Set the exam date to get a plan that changes as it gets closer." },
  learn: { name: "Learn", focus: "Cover new material: new cards, unread chapters, first passes through each quiz." },
  strengthen: { name: "Strengthen", focus: "Go after weak spots: missed questions, cards you keep forgetting, your weakest subject." },
  mock: { name: "Mock exams", focus: "Sit timed past papers, then review what you missed. Keep up with due reviews." },
  final: { name: "Final review", focus: "Light review only: due cards and your summaries. Sleep well; nothing new." },
  "exam-day": { name: "Exam day", focus: "Good luck. A quick look at your summaries at most." },
  past: { name: "Exam over", focus: "This exam has passed. Set the next block's date to keep planning." },
};

/** The phases in order with their date ranges, for the timeline. */
export function phaseTimeline(date: string): { phase: Exclude<Phase, "no-date" | "past" | "exam-day">; from: Date | null; to: Date }[] {
  const exam = parseDay(date);
  const before = (n: number) => new Date(exam.getFullYear(), exam.getMonth(), exam.getDate() - n);
  return [
    { phase: "learn", from: null, to: before(PHASE_STARTS.strengthen + 1) },
    { phase: "strengthen", from: before(PHASE_STARTS.strengthen), to: before(PHASE_STARTS.mock + 1) },
    { phase: "mock", from: before(PHASE_STARTS.mock), to: before(PHASE_STARTS.final + 1) },
    { phase: "final", from: before(PHASE_STARTS.final), to: before(PHASE_STARTS.final) },
  ];
}

/**
 * The block to plan for: the current block if one is set, else the one with the nearest exam
 * still to come, else the first block with material.
 */
export function focusBlockId(): string | null {
  const blocks = plannableBlocks();
  if (blocks.length === 0) return null;
  const current = readJSON<string>(STORAGE_KEYS.currentBlock, "");
  if (blocks.some((b) => b.id === current)) return current;
  const upcoming = blocks
    .map((b) => ({ id: b.id, date: examDateFor(b.id).date }))
    .filter((b): b is { id: string; date: string } => b.date !== null && daysUntil(b.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0]?.id ?? blocks[blocks.length - 1].id;
}

/** "12 days to the exam", "Exam tomorrow"… */
export function countdownText(daysLeft: number | null): string {
  if (daysLeft === null) return "No exam date yet";
  if (daysLeft < 0) return "Exam has passed";
  if (daysLeft === 0) return "Exam today";
  if (daysLeft === 1) return "Exam tomorrow";
  return `${daysLeft} days to the exam`;
}
