// Build-time prerender (run by scripts/prerender.mjs after `vite build`): one static HTML page
// per public route, plus sitemap.xml and robots.txt. Each page is the app's index.html with
// that route's title, description, canonical URL and breadcrumbs, and a plain-HTML version of
// its content inside #root. Search engines read that directly; for people, the splash covers it
// and React replaces it as soon as the app starts, exactly as on any other route.

import { renderMarkdown } from "../lib/markdownHtml";
import { itemAt } from "../lib/arrays";
import { buildFromContent } from "../lib/knowledgeGraph/build";
import { encodeGraph } from "../lib/knowledgeGraph/wire";
import type { KnowledgeGraph } from "../lib/knowledgeGraph/types";
import { groupByBlock, studyBlocks } from "../lib/blocks";
import {
  ebookMeta,
  ebookSubjects,
  examPackagesByBlock,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  loadEbookChapter,
  loadOcclusionNotes,
  occlusionKeys,
  modulesByBlockSubject,
  moduleSubjects,
  quizBanks,
  quizQuestionsInBlock,
  quizSubjects,
  subjectKey,
  summaries,
  summarySubjects,
} from "../lib/content";
import { allSubjects, blockHasExam, breadcrumbs, indexablePaths, pageMeta, PRIVATE_PATHS, subjectSections, type PageMeta } from "../lib/routeMeta";
import { helpGroups, helpPages, loadHelpPage } from "../lib/help";
import { findLabActivity, labExercises } from "../lib/labActivities";
import { SITE_NAME } from "../lib/site";
import type { Subject } from "../types/content";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SECTION_LINKS: [string, string][] = [
  ["/subjects", "Subjects"],
  ["/flashcards", "Flashcards"],
  ["/occlusion", "Image Occlusion"],
  ["/quizzes", "Quizzes"],
  ["/exam", "Exam"],
  ["/modules", "Modules"],
  ["/ebooks", "Ebooks"],
  ["/summaries", "Summaries"],
  ["/lab", "Virtual Lab"],
  ["/docs", "Help"],
];

function subjectList(section: string, subjects: Subject[], detail: (s: Subject) => string): string {
  return groupByBlock(subjects)
    .filter((group) => group.subjects.length > 0)
    .map(
      (group) =>
        `<h2>${esc(group.block.label)}</h2><ul>${group.subjects
          .map((s) => `<li><a href="/${section}/${keyOf(s)}">${esc(s.label)}</a> ${esc(detail(s))}</li>`)
          .join("")}</ul>`,
    )
    .join("");
}

/** Built once per render: the knowledge map's data, also written out as /knowledge-graph.json. */
let mapGraph: KnowledgeGraph | null = null;

const atlasFiles = import.meta.glob<{ systems: { label: string; structures: number }[] }>("/public/atlas/atlas.json", { eager: true, import: "default" });

/** The atlas's body systems, for search engines and readers without JavaScript. */
function atlasContent(): string {
  const atlas = Object.values(atlasFiles).at(0);
  if (!atlas) return "";
  return `<ul>${atlas.systems.map((s) => `<li>${esc(s.label)}: ${s.structures} structures</li>`).join("")}</ul><p>3D models from Z-Anatomy (CC BY-SA 4.0), based on BodyParts3D.</p>`;
}

/** The map's concepts as a plain list, for search engines and readers without JavaScript. */
function mapContent(): string {
  if (!mapGraph) return "";
  const top = [...mapGraph.nodes].sort((a, b) => b.mentions - a.mentions).slice(0, 150);
  const where = (c: string, a: string) => (c.startsWith("summary:") ? `/summaries/${c.slice(8)}#${a}` : `/ebooks/${c}#${a}`);
  return `<ul>${top
    .map((n) => {
      const s = n.sections.at(0);
      const name = esc(n.label);
      return `<li>${s ? `<a href="${where(s.c, s.a)}">${name}</a>` : name}</li>`;
    })
    .join("")}</ul>`;
}

async function content(path: string): Promise<string> {
  const parts = path.split("/").filter(Boolean);
  const [section, blockId, subjectId, chapterId] = parts;
  const key = blockId && subjectId ? subjectKey(blockId, subjectId) : "";

  switch (parts.length === 1 ? section : `${section}/*`) {
    case "map":
      return mapContent();
    case "atlas":
      return atlasContent();
    case "docs":
      return helpGroups()
        .map((g) => `<h2>${esc(g.label)}</h2><ul>${g.pages.map((p) => `<li><a href="/docs/${p.id}">${esc(p.title)}</a>: ${esc(p.description)}</li>`).join("")}</ul>`)
        .join("");
    case "docs/*": {
      const i = helpPages.findIndex((p) => p.id === blockId);
      const prev = itemAt(helpPages, i - 1);
      const next = itemAt(helpPages, i + 1);
      const pager = [
        prev && `<a href="/docs/${prev.id}" rel="prev">← ${esc(prev.title)}</a>`,
        next && `<a href="/docs/${next.id}" rel="next">${esc(next.title)} →</a>`,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<article>${renderMarkdown((await loadHelpPage(blockId)) ?? "")}</article><p>${pager}</p>`;
    }
    case "flashcards":
      return subjectList("flashcards", flashcardSubjects, (s) => `(${flashcardDecks.get(keyOf(s))?.length ?? 0} cards)`);
    case "quizzes":
      return subjectList("quizzes", quizSubjects, (s) => `(${quizBanks.get(keyOf(s))?.length ?? 0} questions)`);
    case "modules":
      return subjectList("modules", moduleSubjects, (s) => `(${modulesByBlockSubject.get(keyOf(s))?.length ?? 0} modules)`);
    case "summaries":
      return subjectList("summaries", summarySubjects, () => "");
    case "ebooks":
      return `<ul>${ebookSubjects
        .map((s) => {
          const book = ebookMeta.get(keyOf(s));
          return book ? `<li><a href="/ebooks/${keyOf(s)}">${esc(book.title)}</a>: ${esc(book.description)}</li>` : "";
        })
        .join("")}</ul>`;
    case "lab":
      return labExercises
        .map(
          (e) =>
            `<h2>${esc(e.title)}</h2><p>${esc(e.description)}</p><ol>${e.activities
              .map((a) => `<li><a href="/lab/${e.id}/${a.slug}">${esc(a.title)}</a>: ${esc(a.summary)}</li>`)
              .join("")}</ol>`,
        )
        .join("");
    case "lab/*": {
      const found = findLabActivity(blockId, subjectId);
      if (!found) return "";
      const { activity } = found;
      return [
        `<h2>Background</h2>${activity.background.map((p) => `<p>${esc(p)}</p>`).join("")}`,
        `<h2>Steps</h2><ol>${activity.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>`,
        `<h2>What you should find</h2><p>${esc(activity.expected)}</p>`,
        `<h2>Check your understanding</h2><ol>${activity.questions.map((q) => `<li>${esc(q.question)}</li>`).join("")}</ol>`,
      ].join("");
    }
    case "exam":
      return `<ul>${studyBlocks
        .filter((b) => blockHasExam(b.id))
        .map((b) => `<li><a href="/exam/${b.id}">${esc(b.label)}</a></li>`)
        .join("")}</ul>`;

    case "subjects":
      return groupByBlock(allSubjects())
        .filter((g) => g.subjects.length > 0)
        .map((g) => `<h2>${esc(g.block.label)}</h2><ul>${g.subjects.map((s) => `<li><a href="/subjects/${s.key}">${esc(s.label)}</a></li>`).join("")}</ul>`)
        .join("");
    case "subjects/*":
      return `<ul>${subjectSections(key)
        .map((s) => `<li><a href="${s.path}">${esc(s.name)}</a></li>`)
        .join("")}</ul>${(ebookMeta.get(key)?.chapters ?? []).length ? `<h2>Chapters</h2><ol>${(ebookMeta.get(key)?.chapters ?? []).map((c) => `<li><a href="/ebooks/${key}/${c.id}">${esc(c.title)}</a></li>`).join("")}</ol>` : ""}`;
    case "occlusion":
      return `<ul>${occlusionKeys.map((k) => `<li><a href="/occlusion/${k}">${esc(flashcardSubjects.find((s) => keyOf(s) === k)?.label ?? k)}</a></li>`).join("")}</ul>`;
    case "occlusion/*": {
      const notes = (await loadOcclusionNotes(key)) ?? [];
      return `<h2>Figures</h2><ul>${notes.map((n) => `<li>${esc(n.title)} (${n.masks.length} labels)</li>`).join("")}</ul>`;
    }
    case "flashcards/*":
      return `<h2>Cards in this deck</h2><ul>${(flashcardDecks.get(key) ?? []).map((c) => `<li>${esc(c.front)}</li>`).join("")}</ul>`;
    case "quizzes/*":
      return `<h2>Questions</h2><ol>${(quizBanks.get(key) ?? []).map((q) => `<li>${esc(q.question)}</li>`).join("")}</ol>`;
    case "modules/*":
      return `<ul>${(modulesByBlockSubject.get(key) ?? []).map((m) => `<li>${esc(m.name)}</li>`).join("")}</ul>`;
    case "summaries/*":
      return `<article>${renderMarkdown(summaries.get(key) ?? "")}</article>`;
    case "exam/*": {
      // Past papers belong to the institution: list the exams, never their questions.
      const packages = examPackagesByBlock.get(blockId) ?? [];
      if (packages.length === 0) {
        return `<p>A timed exam drawn from the block's ${quizQuestionsInBlock(blockId).length} quiz questions.</p>`;
      }
      const shown = subjectId ? packages.filter((p) => p.id === subjectId) : packages;
      return `<ul>${shown
        .map((p) => `<li>${packages.length > 1 && !subjectId ? `<a href="/exam/${blockId}/${p.id}">${esc(p.name)}</a>` : esc(p.name)}: ${p.questionCount} questions, timed</li>`)
        .join("")}</ul>`;
    }
    case "ebooks/*": {
      const book = ebookMeta.get(key);
      if (!book) return "";
      const toc = `<h2>Chapters</h2><ol>${book.chapters
        .map((c) => `<li><a href="/ebooks/${key}/${c.id}">${esc(c.title)}</a></li>`)
        .join("")}</ol>`;
      if (!chapterId) return toc;
      const i = book.chapters.findIndex((c) => c.id === chapterId);
      const markdown = (await loadEbookChapter(`${key}/${chapterId}`)) ?? "";
      const prev = itemAt(book.chapters, i - 1);
      const next = itemAt(book.chapters, i + 1);
      const pager = [
        prev && `<a href="/ebooks/${key}/${prev.id}" rel="prev">← ${esc(prev.title)}</a>`,
        next && `<a href="/ebooks/${key}/${next.id}" rel="next">${esc(next.title)} →</a>`,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<article>${renderMarkdown(markdown)}</article><p>${pager}</p>${toc}`;
    }
    default:
      return `<p>Open <a href="/">${SITE_NAME}</a> to use this page.</p>`;
  }
}

function breadcrumbJsonLd(path: string, origin: string): string {
  const trail = breadcrumbs(path);
  if (trail.length < 2) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${origin}${c.path}` })),
  };
  // "<" can't end the script element early once escaped.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/** Swaps one tag's attribute value in the template; throws if the tag is missing. */
function setTag(html: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(html)) throw new Error(`Prerender: index.html is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

function setMetaTag(html: string, attr: "name" | "property", key: string, replacement: string): string {
  const tags = html.match(/<meta\s+(?:name|property)="[^"]+"\s+content="[^"]*"\s*\/?>/g) ?? [];
  const tag = tags.find((candidate) => candidate.includes(`${attr}="${key}"`));
  if (!tag) throw new Error(`Prerender: index.html is missing meta ${attr}="${key}"`);
  return html.replace(tag, replacement);
}

export function renderPage(template: string, path: string, meta: PageMeta, body: string, origin: string): string {
  const url = `${origin}${path}`;
  const title = esc(meta.title);
  const description = esc(meta.description);
  let html = template;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = setMetaTag(html, "name", "description", `<meta name="description" content="${description}" />`);
  html = setTag(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(url)}" />`);
  html = setMetaTag(html, "property", "og:url", `<meta property="og:url" content="${esc(url)}" />`);
  html = setMetaTag(html, "property", "og:title", `<meta property="og:title" content="${title}" />`);
  html = setMetaTag(html, "property", "og:description", `<meta property="og:description" content="${description}" />`);
  html = setMetaTag(html, "name", "twitter:title", `<meta name="twitter:title" content="${title}" />`);
  html = setMetaTag(html, "name", "twitter:description", `<meta name="twitter:description" content="${description}" />`);
  const extraHead = [meta.indexable ? "" : `<meta name="robots" content="noindex" />`, breadcrumbJsonLd(path, origin)].join("");
  html = html.replace("</head>", `${extraHead}</head>`);
  // The home page's no-JavaScript description; this page has its own content.
  html = html.replace(/\s*<noscript>\s*<main[\s\S]*?<\/main>\s*<\/noscript>/, "");
  return setTag(html, /<div id="root"><\/div>/, `<div id="root">${body}</div>`);
}

async function pageBody(path: string, meta: PageMeta): Promise<string> {
  const trail = breadcrumbs(path);
  const nav = `<nav aria-label="Sections"><a href="/">${SITE_NAME}</a> ${SECTION_LINKS.map(([href, name]) => `<a href="${href}">${name}</a>`).join(" ")}</nav>`;
  const crumbs =
    trail.length > 1
      ? `<nav aria-label="Breadcrumb"><ol>${trail.map((c) => `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join("")}</ol></nav>`
      : "";
  const main = await content(path);
  // Chapters and summaries start with their own heading; one <h1> per page.
  const heading = /^<article>\s*<h1/.test(main) ? "" : `<h1>${esc(meta.title.replace(` · ${SITE_NAME}`, ""))}</h1>`;
  const footer = `<footer><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>`;
  return `<div class="prerender">${nav}${crumbs}${heading}<p>${esc(meta.description)}</p>${main}${footer}</div>`;
}

export interface RenderedSite {
  /** Output path relative to dist → file contents. */
  files: Map<string, string>;
  indexed: string[];
}

/** Everything the prerender step writes, from the built index.html. */
export async function renderSite(template: string, origin: string): Promise<RenderedSite> {
  const files = new Map<string, string>();
  const indexed = indexablePaths();
  mapGraph = await buildFromContent();
  files.set("knowledge-graph.json", JSON.stringify(encodeGraph(mapGraph)));
  for (const path of [...indexed, ...PRIVATE_PATHS]) {
    // The root index.html stays the app shell (the service worker caches it); every other
    // route gets its own page.
    if (path === "/") continue;
    const meta = pageMeta(path);
    files.set(`${path.slice(1)}/index.html`, renderPage(template, path, meta, await pageBody(path, meta), origin));
  }

  // Served by Vercel, with a 404 status, for any URL with no page of its own. It's the app shell,
  // so a route that exists in the app but has no prerendered page still works for people.
  const notFound: PageMeta = { title: `Page not found · ${SITE_NAME}`, description: pageMeta("/").description, indexable: false };
  files.set(
    "404.html",
    renderPage(template, "/404", notFound, `<div class="prerender"><h1>Page not found</h1><p><a href="/">Go to ${SITE_NAME}</a></p></div>`, origin),
  );

  const urls = [...indexed, "/privacy", "/terms"];
  files.set(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((p) => `  <url><loc>${esc(origin + p)}</loc></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  files.set(
    "robots.txt",
    [
      "User-agent: *",
      "Allow: /",
      "# Course material that belongs to its authors: lecture PDFs, slide figures and past exam",
      "# paper images.",
      "Disallow: /*.pdf$",
      "Disallow: /ebook-figures/",
      "Disallow: /exams/",
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"),
  );
  return { files, indexed };
}
