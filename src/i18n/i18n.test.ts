import { describe, expect, it } from "vitest";
import { translate } from "./i18n";
import { en, id } from "./messages";

describe("translations", () => {
  it("has every message in both languages", () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(id)) expect(text, key).not.toBe("");
  });

  it("uses the same placeholders in both languages", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(id[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("fills in placeholders", () => {
    expect(translate("en", "auth.hello", { name: "Sam" })).toBe("Hi, Sam");
    expect(translate("id", "auth.hello", { name: "Sam" })).toBe("Halo, Sam");
  });
});
