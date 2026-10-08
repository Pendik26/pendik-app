import { flashcardDecks, flashcardSubjects, keyOf, quizSubjects } from "./content";
import { INITIAL_CARD_STATE, isDue } from "./sm2";
import { readJSON, STORAGE_KEYS } from "./storage";
import type { CardStateMap } from "../types/content";

/**
 * Flashcards due now, across every deck. Without `includeNew`, only reviews: cards already
 * studied whose interval is up (a never-opened deck isn't "due").
 */
export function totalCardsDue({ includeNew = false, now = new Date() }: { includeNew?: boolean; now?: Date } = {}): number {
  return flashcardSubjects.reduce((sum, s) => {
    const deck = flashcardDecks.get(keyOf(s)) ?? [];
    const states = readJSON<CardStateMap>(STORAGE_KEYS.cardState(keyOf(s)), {});
    return (
      sum +
      deck.filter((c) => {
        const state = states[c.id];
        return state ? isDue(state, now) : includeNew && isDue(INITIAL_CARD_STATE, now);
      }).length
    );
  }, 0);
}

/** Quiz questions missed before and due again, across every bank. */
export function totalQuizDue(): number {
  return quizSubjects.reduce((sum, s) => sum + readJSON<string[]>(STORAGE_KEYS.quizDue(keyOf(s)), []).length, 0);
}
