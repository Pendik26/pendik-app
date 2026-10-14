import { describe, expect, it } from "vitest";
import { cleanFilter, compareCategories, driveFilterOptions, filterDriveFiles, isFiltering, NO_DRIVE_FILTER, placeOf } from "./driveFilters";

const f = (...path: string[]) => ({ path });
const files = [
  f("SEMESTER 1", "REGULER", "BLOK 1.1 Biomedik", "Kuliah", "Histologi"),
  f("SEMESTER 1", "REGULER", "BLOK 1.1 Biomedik", "Kuliah", "Biokimia"),
  f("SEMESTER 1", "REGULER", "BLOK 1.1 Biomedik", "Tutorial"),
  f("SEMESTER 1", "REGULER", "BLOK 1.2 Integumen", "Kuliah", "Anatomi"),
  f("Lain-lain"),
];

describe("placeOf", () => {
  it("reads the block, category and subject", () => {
    expect(placeOf(["SEMESTER 1", "IUP", "BLOK 1.2 Integumen", "Kuliah", "Anatomi"])).toEqual({
      block: "1.2",
      blockName: "Integumen",
      category: "Kuliah",
      subject: "Anatomi",
    });
  });
  it("copes with no semester or track folder", () => {
    expect(placeOf(["Block 2,3 - Kardio", "Slides"]).block).toBe("2.3");
  });
  it("leaves files outside any block without a place", () => {
    expect(placeOf(["Lain-lain"]).block).toBeNull();
  });
});

describe("filterDriveFiles", () => {
  it("returns everything when nothing is chosen", () => {
    expect(filterDriveFiles(files, NO_DRIVE_FILTER)).toHaveLength(5);
    expect(isFiltering(NO_DRIVE_FILTER)).toBe(false);
  });
  it("narrows by block, then category, then subject", () => {
    expect(filterDriveFiles(files, { block: "1.1", category: "", subject: "" })).toHaveLength(3);
    expect(filterDriveFiles(files, { block: "1.1", category: "Kuliah", subject: "" })).toHaveLength(2);
    expect(filterDriveFiles(files, { block: "1.1", category: "Kuliah", subject: "Biokimia" })).toHaveLength(1);
  });
});

describe("driveFilterOptions", () => {
  it("offers only what is in the chosen block", () => {
    const o = driveFilterOptions(files, { block: "1.1", category: "", subject: "" });
    expect(o.blocks.map((b) => b.id)).toEqual(["1.1", "1.2"]);
    expect(o.categories).toEqual(["Kuliah", "Tutorial"]);
    expect(o.subjects).toEqual(["Biokimia", "Histologi"]);
  });
});

describe("cleanFilter", () => {
  it("clears a part that is no longer offered", () => {
    expect(cleanFilter(files, { block: "1.2", category: "Tutorial", subject: "Biokimia" })).toEqual({ block: "1.2", category: "", subject: "" });
  });
});

describe("compareCategories", () => {
  it("follows the class's order, then A–Z", () => {
    const names = ["Zeta", "MODUL TUTOR", "Alpha", "RECORD", "PPT ASLAB", "ppt dosen", "MODUL SL", "PPT TENTIRAN"];
    expect([...names].sort(compareCategories)).toEqual(["ppt dosen", "PPT ASLAB", "RECORD", "PPT TENTIRAN", "MODUL SL", "MODUL TUTOR", "Alpha", "Zeta"]);
  });
});
