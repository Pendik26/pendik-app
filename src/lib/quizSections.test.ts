import { describe, expect, it } from "vitest";
import { buildSections } from "./quizSections";
import type { QuizQuestion } from "../types/content";

function makeBank(n: number): QuizQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    question: `Question ${i + 1}`,
    options: ["a", "b"],
    answer: 0,
    explanation: "",
  }));
}

describe("buildSections", () => {
  it("returns no sections when the bank is at or below the threshold", () => {
    expect(buildSections(makeBank(50), 25, 50)).toEqual([]);
    expect(buildSections(makeBank(42), 25, 50)).toEqual([]);
    expect(buildSections(makeBank(26), 25, 50)).toEqual([]);
    expect(buildSections(makeBank(10), 25, 50)).toEqual([]);
  });

  it("splits a bank above the threshold into evenly-sized sections, no tiny leftover", () => {
    // 51 questions just over the threshold: 3 sections of 17, not 25+25+1.
    const sections = buildSections(makeBank(51), 25, 50);
    expect(sections.map((s) => s.questions.length)).toEqual([17, 17, 17]);
  });

  it("distributes a large bank across sections within one of the target size", () => {
    const sections = buildSections(makeBank(170), 25, 50);
    for (const s of sections) {
      expect(s.questions.length).toBeGreaterThanOrEqual(24);
      expect(s.questions.length).toBeLessThanOrEqual(25);
    }
    expect(sections.reduce((sum, s) => sum + s.questions.length, 0)).toBe(170);
  });

  it("covers every question exactly once, in original order", () => {
    const bank = makeBank(170);
    const sections = buildSections(bank, 25, 50);
    const rebuilt = sections.flatMap((s) => s.questions);
    expect(rebuilt.map((q) => q.id)).toEqual(bank.map((q) => q.id));
  });

  it("labels sections with a 1-based, human-readable range", () => {
    const sections = buildSections(makeBank(170), 25, 50);
    expect(sections[0]).toMatchObject({ shortLabel: "Section 1", range: "Q1–25" });
    expect(sections[1].range.startsWith("Q26")).toBe(true);
  });
});
