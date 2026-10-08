import { beforeAll, describe, expect, it } from "vitest";
import { buildContentDocs, buildNavigationDocs, loadContentDocs, type SearchDoc } from "./searchIndex";

describe("buildNavigationDocs", () => {
  const docs = buildNavigationDocs();

  it("includes the static top-level pages", () => {
    const ids = docs.map((d) => d.id);
    expect(ids).toContain("home");
    expect(ids).toContain("quizzes");
    expect(ids).toContain("flashcards");
  });

  it("gives every doc a non-empty title and a route starting with /", () => {
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.to.startsWith("/")).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildContentDocs", () => {
  let docs: SearchDoc[] = [];
  beforeAll(async () => {
    docs = await loadContentDocs();
  });

  it("indexes everything but ebooks before the chapters have loaded", () => {
    const partial = buildContentDocs();
    expect(partial.some((d) => d.type === "quiz")).toBe(true);
    expect(partial.some((d) => d.type === "ebook")).toBe(false);
  });

  it("produces at least one flashcard and one quiz doc", () => {
    expect(docs.some((d) => d.type === "flashcard")).toBe(true);
    expect(docs.some((d) => d.type === "quiz")).toBe(true);
  });

  it("gives every content doc a route pointing back to its subject", () => {
    for (const doc of docs) {
      expect(doc.to).toMatch(/^\/(flashcards|quizzes|summaries|ebooks)\//);
    }
  });

  it("produces at least one summary and one ebook doc", () => {
    expect(docs.some((d) => d.type === "summary")).toBe(true);
    expect(docs.some((d) => d.type === "ebook")).toBe(true);
  });

  it("never leaves diagram SVG coordinate noise in a doc's excerpt", () => {
    for (const doc of docs) {
      expect(doc.detail).not.toMatch(/viewBox|stroke-width|<svg/);
    }
  });

  it("has no duplicate ids across the whole content index", () => {
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
