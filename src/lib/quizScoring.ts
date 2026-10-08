import type { Answers, QuizQuestion } from "../types/content";

export interface QuizScore {
  score: number;
  total: number;
  missedIds: string[];
}

/** Scores a set of answers against a question bank. Unanswered questions count as missed. */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Answers,
): QuizScore {
  const missedIds = questions
    .filter((q) => answers[q.id] !== q.answer)
    .map((q) => q.id);
  return {
    score: questions.length - missedIds.length,
    total: questions.length,
    missedIds,
  };
}

/**
 * Cross-attempt "due for review" queue: a question that's missed joins the queue and stays
 * there until it's answered correctly, at which point it graduates back out.
 */
export function updateDueIds(
  prevDueIds: string[],
  questions: QuizQuestion[],
  missedIds: string[],
): string[] {
  const missedSet = new Set(missedIds);
  const attemptedIds = new Set(questions.map((q) => q.id));
  const stillDue = prevDueIds.filter((id) => !attemptedIds.has(id) || missedSet.has(id));
  const stillDueSet = new Set(stillDue);
  const newlyMissed = missedIds.filter((id) => !stillDueSet.has(id));
  return [...stillDue, ...newlyMissed];
}
