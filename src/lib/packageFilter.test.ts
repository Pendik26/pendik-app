import { describe, expect, it } from "vitest";
import type { PackageSummary } from "./exams";
import { distinct, matchSpelling, filterPackages, NO_FILTER } from "./packageFilter";

const pkg = (over: Partial<PackageSummary>): PackageSummary => ({
  id: "p",
  title: "Block 1.1 Original",
  block: "1.1",
  source: "Original",
  year: 2025,
  mode: "exam",
  timeLimitMinutes: 60,
  trackBest: true,
  status: "published",
  questionCount: 10,
  createdAt: null,
  track: null,
  ...over,
});

const list = [
  pkg({ id: "a" }),
  pkg({ id: "b", title: "Block 1.1 Original (practice)", mode: "practice", status: "draft" }),
  pkg({ id: "c", title: "UB 2024", block: "1.2", source: "UB", year: 2024 }),
];
const ids = (xs: PackageSummary[]) => xs.map((p) => p.id);

describe("filterPackages", () => {
  it("keeps everything with no filter", () => {
    expect(ids(filterPackages(list, NO_FILTER))).toEqual(["a", "b", "c"]);
  });
  it("matches title text without caring about case", () => {
    expect(ids(filterPackages(list, { ...NO_FILTER, text: " ub " }))).toEqual(["c"]);
  });
  it("combines filters", () => {
    expect(ids(filterPackages(list, { ...NO_FILTER, block: "1.1", status: "draft" }))).toEqual(["b"]);
    expect(ids(filterPackages(list, { ...NO_FILTER, year: "2024", mode: "exam" }))).toEqual(["c"]);
  });
});

describe("distinct", () => {
  it("drops nulls and repeats and sorts naturally", () => {
    expect(distinct(["1.10", "1.2", null, "1.2"])).toEqual(["1.2", "1.10"]);
  });
});

describe("matchSpelling", () => {
  it("uses the spelling already in use, whatever the case or spacing", () => {
    expect(matchSpelling(" tryout ", ["Block Test", "Tryout"])).toBe("Tryout");
    expect(matchSpelling("block  test", ["Block Test"])).toBe("Block Test");
  });
  it("keeps a new value, tidied", () => {
    expect(matchSpelling("  UB  2025 ", ["Tryout"])).toBe("UB 2025");
  });
});
