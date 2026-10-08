import { useMemo } from "react";
import type { CardState, CardStateMap, Flashcard } from "../types/content";
import { INITIAL_CARD_STATE, isDue, reviewCard } from "../lib/sm2";
import { STORAGE_KEYS } from "../lib/storage";
import { logStudy, recordActivity } from "../lib/activity";
import { rankHardestCards } from "../lib/hardestCards";
import { useLocalStorage } from "./useLocalStorage";
import { deleteOwn, own, setOwn } from "../lib/records";

/** `storageKey` defaults to the flashcard deck's key; image occlusion keeps its own. */
export function useSpacedRepetition(deckId: string, cards: Flashcard[], storageKey = STORAGE_KEYS.cardState(deckId)) {
  const [stateMap, setStateMap] = useLocalStorage<CardStateMap>(storageKey, {});

  const stateFor = (cardId: string): CardState =>
    own(stateMap, cardId) ?? INITIAL_CARD_STATE;

  const dueCards = useMemo(
    () => cards.filter((card) => isDue(stateFor(card.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, stateMap],
  );

  const grade = (cardId: string, quality: number) => {
    setStateMap((prev) => {
      const next = { ...prev };
      setOwn(next, cardId, reviewCard(own(prev, cardId) ?? INITIAL_CARD_STATE, quality));
      return next;
    });
    recordActivity();
    logStudy(deckId, storageKey === STORAGE_KEYS.occlusionState(deckId) ? "labels" : "cards");
  };

  /** Puts a card back to an earlier state (undo); undefined makes it new again. */
  const restore = (cardId: string, state: CardState | undefined) => {
    setStateMap((prev) => {
      const next = { ...prev };
      if (state) setOwn(next, cardId, state);
      else deleteOwn(next, cardId);
      return next;
    });
  };

  const stats = useMemo(() => {
    const total = cards.length;
    const seen = cards.filter((c) => stateMap[c.id]).length;
    const mastered = cards.filter(
      (c) => (stateMap[c.id]?.interval ?? 0) >= 21,
    ).length;
    return { total, seen, mastered, due: dueCards.length };
  }, [cards, stateMap, dueCards.length]);

  const hardestCards = useMemo(
    () => rankHardestCards(cards, stateMap, 5),
    [cards, stateMap],
  );

  return { stateMap, stateFor, dueCards, grade, restore, stats, hardestCards };
}
