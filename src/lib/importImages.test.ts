import { describe, expect, it } from "vitest";
import { fillSlots, fitWithin, imageSlots } from "./importImages";

const text = [
  "## 1",
  "![knee](upload:knee-xray)",
  "- [ ] ![cell A](upload:a)",
  "- [x] ![cell B](upload:b)",
  "## 2",
  "![knee again](upload:knee-xray)",
  "![repo one](question-images/1.1/old.jpg)",
].join("\n");

describe("imageSlots", () => {
  it("lists each label once, in order", () => {
    expect(imageSlots(text)).toEqual(["knee-xray", "a", "b"]);
  });
  it("finds none in a file without upload labels", () => {
    expect(imageSlots("![x](question-images/1.1/y.jpg)")).toEqual([]);
  });
});

describe("fillSlots", () => {
  const id = "api/question-image/11111111-1111-4111-8111-111111111111";
  it("swaps uploaded labels for their path and leaves the rest", () => {
    const out = fillSlots(text, { "knee-xray": id });
    expect(out).toContain(`![knee](${id})`);
    expect(out).toContain(`![knee again](${id})`);
    expect(out).toContain("(upload:a)");
    expect(out).toContain("(question-images/1.1/old.jpg)");
  });
  it("ignores a label that merely sounds like one", () => {
    expect(fillSlots("![x](upload:a)", { "a)": "p" })).toBe("![x](upload:a)");
  });
});

describe("fitWithin", () => {
  it("shrinks the longest side to the limit and keeps the shape", () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(800, 2400)).toEqual({ width: 533, height: 1600 });
  });
  it("never enlarges", () => {
    expect(fitWithin(400, 300)).toEqual({ width: 400, height: 300 });
  });
});
