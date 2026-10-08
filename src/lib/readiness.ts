import { allSubjects } from "./routeMeta";
import { ebookMeta, flashcardDecks, quizBanks } from "./content";
import { examRecords, packagesForBlock } from "./exams";
import { blockSubjectKeys } from "./examPlan";
import { isDue } from "./sm2";
import { readJSON, STORAGE_KEYS } from "./storage";
import type { CardStateMap, ExamAttempt, QuizAttempt } from "../types/content";
import { entry, own } from "./records";

// How ready a student is for a block exam: one number per subject from everything they've done
// (cards, image-occlusion labels, quizzes, reading), and one for the block that also counts
// their timed mock exams. Pure functions over plain numbers, plus readers that gather those
// numbers from storage.

/** A card or label counts as mastered at this review interval. */
export const MASTERED_DAYS = 21;

export interface DeckStats {
  total: number;
  /** Reviewed at least once (the rest are new). */
  seen: number;
  mastered: number;
  /** Reviewed cards due again (new cards aren't counted). */
  due: number;
  /** Average strength, 0–1: a card's interval out of MASTERED_DAYS, capped at 1. */
  strength: number;
}

export interface QuizStats {
  bank: number;
  attempts: QuizAttempt[];
  /** Recent accuracy, 0–1, or null before any attempt. */
  accuracy: number | null;
  /** Questions answered across attempts, as a share of the bank (capped at 1). */
  coverage: number;
  /** Missed questions waiting for a retry. */
  retry: number;
}

export interface ReadingStats {
  chapters: number;
  done: number;
}

export interface SubjectReadiness {
  key: string;
  label: string;
  blockId: string;
  cards?: DeckStats;
  labels?: DeckStats;
  quiz?: QuizStats;
  reading?: ReadingStats;
  /** Each part's score, 0–100. */
  parts: Partial<Record<"cards" | "labels" | "quiz" | "reading", number>>;
  /** 0–100. */
  readiness: number;
}

export interface MockAttempt extends ExamAttempt {
  /** The past paper, or null for the block's pooled exam. */
  paper: string | null;
  percent: number;
}

export interface BlockReadiness {
  blockId: string;
  subjects: SubjectReadiness[];
  mocks: MockAttempt[];
  /** 0–100. */
  readiness: number;
  weakest: SubjectReadiness | null;
}

const WEIGHTS = { cards: 0.35, labels: 0.15, quiz: 0.35, reading: 0.15 } as const;
/** How much the latest mock exams count towards a block's readiness. */
const MOCK_WEIGHT = 0.3;

export function deckStats(ids: readonly string[], states: CardStateMap, now: Date = new Date()): DeckStats {
  let seen = 0;
  let mastered = 0;
  let due = 0;
  let strength = 0;
  for (const id of ids) {
    const s = own(states, id);
    if (s) {
      seen += 1;
      strength += Math.min(1, s.interval / MASTERED_DAYS);
      if (s.interval >= MASTERED_DAYS) mastered += 1;
      if (isDue(s, now)) due += 1;
    }
  }
  return { total: ids.length, seen, mastered, due, strength: ids.length ? strength / ids.length : 0 };
}

export function quizStats(bank: number, attempts: QuizAttempt[], retry: number): QuizStats {
  const recent = attempts.slice(-3);
  const answered = recent.reduce((n, a) => n + a.total, 0);
  const accuracy = answered > 0 ? recent.reduce((n, a) => n + a.score, 0) / answered : null;
  const coverage = bank > 0 ? Math.min(1, attempts.reduce((n, a) => n + a.total, 0) / bank) : 0;
  return { bank, attempts, accuracy, coverage, retry };
}

/** A subject's readiness from whichever parts it has, re-weighted over those. */
export function scoreSubject(parts: Pick<SubjectReadiness, "cards" | "labels" | "quiz" | "reading">): SubjectReadiness["parts"] & { readiness: number } {
  const scores: SubjectReadiness["parts"] = {};
  if (parts.cards && parts.cards.total > 0) scores.cards = parts.cards.strength * 100;
  if (parts.labels && parts.labels.total > 0) scores.labels = parts.labels.strength * 100;
  // A perfect score on one section of a big bank isn't readiness for all of it.
  if (parts.quiz && parts.quiz.bank > 0) scores.quiz = (parts.quiz.accuracy ?? 0) * Math.sqrt(parts.quiz.coverage) * 100;
  if (parts.reading && parts.reading.chapters > 0) scores.reading = (parts.reading.done / parts.reading.chapters) * 100;
  let weight = 0;
  let sum = 0;
  for (const [k, v] of Object.entries(scores) as [keyof typeof WEIGHTS, number][]) {
    const w = entry(WEIGHTS, k);
    weight += w;
    sum += w * v;
  }
  return { ...scores, readiness: weight > 0 ? sum / weight : 0 };
}

/** A block's readiness: its subjects on average, with the latest mock exams counting too. */
export function scoreBlock(subjects: number[], mockPercents: number[]): number {
  const base = subjects.length ? subjects.reduce((a, b) => a + b, 0) / subjects.length : 0;
  const recent = mockPercents.slice(-2);
  if (recent.length === 0) return base;
  const mock = recent.reduce((a, b) => a + b, 0) / recent.length;
  return base * (1 - MOCK_WEIGHT) + mock * MOCK_WEIGHT;
}

/** Image-occlusion label ids per subject; loaded on demand, so callers pass what they have. */
export type OcclusionIds = Partial<Record<string, readonly string[]>>;

export function subjectReadiness(key: string, occlusion: OcclusionIds = {}, now: Date = new Date()): SubjectReadiness {
  const [blockId] = key.split("/");
  const label = allSubjects().find((s) => s.key === key)?.label ?? key;
  const out: Pick<SubjectReadiness, "cards" | "labels" | "quiz" | "reading"> = {};
  const deck = flashcardDecks.get(key);
  if (deck?.length) out.cards = deckStats(deck.map((c) => c.id), readJSON<CardStateMap>(STORAGE_KEYS.cardState(key), {}), now);
  const labels = own(occlusion, key);
  if (labels?.length) out.labels = deckStats(labels, readJSON<CardStateMap>(STORAGE_KEYS.occlusionState(key), {}), now);
  const bank = quizBanks.get(key);
  if (bank?.length) {
    const ids = new Set(bank.map((q) => q.id));
    const retry = readJSON<string[]>(STORAGE_KEYS.quizDue(key), []).filter((id) => ids.has(id)).length;
    out.quiz = quizStats(bank.length, readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(key), []), retry);
  }
  const book = ebookMeta.get(key);
  if (book?.chapters.length) {
    const ids = new Set(book.chapters.map((c) => c.id));
    out.reading = { chapters: book.chapters.length, done: readJSON<string[]>(STORAGE_KEYS.ebookCompleted(key), []).filter((id) => ids.has(id)).length };
  }
  const { readiness, ...parts } = scoreSubject(out);
  return { key, label, blockId, ...out, parts, readiness };
}

/**
 * Every timed exam taken for a block, oldest first: the block's pooled exam (saved as progress)
 * and its past-paper exams (attempts on the server).
 */
export function blockMocks(blockId: string): MockAttempt[] {
  const out: MockAttempt[] = [];
  for (const a of readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(blockId), [])) {
    if (a.total > 0) out.push({ ...a, paper: null, percent: (a.score / a.total) * 100 });
  }
  const papers = new Map(packagesForBlock(blockId).filter((p) => p.mode === "exam").map((p) => [p.id, p]));
  for (const a of examRecords().attempts) {
    const paper = papers.get(a.packageId);
    if (!paper || a.status !== "finished" || a.score === null || !a.finishedAt) continue;
    const total = (a.correctCount ?? 0) + (a.wrongCount ?? 0) + (a.blankCount ?? 0);
    const limitSec = (a.timeLimitMinutes ?? 0) * 60;
    out.push({
      score: a.correctCount ?? 0,
      total,
      date: a.finishedAt,
      missedIds: [],
      timeTakenSec: Math.min(limitSec || Infinity, (Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000),
      timeLimitSec: limitSec,
      paper: paper.title,
      percent: a.score,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function blockReadiness(blockId: string, occlusion: OcclusionIds = {}, now: Date = new Date()): BlockReadiness {
  const subjects = blockSubjectKeys(blockId).map((k) => subjectReadiness(k, occlusion, now));
  const mocks = blockMocks(blockId);
  const readiness = scoreBlock(
    subjects.map((s) => s.readiness),
    mocks.map((m) => m.percent),
  );
  const weakest = subjects.length > 1 ? subjects.reduce((w, s) => (s.readiness < w.readiness ? s : w)) : null;
  return { blockId, subjects, mocks, readiness, weakest };
}

/**
 * Where the mock scores are heading: a straight line through them (by date), read at the exam
 * date. Needs two mocks on different days; clipped to 0–100.
 */
export function projectScore(mocks: Pick<MockAttempt, "date" | "percent">[], examDate: Date): number | null {
  const points = mocks.map((m) => [new Date(m.date).getTime() / 86_400_000, m.percent] as const);
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (sxx < 0.5) return null;
  const slope = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
  const at = examDate.getTime() / 86_400_000;
  return Math.max(0, Math.min(100, my + slope * (at - mx)));
}
