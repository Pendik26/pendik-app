import { englishT, type Translate } from "../i18n/i18n";
import { getActivityDays, getLongestStreak } from "./activity";
import { ebookMeta, flashcardDecks, quizBanks } from "./content";
import { examRecords } from "./exams";
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
    for (const a of readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(block.id), [])) {
      mocks += 1;
      if (a.total > 0) bestMock = Math.max(bestMock, (a.score / a.total) * 100);
    }
  }
  for (const a of examRecords().attempts) {
    if (a.mode !== "exam" || a.status !== "finished") continue;
    mocks += 1;
    if (a.score !== null) bestMock = Math.max(bestMock, a.score);
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

export function milestones(m: MilestoneInput, t: Translate = englishT): Milestone[] {
  const reviews = t("milestone.reviewsDetail");
  const interval = t("milestone.masteredDetail", { days: MASTERED_DAYS });
  return [
    count("first-day", t("milestone.firstDay"), t("milestone.firstDayDetail"), m.studyDays, 1),
    count("streak-7", t("milestone.streak", { days: 7 }), t("milestone.streak7Detail"), m.longestStreak, 7),
    count("streak-30", t("milestone.streak", { days: 30 }), t("milestone.streak30Detail"), m.longestStreak, 30),
    count("reviews-100", t("milestone.reviews100"), reviews, m.reviews, 100),
    count("reviews-1000", t("milestone.reviews1000"), reviews, m.reviews, 1000),
    count("mastered-100", t("milestone.mastered", { count: 100 }), interval, m.mastered, 100),
    count("mastered-500", t("milestone.mastered", { count: 500 }), interval, m.mastered, 500),
    count("quizzes-10", t("milestone.quizzes", { count: 10 }), t("milestone.quizzesDetail"), m.quizzes, 10),
    { id: "perfect", title: t("milestone.perfect"), detail: t("milestone.perfectDetail"), earned: m.perfectQuiz },
    count("first-mock", t("milestone.firstMock"), t("milestone.firstMockDetail"), m.mocks, 1),
    count("mock-70", t("milestone.mock70"), t("milestone.mock70Detail"), Math.round(m.bestMock), 70),
    count("book", t("milestone.book"), t("milestone.bookDetail"), m.booksFinished, 1),
    count("deck", t("milestone.deck"), t("milestone.deckDetail"), m.decksMastered, 1),
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
