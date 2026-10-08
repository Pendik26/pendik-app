import { flashcardDecks, quizBanks } from "./content";
import { readJSON, STORAGE_KEYS } from "./storage";
import { MASTERED_DAYS } from "./readiness";
import type { CardStateMap, QuizAttempt } from "../types/content";

// Weak spots by name: the flashcard topics with the most cards still being forgotten, the quiz
// questions missed most often, and the image-occlusion labels that keep slipping. Each comes
// with where to drill exactly those.

export interface WeakTopic {
  subject: string;
  tag: string;
  /** Cards in the topic that have lapsed and aren't mastered yet. */
  weak: number;
  total: number;
  lapses: number;
  to: string;
}

export interface MissedQuestion {
  subject: string;
  id: string;
  question: string;
  misses: number;
}

export interface WeakLabel {
  subject: string;
  id: string;
  lapses: number;
}

export interface WeakSpots {
  topics: WeakTopic[];
  questions: MissedQuestion[];
  /** Link that drills the most-missed questions of each subject. */
  questionDrills: { subject: string; to: string; count: number }[];
  labels: WeakLabel[];
}

const struggling = (s: { lapses?: number; interval?: number } | undefined) => !!s && (s.lapses ?? 0) > 0 && (s.interval ?? 0) < MASTERED_DAYS;

export function weakTopics(subject: string, states: CardStateMap = readJSON<CardStateMap>(STORAGE_KEYS.cardState(subject), {})): WeakTopic[] {
  const byTag = new Map<string, WeakTopic>();
  for (const card of flashcardDecks.get(subject) ?? []) {
    for (const tag of card.tags) {
      const t = byTag.get(tag) ?? { subject, tag, weak: 0, total: 0, lapses: 0, to: `/flashcards/${subject}?tag=${encodeURIComponent(tag)}` };
      t.total += 1;
      const s = states[card.id];
      if (struggling(s)) {
        t.weak += 1;
        t.lapses += s?.lapses ?? 0;
      }
      byTag.set(tag, t);
    }
  }
  return [...byTag.values()].filter((t) => t.weak > 0).sort((a, b) => b.weak - a.weak || b.lapses - a.lapses);
}

export function missedQuestions(subject: string, attempts: QuizAttempt[] = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(subject), [])): MissedQuestion[] {
  const bank = new Map((quizBanks.get(subject) ?? []).map((q) => [q.id, q.question]));
  const counts = new Map<string, number>();
  for (const a of attempts) for (const id of a.missedIds) if (bank.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, misses]) => {
      const question = bank.get(id);
      return question ? { subject, id, question, misses } : null;
    })
    .filter((item): item is MissedQuestion => item !== null)
    .sort((a, b) => b.misses - a.misses);
}

export function weakLabels(subject: string, states: CardStateMap = readJSON<CardStateMap>(STORAGE_KEYS.occlusionState(subject), {})): WeakLabel[] {
  return Object.entries(states)
    .filter(([, s]) => struggling(s))
    .map(([id, s]) => ({ subject, id, lapses: s?.lapses ?? 0 }))
    .sort((a, b) => b.lapses - a.lapses);
}

/** Quiz link that starts a drill of just these questions. */
export function drillLink(subject: string, ids: string[]): string {
  return `/quizzes/${subject}?drill=${ids.map(encodeURIComponent).join(",")}`;
}

/** The weak spots across some subjects, strongest signal first. */
export function weakSpots(subjects: string[], limit = 6): WeakSpots {
  const topics = subjects.flatMap((s) => weakTopics(s)).sort((a, b) => b.weak - a.weak || b.lapses - a.lapses);
  const perSubject = subjects.map((s) => missedQuestions(s));
  const questions = perSubject.flat().sort((a, b) => b.misses - a.misses);
  const questionDrills = perSubject
    .filter((list) => list.length > 0)
    .map((list) => {
      const top = list.slice(0, 15);
      return { subject: list[0].subject, to: drillLink(list[0].subject, top.map((q) => q.id)), count: top.length };
    });
  const labels = subjects.flatMap((s) => weakLabels(s)).sort((a, b) => b.lapses - a.lapses);
  return { topics: topics.slice(0, limit), questions: questions.slice(0, limit), questionDrills, labels: labels.slice(0, limit * 2) };
}
