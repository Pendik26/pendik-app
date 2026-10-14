import { describe, expect, it } from "vitest";
import { normalizePhone } from "./schedule.js";

describe("normalizePhone", () => {
  it("turns the ways people write Indonesian numbers into one form", () => {
    expect(normalizePhone("0817-9555 799")).toBe("+628179555799");
    expect(normalizePhone("628179555799")).toBe("+628179555799");
    expect(normalizePhone("+62 817 9555 799")).toBe("+628179555799");
    expect(normalizePhone("0061498317333")).toBe("+61498317333");
  });
  it("refuses what can't be a phone number", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("0812")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
