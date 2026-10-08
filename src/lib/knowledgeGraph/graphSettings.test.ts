import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, labelAlpha, RANGES, sanitizeSettings } from "./graphSettings";

describe("sanitizeSettings", () => {
  it("falls back to the defaults for anything missing or malformed", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ colorBy: "rainbow", nodeSize: "big", forces: 3 })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and clamps numbers into their ranges", () => {
    const s = sanitizeSettings({ colorBy: "mastery", orphans: false, nodeSize: 99, textFade: -10, forces: { repel: 2, distance: 0 } });
    expect(s.colorBy).toBe("mastery");
    expect(s.orphans).toBe(false);
    expect(s.nodeSize).toBe(RANGES.nodeSize[1]);
    expect(s.textFade).toBe(RANGES.textFade[0]);
    expect(s.forces).toEqual({ center: 1, repel: 2, link: 1, distance: RANGES.distance[0] });
  });

  it("ignores inherited and non-finite values", () => {
    expect(sanitizeSettings(JSON.parse('{"__proto__": {"nodeSize": 2}}')).nodeSize).toBe(1);
    expect(sanitizeSettings({ linkThickness: Number.NaN, textFade: Infinity }).linkThickness).toBe(1);
  });
});

describe("labelAlpha", () => {
  it("shows big concepts' labels before small ones as you zoom in", () => {
    expect(labelAlpha(0.9, 16, 0)).toBe(1);
    expect(labelAlpha(0.9, 3, 0)).toBe(0);
    expect(labelAlpha(3, 3, 0)).toBe(1);
    expect(labelAlpha(0.1, 16, 0)).toBe(0);
  });

  it("shows more labels with a higher text fade setting", () => {
    expect(labelAlpha(0.8, 6, 3)).toBeGreaterThan(labelAlpha(0.8, 6, -3));
  });
});
