import type { QuizQuestion } from "../types/content";

/** A random order: each item is drawn from the ones left (Fisher–Yates, taking rather than swapping). */
function shuffle<T>(items: T[]): T[] {
  const left = items.slice();
  const out: T[] = [];
  while (left.length > 0) out.push(...left.splice(Math.floor(Math.random() * left.length), 1));
  return out;
}

function shuffleOptions(question: QuizQuestion): QuizQuestion {
  const order = shuffle(question.options.map((_, i) => i));
  return {
    ...question,
    options: order.flatMap((i) => question.options.slice(i, i + 1)),
    answer: order.indexOf(question.answer),
  };
}

/** Fresh per-attempt question and option order, so neither is memorizable across replays. */
export function buildSessionBank(questions: QuizQuestion[]): QuizQuestion[] {
  return shuffle(questions).map(shuffleOptions);
}
