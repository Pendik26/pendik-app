import type { CardStateMap, Flashcard } from "../types/content";

export interface RankedCard {
  card: Flashcard;
  lapses: number;
}

/** Cards with at least one lapse, ranked hardest-first (ties broken by lower ease factor). */
export function rankHardestCards(
  cards: Flashcard[],
  stateMap: CardStateMap,
  limit = 5,
): RankedCard[] {
  return cards
    .map((card) => ({
      card,
      lapses: stateMap[card.id]?.lapses ?? 0,
      easeFactor: stateMap[card.id]?.easeFactor ?? 2.5,
    }))
    .filter((c) => c.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses || a.easeFactor - b.easeFactor)
    .slice(0, limit)
    .map(({ card, lapses }) => ({ card, lapses }));
}

export interface GlobalRankedCard extends RankedCard {
  subjectId: string;
  subjectLabel: string;
}

export interface SubjectDeck {
  id: string;
  label: string;
  deck: Flashcard[];
  stateMap: CardStateMap;
}

/** Ranks the hardest cards across every subject's deck, most-lapsed first. */
export function rankGlobalHardestCards(subjects: SubjectDeck[], limit = 8): GlobalRankedCard[] {
  return subjects
    .flatMap(({ id, label, deck, stateMap }) =>
      rankHardestCards(deck, stateMap, Infinity).map((ranked) => ({
        ...ranked,
        subjectId: id,
        subjectLabel: label,
      })),
    )
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit);
}
