import { describe, expect, it } from "vitest";
import { firstName, initialsOf } from "./firstName";

describe("firstName", () => {
  it("skips a leading Muhammad and takes the next word", () => {
    expect(firstName("Muhammad Affan Hassya Purnomo")).toBe("Affan");
  });

  it("handles common spellings and abbreviations, in any case", () => {
    for (const prefix of ["Mohammad", "Mohamad", "Muhamad", "Muhammed", "MUHAMMAD", "muhammad", "Moh.", "Moh", "Muh.", "Mhd.", "M.", "M"]) {
      expect(firstName(`${prefix} Rizky Pratama`)).toBe("Rizky");
    }
  });

  it("keeps ordinary first names", () => {
    expect(firstName("Budi Santoso")).toBe("Budi");
    expect(firstName("Maya Putri")).toBe("Maya");
    expect(firstName("Mohan Das")).toBe("Mohan");
  });

  it("only drops the prefix when it is first", () => {
    expect(firstName("Siti Muhammad")).toBe("Siti");
  });

  it("keeps the prefix when it is the whole name", () => {
    expect(firstName("Muhammad")).toBe("Muhammad");
    expect(firstName("  Muhammad  ")).toBe("Muhammad");
  });

  it("copes with extra spaces and empty input", () => {
    expect(firstName("  Muhammad   Affan ")).toBe("Affan");
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
  });
});

describe("initialsOf", () => {
  it("uses the words after the prefix", () => {
    expect(initialsOf("Muhammad Affan Hassya Purnomo")).toBe("AH");
    expect(initialsOf("Budi Santoso")).toBe("BS");
    expect(initialsOf("Muhammad Affan")).toBe("A");
  });

  it("falls back to a question mark", () => {
    expect(initialsOf("")).toBe("?");
  });
});
