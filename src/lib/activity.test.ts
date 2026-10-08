import { describe, expect, it } from "vitest";
import { getCurrentStreak, getLongestStreak } from "./activity";

const NOW = new Date("2024-06-15T12:00:00.000Z");

describe("getCurrentStreak", () => {
  it("is 0 for no activity", () => {
    expect(getCurrentStreak([], NOW)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const days = ["2024-06-13", "2024-06-14", "2024-06-15"];
    expect(getCurrentStreak(days, NOW)).toBe(3);
  });

  it("still counts the streak if today hasn't been studied yet, using yesterday as the anchor", () => {
    const days = ["2024-06-12", "2024-06-13", "2024-06-14"];
    expect(getCurrentStreak(days, NOW)).toBe(3);
  });

  it("is 0 if the most recent study day is more than a day ago", () => {
    const days = ["2024-06-10", "2024-06-11", "2024-06-12"];
    expect(getCurrentStreak(days, NOW)).toBe(0);
  });

  it("stops counting at the first gap", () => {
    const days = ["2024-06-01", "2024-06-13", "2024-06-14", "2024-06-15"];
    expect(getCurrentStreak(days, NOW)).toBe(3);
  });
});

describe("getLongestStreak", () => {
  it("is 0 for no activity", () => {
    expect(getLongestStreak([])).toBe(0);
  });

  it("is 1 for a single isolated day", () => {
    expect(getLongestStreak(["2024-06-15"])).toBe(1);
  });

  it("finds the longest run even when it isn't the most recent one", () => {
    const days = [
      "2024-06-01", "2024-06-02", "2024-06-03", "2024-06-04", // 4-day run
      "2024-06-10", "2024-06-11", // 2-day run
    ];
    expect(getLongestStreak(days)).toBe(4);
  });

  it("is unaffected by the order the days are passed in", () => {
    const days = ["2024-06-03", "2024-06-01", "2024-06-02"];
    expect(getLongestStreak(days)).toBe(3);
  });
});
