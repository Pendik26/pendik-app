import { describe, expect, it } from "vitest";
import { SUBJECT_SCOPED_TYPES } from "./progressMigration";
import { STORAGE_KEYS } from "./storage";
import { KEY_TYPES, keptOnClear, mergeRuleFor, parseKey, storageKey, type KeyTypeName } from "./storageSchema";
import { SYNC_STATE_KEY } from "./sync";
import { DIRTY_KEY } from "./syncDirty";

describe("storage key registry", () => {
  it("declares every key the app writes", () => {
    const keys = [
      ...Object.values(STORAGE_KEYS).map((k) => (typeof k === "function" ? k("1.2/anatomy") : k)),
      SYNC_STATE_KEY,
      DIRTY_KEY,
    ];
    for (const key of keys) {
      const parsed = parseKey(key);
      expect(parsed, key).not.toBeNull();
      expect(Object.keys(KEY_TYPES), key).toContain(parsed!.type);
    }
  });

  it("only migrates types that are keyed by subject", () => {
    for (const type of Object.keys(SUBJECT_SCOPED_TYPES) as KeyTypeName[]) {
      expect(Object.entries(KEY_TYPES).find(([name]) => name === type)?.[1].id, type).toBe("subject");
    }
  });

  it("gives each key its merge rule and keeps device-only keys local", () => {
    expect(mergeRuleFor(storageKey("flashcards", "1.1/biochem"))).toBe("cards");
    expect(mergeRuleFor(storageKey("examhistory", "1.1/past-2024"))).toBe("attempts");
    expect(mergeRuleFor(storageKey("activity"))).toBe("set");
    expect(mergeRuleFor(storageKey("quizinprogress", "1.1/biochem"))).toBeNull();
    expect(mergeRuleFor(SYNC_STATE_KEY)).toBeNull();
    // A type from a newer version still syncs, as last-write-wins.
    expect(mergeRuleFor("medicine:newthing:x")).toBe("latest");
    expect(mergeRuleFor("medicine:flashcards:bad key!")).toBeNull();
    expect(mergeRuleFor("other:thing")).toBeNull();
  });

  it("keeps only the theme when clearing a device", () => {
    expect(keptOnClear(STORAGE_KEYS.theme)).toBe(true);
    expect(keptOnClear(STORAGE_KEYS.activity)).toBe(false);
    expect(keptOnClear("medicine:toString")).toBe(false);
  });
});
