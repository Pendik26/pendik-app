import type { Answers, ExamAttempt, QuizQuestion } from "../types/content";
import { STORAGE_KEYS } from "../lib/storage";
import { logStudy, recordActivity } from "../lib/activity";
import { scoreQuiz } from "../lib/quizScoring";
import { useLocalStorage } from "./useLocalStorage";
import { quizRecords, recordQuiz } from "../lib/studyRecords";

export function useExamHistory(subjectId: string) {
  const [history, setHistory] = useLocalStorage<ExamAttempt[]>(
    STORAGE_KEYS.examHistory(subjectId),
    [],
  );

  const lastAttempt: ExamAttempt | undefined = history.at(-1);

  const recordAttempt = (
    questions: QuizQuestion[],
    answers: Answers,
    timeTakenSec: number,
    timeLimitSec: number,
  ) => {
    const scored = scoreQuiz(questions, answers);
    const attempt: ExamAttempt = {
      ...scored,
      date: new Date().toISOString(),
      timeTakenSec,
      timeLimitSec,
    };
    setHistory((prev) => [...prev, attempt]);
    recordActivity();
    // subjectId is the block id, or "{blockId}/{packageId}" for one past paper.
    const blockId = subjectId.split("/")[0];
    const block = `block:${blockId}`;
    logStudy(block, "exams");
    logStudy(block, "questions", scored.total);
    recordQuiz(quizRecords(questions, answers, { blockId }));
    return attempt;
  };

  return { lastAttempt, history, recordAttempt };
}
