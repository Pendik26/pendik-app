import { describe, expect, it } from "vitest";
import { INITIAL_CARD_STATE, isDue, reviewCard } from "./sm2";

describe("reviewCard", () => {
  it("resets reps and schedules a 1-day interval on a failed recall (quality < 3)", () => {
    const prev = { interval: 10, easeFactor: 2.5, dueDate: "2024-01-01T00:00:00.000Z", reps: 3, lapses: 0 };
    const result = reviewCard(prev, 2);

    expect(result.reps).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.lapses).toBe(1);
    expect(result.easeFactor).toBe(prev.easeFactor);
  });

  it("schedules a 1-day interval on the first successful review", () => {
    const result = reviewCard(INITIAL_CARD_STATE, 4);
    expect(result.reps).toBe(1);
    expect(result.interval).toBe(1);
  });

  it("schedules a 6-day interval on the second successful review", () => {
    const afterFirst = reviewCard(INITIAL_CARD_STATE, 4);
    const afterSecond = reviewCard(afterFirst, 4);
    expect(afterSecond.reps).toBe(2);
    expect(afterSecond.interval).toBe(6);
  });

  it("multiplies the previous interval by the ease factor from the third review onward", () => {
    const state = { interval: 6, easeFactor: 2.5, dueDate: "2024-01-01T00:00:00.000Z", reps: 2, lapses: 0 };
    const result = reviewCard(state, 4);
    expect(result.reps).toBe(3);
    expect(result.interval).toBe(Math.round(6 * 2.5));
  });

  it("never drops the ease factor below the 1.3 floor", () => {
    const state = { interval: 6, easeFactor: 1.3, dueDate: "2024-01-01T00:00:00.000Z", reps: 2, lapses: 0 };
    const result = reviewCard(state, 3);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("increases the ease factor on a perfect recall (quality 5)", () => {
    const state = { interval: 6, easeFactor: 2.5, dueDate: "2024-01-01T00:00:00.000Z", reps: 2, lapses: 0 };
    const result = reviewCard(state, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  it("clamps out-of-range quality values into 0-5 before scoring", () => {
    const failLow = reviewCard(INITIAL_CARD_STATE, -3);
    const passHigh = reviewCard(INITIAL_CARD_STATE, 99);
    expect(failLow.lapses).toBe(1);
    expect(passHigh.reps).toBe(1);
  });
});

describe("isDue", () => {
  it("is true when the due date is in the past", () => {
    const state = { ...INITIAL_CARD_STATE, dueDate: "2020-01-01T00:00:00.000Z" };
    expect(isDue(state, new Date("2024-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("is true exactly at the due date (boundary is inclusive)", () => {
    const at = new Date("2024-01-01T00:00:00.000Z");
    const state = { ...INITIAL_CARD_STATE, dueDate: at.toISOString() };
    expect(isDue(state, at)).toBe(true);
  });

  it("is false when the due date is in the future", () => {
    const state = { ...INITIAL_CARD_STATE, dueDate: "2030-01-01T00:00:00.000Z" };
    expect(isDue(state, new Date("2024-01-01T00:00:00.000Z"))).toBe(false);
  });
});
