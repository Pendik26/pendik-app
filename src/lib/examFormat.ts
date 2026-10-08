/** Target block-exam format: up to 100 questions, paced at 1 minute each. */
export const EXAM_QUESTION_TARGET = 100;
export const SECONDS_PER_QUESTION = 60;

export interface ExamFormat {
  questionCount: number;
  timeLimitSec: number;
}

/** Scales down from the target when a block's pooled question bank is smaller than 100. */
export function buildExamFormat(poolSize: number): ExamFormat {
  const questionCount = Math.min(EXAM_QUESTION_TARGET, poolSize);
  return { questionCount, timeLimitSec: questionCount * SECONDS_PER_QUESTION };
}
