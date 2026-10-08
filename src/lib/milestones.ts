import { getActivityDays, getLongestStreak } from "./activity";
import { ebookMeta, examPackagesByBlock, flashcardDecks, quizBanks } from "./content";
import { studyBlocks } from "./blocks";
import { readJSON, STORAGE_KEYS } from "./storage";
import { MASTERED_DAYS } from "./readiness";
import type { CardStateMap, ExamAttempt, QuizAttempt } from "../types/content";

// Quiet milestones: a few things worth noticing along the way, and the next one to earn.

export interface Milestone {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
  /** Progress towards it, for the next one to earn. */
  progress?: { have: number; need: number };
}

export interface MilestoneInput {
  studyDays: number;
  longestStreak: number;
  reviews: number;
  mastered: number;
  quizzes: number;
  perfectQuiz: boolean;
  mocks: number;
  bestMock: number;
  booksFinished: number;
  decksMastered: number;
}

export function gatherMilestoneInput(): MilestoneInput {
  const days = getActivityDays();
  let reviews = 0;
  let mastered = 0;
  let decksMastered = 0;
  for (const [key, deck] of flashcardDecks) {
    const states = readJSON<CardStateMap>(STORAGE_KEYS.cardState(key), {});
    let deckMastered = 0;
    for (const card of deck) {
      const s = states[card.id];
      if (!s) continue;
      reviews += s.reps + s.lapses;
      if (s.interval >= MASTERED_DAYS) deckMastered += 1;
    }
    mastered += deckMastered;
    if (deck.length > 0 && deckMastered === deck.length) decksMastered += 1;
  }
  let quizzes = 0;
  let perfectQuiz = false;
  for (const key of [...quizBanks.keys()]) {
    const attempts = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(key), []);
    quizzes += attempts.length;
    if (attempts.some((a) => a.total >= 10 && a.score === a.total)) perfectQuiz = true;
  }
  let mocks = 0;
  let bestMock = 0;
  for (const block of studyBlocks) {
    for (const id of [block.id, ...(examPackagesByBlock.get(block.id) ?? []).map((p) => `${block.id}/${p.id}`)]) {
      for (const a of readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(id), [])) {
        mocks += 1;
        if (a.total > 0) bestMock = Math.max(bestMock, (a.score / a.total) * 100);
      }
    }
  }
  let booksFinished = 0;
  for (const [key, meta] of ebookMeta) {
    if (meta.chapters.length === 0) continue;
    const done = new Set(readJSON<string[]>(STORAGE_KEYS.ebookCompleted(key), []));
    if (meta.chapters.every((c) => done.has(c.id))) booksFinished += 1;
  }
  return { studyDays: days.length, longestStreak: getLongestStreak(days), reviews, mastered, quizzes, perfectQuiz, mocks, bestMock, booksFinished, decksMastered };
}

const count = (id: string, title: string, detail: string, have: number, need: number): Milestone => ({ id, title, detail, earned: have >= need, progress: { have: Math.min(have, need), need } });

export function milestones(m: MilestoneInput): Milestone[] {
  return [
    count("first-day", "First study day", "You started", m.studyDays, 1),
    count("streak-7", "7-day streak", "Seven days in a row", m.longestStreak, 7),
    count("streak-30", "30-day streak", "A month without a gap", m.longestStreak, 30),
    count("reviews-100", "100 reviews", "Flashcard reviews", m.reviews, 100),
    count("reviews-1000", "1,000 reviews", "Flashcard reviews", m.reviews, 1000),
    count("mastered-100", "100 cards mastered", `Cards on a ${MASTERED_DAYS}-day interval`, m.mastered, 100),
    count("mastered-500", "500 cards mastered", `Cards on a ${MASTERED_DAYS}-day interval`, m.mastered, 500),
    count("quizzes-10", "10 quizzes", "Quiz attempts", m.quizzes, 10),
    { id: "perfect", title: "Perfect quiz", detail: "Every question right (10 or more)", earned: m.perfectQuiz },
    count("first-mock", "First mock exam", "A timed exam, start to finish", m.mocks, 1),
    count("mock-70", "Mock score 70%+", "On a timed exam", Math.round(m.bestMock), 70),
    count("book", "Finished an ebook", "Every chapter marked done", m.booksFinished, 1),
    count("deck", "Mastered a deck", "Every card in a deck mastered", m.decksMastered, 1),
  ];
}

/** The unearned milestone closest to done. */
export function nextMilestone(list: Milestone[]): Milestone | null {
  const open = list.filter((m) => !m.earned && m.progress);
  if (open.length === 0) return null;
  return open.reduce((best, m) => {
    const progress = m.progress;
    const bestProgress = best.progress;
    if (!progress || !bestProgress) return best;
    return progress.have / progress.need > bestProgress.have / bestProgress.need ? m : best;
  });
}
