import { beforeEach, describe, expect, it } from "vitest";
import { clearImportDraft, readImportDraft, saveImportDraft } from "./importDraft";

// A tiny localStorage, since the tests run without a browser.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
      },
      dispatchEvent: () => true,
    },
  });
});

describe("import draft", () => {
  it("round-trips the text and the uploaded pictures", () => {
    saveImportDraft({ text: "---\ntitle: x\n---", uploaded: { knee: "api/question-image/abc" } });
    expect(readImportDraft()).toEqual({ text: "---\ntitle: x\n---", uploaded: { knee: "api/question-image/abc" } });
  });
  it("has nothing after it is cleared", () => {
    saveImportDraft({ text: "something", uploaded: {} });
    clearImportDraft();
    expect(readImportDraft()).toBeNull();
  });
  it("does not let an empty page wipe a saved draft", () => {
    saveImportDraft({ text: "something", uploaded: {} });
    saveImportDraft({ text: "  ", uploaded: {} });
    expect(readImportDraft()?.text).toBe("something");
  });
  it("ignores a damaged draft", () => {
    store.set("pendik:importdraft", JSON.stringify({ text: 5 }));
    expect(readImportDraft()).toBeNull();
  });
});
