import { describe, expect, it } from "vitest";
import { parseGroupLines, classSection, parseRosterLines, suggestedMinutes } from "./admin";

describe("pasted roster lines", () => {
  it("reads commas, tabs or semicolons, skips a header and fills the cohort", () => {
    const { rows, problems } = parseRosterLines("NIM\tName\tClass\n2601001\tAda Lovelace\tA\n2601002, Bo Chen\n2601003; Cy Dee; B; 2025\n", "2026");
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { student_id: "2601001", full_name: "Ada Lovelace", class_group: "A", cohort: "2026", track: null },
      { student_id: "2601002", full_name: "Bo Chen", class_group: null, cohort: "2026", track: null },
      { student_id: "2601003", full_name: "Cy Dee", class_group: "B", cohort: "2025", track: null },
    ]);
  });

  it("reads a track cell anywhere after the name, else uses the default", () => {
    const { rows } = parseRosterLines("2601001, Ada, IUP, A\n2601002, Bo, B, 2025, reguler\n2601003, Cy, C", "2026", "REGULER");
    expect(rows.map((r) => [r.track, r.class_group, r.cohort])).toEqual([
      ["IUP", "A", "2026"],
      ["REGULER", "B", "2025"],
      ["REGULER", "C", "2026"],
    ]);
  });

  it("lists lines it can't use", () => {
    const { rows, problems } = parseRosterLines("26 01, Bad Id\n2601004\n2601005, Ok\n2601005, Twice", "2026");
    expect(rows.map((r) => r.student_id)).toEqual(["2601005"]);
    expect(problems).toHaveLength(3);
  });

  it("suggests about a minute a question", () => {
    expect(suggestedMinutes(64)).toBe(65);
    expect(suggestedMinutes(2)).toBe(5);
  });
});

describe("pasted group lines", () => {
  it("reads id, group and an optional class, and reports bad lines", () => {
    const { rows, problems } = parseGroupLines("NIM,Group,Class\n2601001, 3, Reguler\n2601002\t1\n2601003, 2, Other\n2601001, 4\nx, 1");
    expect(rows).toEqual([
      { student_id: "2601001", class_group: "3", track: "REGULER" },
      { student_id: "2601002", class_group: "1" },
    ]);
    expect(problems).toHaveLength(3);
  });
});

describe("class section", () => {
  it("comes from the tutorial group's letter", () => {
    expect(classSection("REGULER", "A3")).toBe("A");
    expect(classSection("REGULER", "b10")).toBe("B");
    expect(classSection("REGULER", null)).toBeNull();
    expect(classSection("IUP", "IUP-A")).toBe("A");
    expect(classSection("IUP", "iup b")).toBe("B");
    expect(classSection("IUP", "IUP-1")).toBeNull();
  });
});
