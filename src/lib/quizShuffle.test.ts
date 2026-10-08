import { describe, expect, it } from "vitest";
import { buildSessionBank } from "./quizShuffle";
import type { QuizQuestion } from "../types/content";

const questions: QuizQuestion[] = [
  { id: "q1", question: "1+1?", options: ["1", "2", "3", "4"], answer: 1, explanation: "" },
  { id: "q2", question: "2+2?", options: ["3", "4", "5", "6"], answer: 1, explanation: "" },
  { id: "q3", question: "3+3?", options: ["5", "6", "7", "8"], answer: 1, explanation: "" },
];

describe("buildSessionBank", () => {
  it("preserves every question and keeps the correct option text pointed to by the new answer index", () => {
    const session = buildSessionBank(questions);
    expect(session).toHaveLength(questions.length);

    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const q of session) {
      const original = byId.get(q.id);
      expect(original).toBeDefined();
      expect(q.options.slice().sort()).toEqual(original!.options.slice().sort());
      expect(q.options[q.answer]).toBe(original!.options[original!.answer]);
    }
  });

  it("does not mutate the source array or its questions", () => {
    const before = JSON.stringify(questions);
    buildSessionBank(questions);
    expect(JSON.stringify(questions)).toBe(before);
  });

  it("returns an empty bank for an empty input", () => {
    expect(buildSessionBank([])).toEqual([]);
  });

  it("eventually produces a different question order across repeated calls", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 25; i++) {
      orders.add(buildSessionBank(questions).map((q) => q.id).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("eventually produces a different option order for a question across repeated calls", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const session = buildSessionBank(questions);
      const q1 = session.find((q) => q.id === "q1")!;
      orders.add(q1.options.join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});
