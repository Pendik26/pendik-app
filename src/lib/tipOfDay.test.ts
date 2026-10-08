import { describe, expect, it } from "vitest";
import { tipOfDay } from "./tipOfDay";

describe("tipOfDay", () => {
  it("returns an empty string when there are no tips", () => {
    expect(tipOfDay([], new Date("2024-01-01"))).toBe("");
  });

  it("returns the same tip for the same calendar date, regardless of time of day", () => {
    const tips = ["a", "b", "c"];
    const morning = tipOfDay(tips, new Date("2024-03-05T01:00:00.000Z"));
    const evening = tipOfDay(tips, new Date("2024-03-05T23:00:00.000Z"));
    expect(morning).toBe(evening);
  });

  it("wraps around when the day of year exceeds the tip count", () => {
    const tips = ["a", "b"];
    // Day 3 of the year, 3 % 2 === 1 -> "b"
    expect(tipOfDay(tips, new Date("2024-01-03T00:00:00.000Z"))).toBe("b");
  });

  it("picks different tips on different days as long as the count doesn't divide evenly", () => {
    const tips = ["a", "b", "c", "d", "e"];
    const day1 = tipOfDay(tips, new Date("2024-01-01T00:00:00.000Z"));
    const day2 = tipOfDay(tips, new Date("2024-01-02T00:00:00.000Z"));
    expect(day1).not.toBe(day2);
  });

  it("returns the sole tip every day when only one is provided", () => {
    const tips = ["only tip"];
    expect(tipOfDay(tips, new Date("2024-01-01"))).toBe("only tip");
    expect(tipOfDay(tips, new Date("2024-12-31"))).toBe("only tip");
  });
});
