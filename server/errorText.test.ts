import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { errorText } from "../src/i18n/errorText";
import { translate } from "../src/i18n/i18n";

const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
const id = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("id", key, vars);

describe("errorText", () => {
  it("translates the server's codes", () => {
    expect(errorText(new Error("admins_only"), en)).toBe("Only admins can do this.");
    expect(errorText(new Error("admins_only"), id)).toBe("Hanya admin yang bisa melakukan ini.");
    expect(errorText(new Error("bad_period"), id)).toBe(id("err.invalid"));
  });

  it("passes a plain message through", () => {
    expect(errorText(new Error("Line 3: no name."), en)).toBe("Line 3: no name.");
  });

  it("covers every code the server can refuse with", () => {
    const codes = new Set<string>();
    const files = readdirSync("server", { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of files) {
      for (const m of readFileSync(`server/${file}`, "utf8").matchAll(/refuse\("([a-z_]+)"/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(20);
    for (const code of codes) {
      expect(errorText(new Error(code), en), code).not.toBe(en("common.error", { message: code }));
    }
  });
});
