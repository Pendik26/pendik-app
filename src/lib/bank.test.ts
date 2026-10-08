import { describe, expect, it } from "vitest";
import { bankMatches, type BankGroup } from "./exams";
import { rowsForTrack } from "./drive";

const groups: BankGroup[] = [
  { block: "1.1", source: "UB", year: 2024, subject: "Anatomy", questions: 10, bookmarked: 2 },
  { block: "1.1", source: "UB", year: 2025, subject: "Physiology", questions: 5, bookmarked: 0 },
  { block: "1.1", source: "Remedial", year: null, subject: null, questions: 3, bookmarked: 1 },
  { block: "1.2", source: "UB", year: 2024, subject: "Anatomy", questions: 7, bookmarked: 4 },
];
const any = { block: null, sources: [], years: [], subjects: [], bookmarkedOnly: false };

describe("bankMatches", () => {
  it("counts everything when nothing is picked", () => {
    expect(bankMatches(groups, any)).toBe(25);
  });

  it("narrows by block, source, year and subject together", () => {
    expect(bankMatches(groups, { ...any, block: "1.1" })).toBe(18);
    expect(bankMatches(groups, { ...any, block: "1.1", sources: ["UB"], years: [2024] })).toBe(10);
    expect(bankMatches(groups, { ...any, subjects: ["Anatomy"] })).toBe(17);
  });

  it("leaves out questions without the picked field", () => {
    expect(bankMatches(groups, { ...any, block: "1.1", years: [2024, 2025] })).toBe(15);
  });

  it("counts only bookmarks when asked", () => {
    expect(bankMatches(groups, { ...any, bookmarkedOnly: true })).toBe(7);
    expect(bankMatches(groups, { ...any, block: "1.2", bookmarkedOnly: true })).toBe(4);
  });
});

describe("rowsForTrack", () => {
  const rows = [{ id: "a", track: "IUP" }, { id: "b", track: "REGULER" }, { id: "c", track: null }];

  it("shows a student their class's files and the shared ones", () => {
    expect(rowsForTrack(rows, "IUP", false).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("shows everything with no class or when both are asked for", () => {
    expect(rowsForTrack(rows, null, false)).toHaveLength(3);
    expect(rowsForTrack(rows, "REGULER", true)).toHaveLength(3);
  });
});
