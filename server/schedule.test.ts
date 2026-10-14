import { describe, expect, it } from "vitest";
import { normalizePhone } from "./schedule.js";

describe("normalizePhone", () => {
  it("turns the ways people write Indonesian numbers into one form", () => {
    expect(normalizePhone("0812-3456 789")).toBe("+628123456789");
    expect(normalizePhone("628123456789")).toBe("+628123456789");
    expect(normalizePhone("+62 812 3456 789")).toBe("+628123456789");
    expect(normalizePhone("0061400000000")).toBe("+61400000000");
  });
  it("refuses what can't be a phone number", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("0812")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
