import { describe, expect, it } from "vitest";
import { ebookMeta, flashcardSubjects, keyOf, occlusionKeys } from "./content";
import { allSubjects, breadcrumbs, indexablePaths, pageMeta, PRIVATE_PATHS, subjectSections } from "./routeMeta";

describe("pageMeta", () => {
  it("gives every indexable page its own title and a description within the snippet length", () => {
    const paths = indexablePaths();
    const titles = paths.map((p) => pageMeta(p).title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const p of paths) {
      const meta = pageMeta(p);
      expect(meta.indexable, p).toBe(true);
      expect(meta.description.length, p).toBeGreaterThan(40);
      expect(meta.description.length, p).toBeLessThanOrEqual(160);
    }
  });

  it("covers every subject and ebook chapter", () => {
    const paths = indexablePaths();
    for (const s of flashcardSubjects) expect(paths).toContain(`/flashcards/${keyOf(s)}`);
    for (const key of occlusionKeys) expect(paths).toContain(`/occlusion/${key}`);
    for (const s of allSubjects()) expect(paths).toContain(`/subjects/${s.key}`);
    const [key, book] = [...ebookMeta][0];
    expect(paths).toContain(`/ebooks/${key}/${book.chapters[0].id}`);
  });

  it("keeps personal pages and unknown routes out of search", () => {
    for (const p of PRIVATE_PATHS) expect(pageMeta(p).indexable, p).toBe(false);
    expect(pageMeta("/flashcards/9.9/nothing").indexable).toBe(false);
    expect(pageMeta("/nope").indexable).toBe(false);
    expect(pageMeta("/ebooks/1.2/anatomy/chapter-99").indexable).toBe(false);
    expect(pageMeta("/occlusion/1.1/biochem").indexable).toBe(false);
    expect(pageMeta("/subjects/9.9/nothing").indexable).toBe(false);
    expect(pageMeta("/flashcards/1.2/anatomy/occlusion").indexable).toBe(false);
  });

  it("doesn't treat Object.prototype names in the URL as pages", () => {
    for (const p of ["/constructor", "/toString", "/__proto__", "/exam/constructor", "/plan/constructor", "/flashcards/constructor/x"]) {
      expect(pageMeta(p), p).toBeDefined();
      expect(pageMeta(p).indexable, p).toBe(false);
    }
    expect(breadcrumbs("/constructor")).toEqual([{ name: "Home", path: "/" }]);
  });
});

describe("breadcrumbs", () => {
  it("runs from Home through the section to the chapter", () => {
    const [key, book] = [...ebookMeta][0];
    const trail = breadcrumbs(`/ebooks/${key}/${book.chapters[0].id}`);
    expect(trail.map((c) => c.name)).toEqual(["Home", "Ebooks", book.title, book.chapters[0].title]);
    expect(trail.at(-1)!.path).toBe(`/ebooks/${key}/${book.chapters[0].id}`);
  });

  it("puts image occlusion in its own section", () => {
    const trail = breadcrumbs("/occlusion/1.2/anatomy");
    expect(trail.map((c) => c.name).slice(0, 2)).toEqual(["Home", "Image Occlusion"]);
    expect(trail.at(-1)!.path).toBe("/occlusion/1.2/anatomy");
  });

  it("gives every subject page at least one section to link to", () => {
    for (const s of allSubjects()) expect(subjectSections(s.key).length, s.key).toBeGreaterThan(0);
    expect(subjectSections("1.2/anatomy").map((x) => x.path)).toContain("/occlusion/1.2/anatomy");
    expect(breadcrumbs("/subjects/1.2/anatomy").map((c) => c.name).slice(0, 2)).toEqual(["Home", "Subjects"]);
  });
});
