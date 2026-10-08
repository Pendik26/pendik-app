import { describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "./storage";
import { KEY_TYPES, appKey, parseKey, savedOnServer, serverKey, storageKey } from "./storageSchema";

describe("storage key registry", () => {
  it("declares every key the app writes", () => {
    const keys = Object.values(STORAGE_KEYS).map((k) => (typeof k === "function" ? k("1.2/anatomy") : k));
    for (const key of keys) {
      const parsed = parseKey(key);
      expect(parsed, key).not.toBeNull();
      expect(Object.keys(KEY_TYPES), key).toContain(parsed!.type);
    }
  });

  it("saves progress on the server and keeps device settings in the browser", () => {
    expect(savedOnServer(storageKey("flashcards", "1.1/biochem"))).toBe(true);
    expect(savedOnServer(storageKey("activity"))).toBe(true);
    expect(savedOnServer(storageKey("quizinprogress", "1.1/biochem"))).toBe(true);
    expect(savedOnServer(STORAGE_KEYS.theme)).toBe(false);
    expect(savedOnServer(STORAGE_KEYS.sidebarCollapsed)).toBe(false);
    // Unknown types and malformed keys are never sent.
    expect(savedOnServer("pendik:newthing:x")).toBe(false);
    expect(savedOnServer("pendik:flashcards:bad key!")).toBe(false);
    expect(savedOnServer("other:thing")).toBe(false);
  });

  it("stores keys on the server without the prefix", () => {
    const key = storageKey("quiz", "1.2/anatomy");
    expect(serverKey(key)).toBe("quiz:1.2/anatomy");
    expect(appKey(serverKey(key))).toBe(key);
  });

  it("matches the server's key format", () => {
    // supabase/migrations/20261008000500_study.sql: progress.key check constraint.
    const serverPattern = /^[a-z]+(:[A-Za-z0-9._/-]{1,120})?$/;
    for (const k of Object.values(STORAGE_KEYS)) {
      const key = typeof k === "function" ? k("1.2/anatomy") : k;
      if (savedOnServer(key)) expect(serverKey(key)).toMatch(serverPattern);
    }
  });
});
