import { describe, expect, it } from "vitest";
import { scoreQuiz, updateDueIds } from "./quizScoring";
import type { QuizQuestion } from "../types/content";

const questions: QuizQuestion[] = [
  { id: "q1", question: "1+1?", options: ["1", "2"], answer: 1, explanation: "" },
  { id: "q2", question: "2+2?", options: ["3", "4"], answer: 1, explanation: "" },
  { id: "q3", question: "3+3?", options: ["5", "6"], answer: 1, explanation: "" },
];

describe("scoreQuiz", () => {
  it("scores a perfect run with no missed questions", () => {
    const result = scoreQuiz(questions, { q1: 1, q2: 1, q3: 1 });
    expect(result).toEqual({ score: 3, total: 3, missedIds: [] });
  });

  it("counts wrong answers as missed", () => {
    const result = scoreQuiz(questions, { q1: 0, q2: 1, q3: 1 });
    expect(result.score).toBe(2);
    expect(result.missedIds).toEqual(["q1"]);
  });

  it("counts unanswered questions as missed", () => {
    const result = scoreQuiz(questions, { q1: 1, q2: 1 });
    expect(result.score).toBe(2);
    expect(result.missedIds).toEqual(["q3"]);
  });

  it("returns total 0 for an empty question set", () => {
    expect(scoreQuiz([], {})).toEqual({ score: 0, total: 0, missedIds: [] });
  });

  it("scores a fully missed quiz", () => {
    const result = scoreQuiz(questions, { q1: 0, q2: 0, q3: 0 });
    expect(result.score).toBe(0);
    expect(result.missedIds).toEqual(["q1", "q2", "q3"]);
  });
});

describe("updateDueIds", () => {
  it("adds newly missed questions to an empty due queue", () => {
    expect(updateDueIds([], questions, ["q1"])).toEqual(["q1"]);
  });

  it("keeps a previously due question that is missed again, without duplicating it", () => {
    expect(updateDueIds(["q1"], questions, ["q1"])).toEqual(["q1"]);
  });

  it("graduates a previously due question once it's answered correctly", () => {
    expect(updateDueIds(["q1"], questions, [])).toEqual([]);
  });

  it("leaves due questions from other subjects/banks untouched when they weren't part of this attempt", () => {
    const partialAttempt = [questions[0]];
    expect(updateDueIds(["q2"], partialAttempt, [])).toEqual(["q2"]);
  });

  it("combines graduating old misses with adding new ones in the same attempt", () => {
    // q1 was due and is now correct (graduates); q2 is newly missed; q3 stays clean.
    const result = updateDueIds(["q1"], questions, ["q2"]);
    expect(result).toEqual(["q2"]);
  });
});
