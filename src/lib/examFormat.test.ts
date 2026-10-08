import { describe, expect, it } from "vitest";
import { buildExamFormat } from "./examFormat";

describe("buildExamFormat", () => {
  it("targets exactly 100 questions / 100 minutes when the pool is large enough", () => {
    const format = buildExamFormat(238);
    expect(format.questionCount).toBe(100);
    expect(format.timeLimitSec).toBe(6000);
    expect(format.timeLimitSec / 60).toBe(100);
  });

  it("targets exactly 100 questions when the pool is exactly 100", () => {
    expect(buildExamFormat(100)).toEqual({ questionCount: 100, timeLimitSec: 6000 });
  });

  it("scales down proportionally (1 min/question) when the pool is smaller than 100", () => {
    expect(buildExamFormat(30)).toEqual({ questionCount: 30, timeLimitSec: 1800 });
  });

  it("returns zero questions/time for an empty pool", () => {
    expect(buildExamFormat(0)).toEqual({ questionCount: 0, timeLimitSec: 0 });
  });
});
