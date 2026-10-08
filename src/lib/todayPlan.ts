import { getStudyLog, localDateKey, type StudyKind, type StudyLog } from "./activity";
import { ebookMeta, examPackagesByBlock, summaries } from "./content";
import { PHASE_STARTS, type Phase } from "./examPlan";
import type { BlockReadiness, SubjectReadiness } from "./readiness";
import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";
import { drillLink, missedQuestions, weakTopics } from "./weakSpots";
import { EXAM_QUESTION_TARGET, SECONDS_PER_QUESTION } from "./examFormat";
import { entry } from "./records";

// Today's plan: a short list of what to study today, sized to the minutes the student has,
// built from what's due, what's left to learn and the days left before the exam. It's drawn up
// once a day (so its targets don't shift as work gets done) and ticks itself off from the
// study log. Because quotas come from what's left over the days left, a missed day spreads
// over the days that remain.

export type PlanKind = StudyKind | "summary";

export interface PlanItem {
  id: string;
  kind: PlanKind;
  /** Subject key, or "block:{id}" for a mock exam. */
  subject: string;
  title: string;
  detail: string;
  /** How many to do (cards, questions, chapters…). */
  target: number;
  minutes: number;
  to: string;
}

export interface TodayPlan {
  /** Local "YYYY-MM-DD". */
  date: string;
  blockId: string;
  phase: Phase;
  budget: number;
  items: PlanItem[];
  /** Due reviews that didn't fit the minutes. */
  overflow: number;
}

/** Minutes per unit of each kind of work. */
export const MINUTES_PER = { cards: 0.4, labels: 0.35, questions: 0.75, chapters: 20, exams: (EXAM_QUESTION_TARGET * SECONDS_PER_QUESTION) / 60, summary: 10 } as const;

const QUIZ_SITTING = 25;
const NEW_CARDS_CAP = 30;
const NEW_LABELS_CAP = 20;
/** New material per day when there's no exam date to spread it over. */
const NO_DATE_NEW_CARDS = 15;
const NO_DATE_NEW_LABELS = 10;

const minutesPer = (kind: PlanKind): number => entry(MINUTES_PER, kind);

const minutesFor = (kind: PlanKind, n: number) => Math.max(1, Math.round(minutesPer(kind) * n));

/** Units of `kind` that fit in `minutes`. */
const fits = (kind: PlanKind, minutes: number) => Math.floor(minutes / minutesPer(kind));

/** New material per day so it's all seen before the strengthen phase (or the mock phase, if already past it). */
function newQuota(unseen: number, daysLeft: number | null, phase: Phase, noDate: number, cap: number): number {
  if (unseen <= 0) return 0;
  if (daysLeft === null) return Math.min(unseen, noDate);
  const until = phase === "learn" ? daysLeft - PHASE_STARTS.strengthen : daysLeft - PHASE_STARTS.mock;
  return Math.min(cap, unseen, Math.ceil(unseen / Math.max(1, until)));
}

interface Candidate extends Omit<PlanItem, "minutes"> {
  /** Lower comes first. */
  priority: number;
  /** Must-do reviews: kept even when they don't all fit. */
  review?: boolean;
  /** Smallest worthwhile amount when trimmed to fit. */
  min?: number;
}

const short = (s: SubjectReadiness) => s.label;

function candidates(br: BlockReadiness, phase: Phase, daysLeft: number | null): Candidate[] {
  const out: Candidate[] = [];
  const subjects = [...br.subjects].sort((a, b) => a.readiness - b.readiness);
  const weakest = subjects.at(0);

  if (phase === "exam-day" || phase === "past") {
    for (const s of subjects) {
      if (summaries.has(s.key)) out.push({ id: `summary:${s.key}`, kind: "summary", subject: s.key, title: `Skim the ${short(s)} summary`, detail: "Calm, quick look", target: 1, to: `/summaries/${s.key}`, priority: 1 });
    }
    return phase === "exam-day" ? out.slice(0, 2) : [];
  }

  // Due reviews come first in every phase.
  for (const s of subjects) {
    if (s.cards?.due) out.push({ id: `due-cards:${s.key}`, kind: "cards", subject: s.key, title: `Review ${s.cards.due} ${short(s)} cards`, detail: "Due today", target: s.cards.due, to: `/flashcards/${s.key}`, priority: 0, review: true, min: 5 });
    if (s.labels?.due) out.push({ id: `due-labels:${s.key}`, kind: "labels", subject: s.key, title: `Review ${s.labels.due} ${short(s)} labels`, detail: "Image occlusion, due today", target: s.labels.due, to: `/occlusion/${s.key}`, priority: 0, review: true, min: 5 });
    if (s.quiz?.retry) out.push({ id: `retry:${s.key}`, kind: "questions", subject: s.key, title: `Retry ${s.quiz.retry} missed ${short(s)} questions`, detail: "Missed last time", target: s.quiz.retry, to: `/quizzes/${s.key}?practice=due`, priority: 1, review: true, min: 5 });
  }

  if (phase === "final") {
    if (weakest && summaries.has(weakest.key)) out.push({ id: `summary:${weakest.key}`, kind: "summary", subject: weakest.key, title: `Read the ${short(weakest)} summary`, detail: "Weakest subject; light review", target: 1, to: `/summaries/${weakest.key}`, priority: 2 });
    return out;
  }

  if (phase === "mock") {
    const papers = examPackagesByBlock.get(br.blockId) ?? [];
    const taken = new Set(br.mocks.map((m) => m.paper));
    const next = papers.find((p) => !taken.has(p.name));
    out.push({
      id: `mock:${br.blockId}`,
      kind: "exams",
      subject: `block:${br.blockId}`,
      title: next ? `Sit a timed mock: ${next.name}` : "Sit a timed mock exam",
      detail: "Then review every miss",
      target: 1,
      to: next ? `/exam/${br.blockId}/${next.id}` : `/exam/${br.blockId}`,
      priority: 0.5,
      // A mock is the point of this phase: it gets its slot even past the minutes.
      review: true,
    });
  }

  // Weak spots, from the strengthen phase on.
  if (phase === "strengthen" || phase === "mock") {
    const topic = subjects.flatMap((s) => weakTopics(s.key).slice(0, 1)).sort((a, b) => b.weak - a.weak).at(0);
    if (topic) {
      const label = br.subjects.find((s) => s.key === topic.subject)?.label ?? "";
      out.push({ id: `topic:${topic.subject}:${topic.tag}`, kind: "cards", subject: topic.subject, title: `Drill "${topic.tag}" (${label})`, detail: `${topic.weak} cards you keep forgetting`, target: topic.total, to: topic.to, priority: 2, min: 5 });
    }
    for (const s of subjects.slice(0, 2)) {
      const missed = missedQuestions(s.key).slice(0, 15);
      if (missed.length >= 3) out.push({ id: `drill:${s.key}`, kind: "questions", subject: s.key, title: `Drill ${missed.length} most-missed ${short(s)} questions`, detail: "Your most-missed questions", target: missed.length, to: drillLink(s.key, missed.map((q) => q.id)), priority: 2.5, min: 5 });
    }
  }

  // New material: everyone's due some until the mock phase.
  if (phase === "learn" || phase === "strengthen" || phase === "no-date") {
    for (const s of subjects) {
      const cardsNew = s.cards ? newQuota(s.cards.total - s.cards.seen, daysLeft, phase, NO_DATE_NEW_CARDS, NEW_CARDS_CAP) : 0;
      if (cardsNew && s.cards) out.push({ id: `new-cards:${s.key}`, kind: "cards", subject: s.key, title: `Learn ${cardsNew} new ${short(s)} cards`, detail: `${s.cards.total - s.cards.seen} not seen yet`, target: cardsNew, to: `/flashcards/${s.key}`, priority: phase === "learn" ? 2 : 3, min: 5 });
      const labelsNew = s.labels ? newQuota(s.labels.total - s.labels.seen, daysLeft, phase, NO_DATE_NEW_LABELS, NEW_LABELS_CAP) : 0;
      if (labelsNew) out.push({ id: `new-labels:${s.key}`, kind: "labels", subject: s.key, title: `Learn ${labelsNew} new ${short(s)} labels`, detail: "Image occlusion", target: labelsNew, to: `/occlusion/${s.key}`, priority: phase === "learn" ? 2.2 : 3.2, min: 5 });
    }
    // One unread chapter, from the subject with the least read.
    const reader = subjects.filter((s) => s.reading && s.reading.done < s.reading.chapters).sort((a, b) => (a.reading?.done ?? 0) / (a.reading?.chapters || 1) - (b.reading?.done ?? 0) / (b.reading?.chapters || 1)).at(0);
    if (reader && phase !== "strengthen") {
      const done = new Set(readJSON<string[]>(STORAGE_KEYS.ebookCompleted(reader.key), []));
      const chapter = ebookMeta.get(reader.key)?.chapters.find((c) => !done.has(c.id));
      if (chapter) out.push({ id: `chapter:${reader.key}:${chapter.id}`, kind: "chapters", subject: reader.key, title: `Read "${chapter.title}"`, detail: `${short(reader)} ebook; mark it finished at the end`, target: 1, to: `/ebooks/${reader.key}/${chapter.id}`, priority: 2.5 });
    }
    // A quiz sitting in the subject whose quiz is least covered (or weakest).
    const quizzer = subjects.filter((s) => s.quiz).sort((a, b) => (phase === "learn" ? (a.quiz?.coverage ?? 0) - (b.quiz?.coverage ?? 0) : (a.parts.quiz ?? 0) - (b.parts.quiz ?? 0))).at(0);
    if (quizzer?.quiz) out.push({ id: `quiz:${quizzer.key}`, kind: "questions", subject: quizzer.key, title: `Quiz: ${Math.min(QUIZ_SITTING, quizzer.quiz.bank)} ${short(quizzer)} questions`, detail: phase === "learn" ? "A first pass through the bank" : "Weakest quiz subject", target: Math.min(QUIZ_SITTING, quizzer.quiz.bank), to: `/quizzes/${quizzer.key}`, priority: 3, min: 10 });
  }
  return out;
}

/** Fits the candidates into the minutes: reviews first, then the rest by priority, trimming the last to fit. */
export function buildTodayPlan(br: BlockReadiness, phase: Phase, daysLeft: number | null, budget: number, today: Date = new Date()): TodayPlan {
  const list = candidates(br, phase, daysLeft).sort((a, b) => a.priority - b.priority);
  let left = budget;
  let overflow = 0;
  const items: PlanItem[] = [];
  for (const c of list) {
    const need = minutesFor(c.kind, c.target);
    let target = c.target;
    if (need > left) {
      const n = fits(c.kind, left);
      if (c.review) {
        // Reviews always get a slot; what doesn't fit is reported, not dropped silently.
        const keep = Math.max(c.min ?? 1, n);
        overflow += Math.max(0, c.target - keep);
        target = Math.min(c.target, keep);
      } else if (n >= (c.min ?? c.target) && c.kind !== "exams" && c.kind !== "chapters" && c.kind !== "summary") {
        target = n;
      } else {
        continue;
      }
    }
    const { priority: _p, review: _r, min: _m, ...item } = c;
    const minutes = minutesFor(c.kind, target);
    items.push({ ...item, target, minutes, title: target === c.target ? c.title : retitle(c.title, c.target, target) });
    left -= minutes;
    if (left <= 0) break;
  }
  return { date: localDateKey(today), blockId: br.blockId, phase, budget, items, overflow };
}

/** "Review 40 anatomy cards" trimmed to 25 → "Review 25 anatomy cards". */
function retitle(title: string, from: number, to: number): string {
  return title.replace(String(from), String(to));
}

/**
 * Today's plan for a block: the one drawn up earlier today if it's for the same block and
 * minutes, else a fresh one (saved for the rest of the day).
 */
export function todayPlanFor(br: BlockReadiness, phase: Phase, daysLeft: number | null, budget: number, { rebuild = false, today = new Date() } = {}): TodayPlan {
  const saved = readJSON<TodayPlan | null>(STORAGE_KEYS.todayPlan, null);
  if (!rebuild && saved && saved.date === localDateKey(today) && saved.blockId === br.blockId && saved.budget === budget && Array.isArray(saved.items)) return saved;
  const plan = buildTodayPlan(br, phase, daysLeft, budget, today);
  writeJSON(STORAGE_KEYS.todayPlan, plan);
  return plan;
}

/**
 * How much of each item is done today, from the study log. Items sharing a subject and kind
 * share its count in order (ten cards reviewed fill the first cards item before the next).
 */
export function planProgress(plan: TodayPlan, log: StudyLog = getStudyLog()): Record<string, number> {
  const day = log.days[plan.date] ?? {};
  const pool = new Map<string, number>();
  const out: Record<string, number> = {};
  for (const item of plan.items) {
    if (item.kind === "summary") {
      const read = readJSON<string>(STORAGE_KEYS.lastRead(item.subject), "");
      out[item.id] = read && localDateKey(new Date(read)) === plan.date ? 1 : 0;
      continue;
    }
    const k = `${item.subject}|${item.kind}`;
    if (!pool.has(k)) pool.set(k, Number(day[item.subject]?.[item.kind]) || 0);
    const have = pool.get(k) ?? 0;
    const done = Math.min(item.target, have);
    pool.set(k, have - done);
    out[item.id] = done;
  }
  return out;
}

/** Where today's plan stands: the next unfinished item, how many are done, and the minutes left. */
export interface PlanStatus {
  next: PlanItem | null;
  done: number;
  total: number;
  minutesLeft: number;
}

/**
 * The first unfinished item of today's plan (skipping any that lead to `exceptPath`, the page
 * the student is already on), with the day's tally.
 */
export function planStatus(plan: TodayPlan, progress: Record<string, number>, exceptPath?: string): PlanStatus {
  let done = 0;
  let minutesLeft = 0;
  let next: PlanItem | null = null;
  for (const item of plan.items) {
    const have = Math.min(item.target, progress[item.id] ?? 0);
    if (have >= item.target) {
      done++;
      continue;
    }
    minutesLeft += item.minutes * (1 - have / item.target);
    if (!next && item.to.split("?")[0] !== exceptPath) next = item;
  }
  return { next, done, total: plan.items.length, minutesLeft: Math.round(minutesLeft) };
}

/** Today's unfinished items from the plan as drawn up this morning (none if not drawn up today). */
export function unfinishedToday(limit = 3, log: StudyLog = getStudyLog()): PlanItem[] {
  const saved = readJSON<TodayPlan | null>(STORAGE_KEYS.todayPlan, null);
  if (!saved || saved.date !== localDateKey(new Date()) || !Array.isArray(saved.items)) return [];
  const progress = planProgress(saved, log);
  return saved.items.filter((i) => (progress[i.id] ?? 0) < i.target).slice(0, limit);
}
