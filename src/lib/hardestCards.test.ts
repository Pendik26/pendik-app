import { describe, expect, it } from "vitest";
import { rankGlobalHardestCards, rankHardestCards } from "./hardestCards";
import type { CardStateMap, Flashcard } from "../types/content";

function card(id: string): Flashcard {
  return { id, front: `front-${id}`, back: `back-${id}`, tags: [] };
}

function stateWith(lapses: number, easeFactor = 2.5) {
  return { interval: 1, easeFactor, dueDate: "2024-01-01T00:00:00.000Z", reps: 1, lapses };
}

describe("rankHardestCards", () => {
  const cards = [card("a"), card("b"), card("c")];

  it("excludes cards with zero lapses", () => {
    const stateMap: CardStateMap = { a: stateWith(0) };
    expect(rankHardestCards(cards, stateMap)).toEqual([]);
  });

  it("orders by lapse count, most first", () => {
    const stateMap: CardStateMap = { a: stateWith(1), b: stateWith(3), c: stateWith(2) };
    const ranked = rankHardestCards(cards, stateMap).map((r) => r.card.id);
    expect(ranked).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by lower ease factor (harder card) first", () => {
    const stateMap: CardStateMap = { a: stateWith(2, 2.8), b: stateWith(2, 1.5) };
    const ranked = rankHardestCards([card("a"), card("b")], stateMap).map((r) => r.card.id);
    expect(ranked).toEqual(["b", "a"]);
  });

  it("respects the limit", () => {
    const stateMap: CardStateMap = { a: stateWith(1), b: stateWith(2), c: stateWith(3) };
    expect(rankHardestCards(cards, stateMap, 2)).toHaveLength(2);
  });
});

describe("rankGlobalHardestCards", () => {
  it("merges and ranks across subjects", () => {
    const subjects = [
      {
        id: "cardio",
        label: "Cardiology",
        deck: [card("c1")],
        stateMap: { c1: stateWith(5) } as CardStateMap,
      },
      {
        id: "pharm",
        label: "Pharmacology",
        deck: [card("p1")],
        stateMap: { p1: stateWith(2) } as CardStateMap,
      },
    ];
    const result = rankGlobalHardestCards(subjects);
    expect(result.map((r) => r.card.id)).toEqual(["c1", "p1"]);
    expect(result[0].subjectLabel).toBe("Cardiology");
  });

  it("respects the overall limit across all subjects combined", () => {
    const subjects = [
      {
        id: "a",
        label: "A",
        deck: [card("1"), card("2"), card("3")],
        stateMap: { "1": stateWith(3), "2": stateWith(2), "3": stateWith(1) } as CardStateMap,
      },
    ];
    expect(rankGlobalHardestCards(subjects, 2)).toHaveLength(2);
  });
});
