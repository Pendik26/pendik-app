import type { CardState } from "../types/content";

/**
 * SM-2 spaced-repetition algorithm (SuperMemo 2).
 * quality: 0-5 self-graded recall quality (0 = total blackout, 5 = perfect recall).
 */
export const INITIAL_CARD_STATE: CardState = {
  interval: 0,
  easeFactor: 2.5,
  dueDate: new Date().toISOString(),
  reps: 0,
  lapses: 0,
};

const MIN_EASE_FACTOR = 1.3;

export function reviewCard(prev: CardState, quality: number): CardState {
  const q = Math.max(0, Math.min(5, quality));
  const now = new Date();

  if (q < 3) {
    // Failed recall: reset repetitions, review again tomorrow.
    return {
      interval: 1,
      easeFactor: prev.easeFactor,
      dueDate: addDays(now, 1).toISOString(),
      reps: 0,
      lapses: prev.lapses + 1,
    };
  }

  const reps = prev.reps + 1;
  let interval: number;
  if (reps === 1) {
    interval = 1;
  } else if (reps === 2) {
    interval = 6;
  } else {
    interval = Math.round(prev.interval * prev.easeFactor);
  }

  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    prev.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  return {
    interval,
    easeFactor,
    dueDate: addDays(now, interval).toISOString(),
    reps,
    lapses: prev.lapses,
  };
}

export function isDue(state: CardState, at: Date = new Date()): boolean {
  return new Date(state.dueDate).getTime() <= at.getTime();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
