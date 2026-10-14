import { describe, expect, it } from "vitest";
import { sourceLabel } from "./examSource";

const t = (k: string) => `<${k}>`;

describe("sourceLabel", () => {
  it("translates known codes and capitalises the rest", () => {
    expect(sourceLabel("ub", t)).toBe("<exam.sourceUb>");
    expect(sourceLabel("Tryout", t)).toBe("<exam.sourceTryout>");
    expect(sourceLabel("remedial", t)).toBe("Remedial");
  });
});
