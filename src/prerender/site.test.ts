import { beforeAll, describe, expect, it } from "vitest";
import { indexablePaths, PRIVATE_PATHS } from "../lib/routeMeta";
import { renderSite, type RenderedSite } from "./site";
import indexHtml from "../../index.html?raw";

const ORIGIN = "https://example.test";
// The source index.html is close enough to the built one: the renderer only swaps head tags and
// fills #root.
const template = indexHtml.replaceAll("%SITE_URL%", ORIGIN);

let site: RenderedSite;
beforeAll(async () => {
  site = await renderSite(template, ORIGIN);
});

const fileFor = (path: string) => (path === "/" ? "index.html" : `${path.slice(1)}/index.html`);

describe("renderSite", () => {
  it("writes a page for every indexable and private route, and nothing for the root shell", () => {
    for (const path of [...indexablePaths(), ...PRIVATE_PATHS]) {
      if (path !== "/") expect(site.files.has(fileFor(path)), path).toBe(true);
    }
    expect(site.files.has("index.html")).toBe(false);
  });

  it("gives each page its own title, description and canonical URL, once", () => {
    for (const path of indexablePaths().filter((p) => p !== "/")) {
      const html = site.files.get(fileFor(path))!;
      expect(html.match(/<title>/g), path).toHaveLength(1);
      expect(html.match(/<h1[\s>]/g), path).toHaveLength(1);
      expect(html.match(/rel="canonical"/g), path).toHaveLength(1);
      expect(html, path).toContain(`<link rel="canonical" href="${ORIGIN}${path}" />`);
      expect(html, path).toContain(`<meta property="og:url" content="${ORIGIN}${path}" />`);
      expect(html, path).not.toContain('name="robots"');
      expect(html, path).toContain('"@type":"BreadcrumbList"');
    }
    for (const path of PRIVATE_PATHS) expect(site.files.get(fileFor(path)), path).toContain('<meta name="robots" content="noindex" />');
  });

  it("puts the chapter text itself in the page", () => {
    const chapter = indexablePaths().find((p) => /^\/ebooks\/[^/]+\/[^/]+\/.+/.test(p))!;
    const html = site.files.get(fileFor(chapter))!;
    const text = html.slice(html.indexOf('<div id="root">')).replace(/<[^>]+>/g, " ");
    expect(text.replace(/\s+/g, " ").length).toBeGreaterThan(2000);
  });

  it("only links to pages that exist", () => {
    const known = new Set(["/", "/privacy", "/terms", ...indexablePaths(), ...PRIVATE_PATHS]);
    for (const [file, html] of site.files) {
      if (!file.endsWith(".html")) continue;
      const body = html.slice(html.indexOf('<div id="root">'));
      for (const [, href] of body.matchAll(/href="(\/[^"#?]*)"/g)) {
        if (href.startsWith("/ebook-figures/")) continue;
        expect(known.has(href), `${file} → ${href}`).toBe(true);
      }
    }
  });

  it("lists every indexable page in the sitemap and points robots.txt at it", () => {
    const sitemap = site.files.get("sitemap.xml")!;
    for (const path of indexablePaths()) expect(sitemap).toContain(`<loc>${ORIGIN}${path}</loc>`);
    for (const path of PRIVATE_PATHS) expect(sitemap).not.toContain(`<loc>${ORIGIN}${path}</loc>`);
    const robots = site.files.get("robots.txt")!;
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).toContain("Disallow: /api/");
  });

  it("never publishes past-paper exam questions", async () => {
    const { examPackagesByBlock } = await import("../lib/content");
    const first = [...examPackagesByBlock.values()].flat().at(0);
    const question = first ? (await first.load()).at(0)?.question : undefined;
    // An empty check would pass without proving anything.
    expect(question, "an exam question to look for").toBeTruthy();
    if (!question) return;
    const needle = question.slice(0, 40).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    for (const [file, html] of site.files) expect(html.includes(needle), file).toBe(false);
  });
});
