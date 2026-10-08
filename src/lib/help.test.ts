import { describe, expect, it } from "vitest";
import { helpFileIds, helpGroups, helpPages, loadHelpPage } from "./help";
import { headingSlugger } from "./markdownHtml";
import { pageMeta } from "./routeMeta";

/** The ids of every heading in a page, in the reader's order. */
function headingIds(markdown: string): Set<string> {
  const slug = headingSlugger();
  const ids = new Set<string>();
  for (const line of markdown.split("\n")) {
    const m = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (m) ids.add(slug(m[1]));
  }
  return ids;
}

describe("help pages", () => {
  it("lists every Markdown file once, and only those", () => {
    const ids = helpPages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...helpFileIds].sort());
  });

  it("gives every page a title, a group and a description that fits a search snippet", () => {
    for (const p of helpPages) {
      expect(p.title.length, p.id).toBeGreaterThan(2);
      expect(p.group.length, p.id).toBeGreaterThan(2);
      expect(p.description.length, p.id).toBeGreaterThan(40);
      expect(p.description.length, p.id).toBeLessThanOrEqual(158);
    }
    expect(helpGroups().flatMap((g) => g.pages)).toHaveLength(helpPages.length);
  });

  it("starts each page with its title as the only top-level heading", async () => {
    for (const p of helpPages) {
      const markdown = (await loadHelpPage(p.id)) ?? "";
      expect(markdown.split("\n")[0], p.id).toBe(`# ${p.title}`);
      expect(markdown.match(/^# /gm), p.id).toHaveLength(1);
    }
  });

  it("only links to pages and sections that exist", async () => {
    const markdownById = new Map<string, string>();
    for (const p of helpPages) markdownById.set(p.id, (await loadHelpPage(p.id)) ?? "");
    let checked = 0;
    for (const [id, markdown] of markdownById) {
      for (const [, href] of markdown.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        checked++;
        const [path, hash] = href.split("#");
        if (path === "/privacy" || path === "/terms") continue;
        const target = path.startsWith("/docs/") ? markdownById.get(path.slice(6)) : undefined;
        if (path.startsWith("/docs/")) expect(target, `${id} → ${href}`).toBeDefined();
        else if (path !== "/") expect(pageMeta(path).title, `${id} → ${href}`).not.toMatch(/^Page not found/);
        if (hash) expect(headingIds(target ?? markdown).has(hash), `${id} → ${href}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("returns nothing for an unknown or inherited id", async () => {
    await expect(loadHelpPage("nope")).resolves.toBeUndefined();
    await expect(loadHelpPage("__proto__")).resolves.toBeUndefined();
  });
});

describe("help routes", () => {
  it("has a page per help page and none for unknown ids", () => {
    for (const p of helpPages) expect(pageMeta(`/docs/${p.id}`).indexable, p.id).toBe(true);
    expect(pageMeta("/docs").indexable).toBe(true);
    expect(pageMeta("/docs/nope").indexable).toBe(false);
    expect(pageMeta("/docs/constructor").indexable).toBe(false);
    expect(pageMeta("/docs/flashcards/extra").indexable).toBe(false);
  });
});
