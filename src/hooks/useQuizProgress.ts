import type { Answers, QuizAttempt, QuizQuestion } from "../types/content";
import { STORAGE_KEYS } from "../lib/storage";
import { logStudy, recordActivity } from "../lib/activity";
import { scoreQuiz, updateDueIds } from "../lib/quizScoring";
import { useLocalStorage } from "./useLocalStorage";
import { quizRecords, recordQuiz } from "../lib/studyRecords";

export function useQuizProgress(quizId: string) {
  const [history, setHistory] = useLocalStorage<QuizAttempt[]>(
    STORAGE_KEYS.quizProgress(quizId),
    [],
  );
  const [dueIds, setDueIds] = useLocalStorage<string[]>(
    STORAGE_KEYS.quizDue(quizId),
    [],
  );

  const lastAttempt: QuizAttempt | undefined = history.at(-1);

  const recordAttempt = (
    questions: QuizQuestion[],
    answers: Answers,
  ) => {
    const scored = scoreQuiz(questions, answers);
    const attempt: QuizAttempt = { ...scored, date: new Date().toISOString() };
    setHistory((prev) => [...prev, attempt]);
    setDueIds((prev) => updateDueIds(prev, questions, scored.missedIds));
    recordActivity();
    logStudy(quizId, "questions", scored.total);
    recordQuiz(quizRecords(questions, answers, { deck: quizId }));
    return attempt;
  };

  return { lastAttempt, history, dueIds, recordAttempt };
}
