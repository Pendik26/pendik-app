import { describe, expect, it } from "vitest";
import { isSyncableKey, mergeEntry } from "./syncMerge";

const card = (reps: number, dueDate: string) => ({ interval: 1, easeFactor: 2.5, dueDate, reps, lapses: 0 });

describe("isSyncableKey", () => {
  it("syncs progress keys and skips device-only ones", () => {
    expect(isSyncableKey("medicine:flashcards:1.1/physiology")).toBe(true);
    expect(isSyncableKey("medicine:activity")).toBe(true);
    expect(isSyncableKey("medicine:theme")).toBe(false);
    expect(isSyncableKey("medicine:sidebarcollapsed")).toBe(false);
    expect(isSyncableKey("medicine:quizinprogress:1.1/histology")).toBe(false);
    expect(isSyncableKey("medicine:sync:state")).toBe(false);
    expect(isSyncableKey("other:thing")).toBe(false);
    expect(isSyncableKey("medicine:flashcards:bad key!")).toBe(false);
  });
});

describe("mergeEntry", () => {
  it("keeps flashcard reviews from both devices, preferring the more-reviewed copy of a card", () => {
    const key = "medicine:flashcards:1.2/anatomy";
    const merged = mergeEntry(
      { key, value: { a: card(3, "2026-10-01"), b: card(1, "2026-09-27") }, updatedAt: 200 },
      { key, value: { a: card(2, "2026-10-05"), c: card(1, "2026-09-28") }, updatedAt: 100 },
    );
    expect(merged.value).toEqual({ a: card(3, "2026-10-01"), b: card(1, "2026-09-27"), c: card(1, "2026-09-28") });
    expect(merged.updatedAt).toBe(200);
  });

  it("treats ids like __proto__ from another device as ordinary keys", () => {
    const key = "medicine:flashcards:1.2/anatomy";
    const merged = mergeEntry(
      { key, value: { a: card(1, "2026-10-01") }, updatedAt: 100 },
      { key, value: JSON.parse(`{"__proto__": ${JSON.stringify(card(2, "2026-10-02"))}}`) as unknown, updatedAt: 200 },
    );
    const value = merged.value as object;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value).sort()).toEqual(["__proto__", "a"]);

    const counts = mergeEntry(
      { key: "medicine:studylog", value: { days: {} }, updatedAt: 100 },
      { key: "medicine:studylog", value: JSON.parse('{"days": {"__proto__": {"polluted": 1}}}') as unknown, updatedAt: 200 },
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf((counts.value as { days: object }).days)).toBe(Object.prototype);
  });

  it("unions quiz attempts without duplicates, oldest first", () => {
    const key = "medicine:quiz:1.1/histology";
    const x = { score: 7, total: 10, date: "2026-09-01T00:00:00Z", missedIds: [] };
    const y = { score: 9, total: 10, date: "2026-09-03T00:00:00Z", missedIds: [] };
    const z = { score: 8, total: 10, date: "2026-09-02T00:00:00Z", missedIds: [] };
    const merged = mergeEntry({ key, value: [x, y], updatedAt: 1 }, { key, value: [x, z], updatedAt: 2 });
    expect(merged.value).toEqual([x, z, y]);
  });

  it("unions study days and finished chapters", () => {
    expect(
      mergeEntry(
        { key: "medicine:activity", value: ["2026-09-02", "2026-09-01"], updatedAt: 5 },
        { key: "medicine:activity", value: ["2026-09-03", "2026-09-01"], updatedAt: 1 },
      ).value,
    ).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("takes the later reading position by its own timestamp", () => {
    const key = "medicine:ebook:1.2/anatomy";
    const early = { chapterId: "chapter-02", scroll: 0, updatedAt: "2026-09-01T00:00:00Z" };
    const late = { chapterId: "chapter-05", scroll: 0, updatedAt: "2026-09-09T00:00:00Z" };
    expect(mergeEntry({ key, value: late, updatedAt: 1 }, { key, value: early, updatedAt: 9 }).value).toEqual(late);
  });

  it("uses the most recently changed copy for everything else, incoming winning ties", () => {
    const key = "medicine:quizdue:1.1/biochem";
    expect(mergeEntry({ key, value: ["q1"], updatedAt: 10 }, { key, value: [], updatedAt: 5 }).value).toEqual(["q1"]);
    expect(mergeEntry({ key, value: ["q1"], updatedAt: 10 }, { key, value: [], updatedAt: 10 }).value).toEqual([]);
  });

  it("falls back to the newer copy when a value has an unexpected shape", () => {
    const key = "medicine:flashcards:1.1/biochem";
    expect(mergeEntry({ key, value: "junk", updatedAt: 1 }, { key, value: { a: card(1, "x") }, updatedAt: 2 }).value).toEqual({
      a: card(1, "x"),
    });
  });
});
