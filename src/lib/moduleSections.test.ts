import { describe, expect, it } from "vitest";
import { groupModules } from "./moduleSections";

const pdf = (name: string, section: string) => ({ name, url: `/${section}/${name}.pdf`, section });

describe("groupModules", () => {
  it("returns null when no PDF sits in a subfolder", () => {
    expect(groupModules([pdf("A", ""), pdf("B", "")])).toBeNull();
  });

  it("lays out lecture then practicum (reports, assistance), with empty sections kept", () => {
    const groups = groupModules([pdf("Cranium", "practicum/assistance")])!;
    expect(groups.map((g) => g.label)).toEqual(["Lecture", "Practicum"]);
    expect(groups[0].sections).toEqual([{ id: "lecture", label: "", pdfs: [] }]);
    expect(groups[1].sections.map((s) => [s.label, s.pdfs.length])).toEqual([
      ["Reports", 0],
      ["Assistance", 1],
    ]);
  });

  it("appends unknown subfolders and loose root files after the standard sections", () => {
    const groups = groupModules([pdf("X", "practicum/assistance"), pdf("Y", "extra"), pdf("Z", "")])!;
    expect(groups.map((g) => g.label)).toEqual(["Lecture", "Practicum", "Extra", "Other"]);
    expect(groups[3].sections[0].pdfs.map((p) => p.name)).toEqual(["Z"]);
  });
});
