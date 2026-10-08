// Builds the GitHub wiki from the repo's docs: docs/*.md (developers, content editors,
// deploying) and content/help/ (the student help that's also in the app at /docs). The wiki
// is a copy, regenerated on every push by .github/workflows/wiki.yml; edit the files here.
//
//   node scripts/wiki.mjs [outDir]     (default: wiki-out)
//
// Each page's links are rewritten for the wiki: links between docs become wiki page links,
// help links (/docs/{id}) point at the help pages, other app paths at the live site and
// other repo files at GitHub. A link to a page that doesn't exist fails the build.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

const REPO = "https://github.com/Pendik26/pendik-app";
const BRANCH = "major";
const SITE = "https://pendik-app.vercel.app";
const out = process.argv[2] ?? "wiki-out";

/** "How the numbers are worked out" → "How-the-numbers-are-worked-out" (the wiki's file name). */
const pageName = (title) => title.trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
const titleOf = (markdown, file) => {
  const m = /^# (.+)$/m.exec(markdown);
  if (!m) throw new Error(`${file} has no "# Title" heading`);
  return m[1].trim();
};

// --- Collect the pages -----------------------------------------------------------------

/** repo path ("docs/api.md") → { name, title, markdown, source } */
const pages = new Map();

for (const file of readdirSync("docs").filter((f) => f.endsWith(".md")).sort()) {
  const path = `docs/${file}`;
  const markdown = readFileSync(path, "utf8");
  // The docs index becomes the wiki's home page.
  const name = file === "README.md" ? "Home" : pageName(titleOf(markdown, path));
  pages.set(path, { name, title: titleOf(markdown, path), markdown, source: path });
}

const helpMeta = JSON.parse(readFileSync("content/help/meta.json", "utf8"));
/** help id → wiki page name */
const helpPages = new Map();
for (const page of helpMeta) {
  const path = `content/help/${page.id}.md`;
  const name = pageName(`Help ${page.title}`);
  helpPages.set(page.id, name);
  pages.set(path, { name, title: page.title, markdown: readFileSync(path, "utf8"), source: path, help: page });
}

const names = new Set([...pages.values()].map((p) => p.name));
if (names.size !== pages.size) throw new Error("Two docs pages would get the same wiki name");

// --- Rewrite links ---------------------------------------------------------------------

const problems = [];

function rewrite(href, from) {
  if (/^(?:[a-z]+:|#)/i.test(href)) return href; // external, mailto:, or an anchor on this page
  const [path, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";

  if (from.help || path.startsWith("/")) {
    // App paths, as the help pages use them.
    if (path === "/docs") return `Home#student-help${anchor}`;
    const help = /^\/docs\/([^/]+)$/.exec(path);
    if (help) {
      const name = helpPages.get(help[1]);
      if (!name) problems.push(`${from.source}: no help page "${help[1]}"`);
      return `${name}${anchor}`;
    }
    if (path.startsWith("/")) return `${SITE}${path}${anchor}`;
  }

  // A path relative to the file, inside the repo.
  const target = posix.normalize(posix.join(posix.dirname(from.source), path));
  const page = pages.get(target);
  if (page) return `${page.name}${anchor}`;
  if (target.startsWith("..")) {
    problems.push(`${from.source}: "${href}" leaves the repo`);
    return href;
  }
  const kind = /\.[a-z0-9]+$/i.test(target) ? "blob" : "tree";
  return `${REPO}/${kind}/${BRANCH}/${target.replace(/\/$/, "")}${anchor}`;
}

/** Rewrites Markdown links, leaving fenced code blocks and inline code alone. */
function convert(page) {
  const parts = page.markdown.split(/(^```[\s\S]*?^```$|`[^`\n]*`)/m);
  return parts
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/\]\(([^)\s]+)\)/g, (_, href) => `](${rewrite(href, page)})`),
    )
    .join("");
}

// --- Write the wiki --------------------------------------------------------------------

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const page of pages.values()) {
  let markdown = convert(page);
  if (page.name === "Home") {
    // The home page also lists the student help, grouped as in the app.
    const groups = new Map();
    for (const h of helpMeta) groups.set(h.group, [...(groups.get(h.group) ?? []), h]);
    markdown += `\n## Student help\n\nThe same pages as **Help** in the app ([/docs](${SITE}/docs)).\n`;
    for (const [group, list] of groups) {
      markdown += `\n### ${group}\n\n${list.map((h) => `- [${h.title}](${helpPages.get(h.id)}): ${h.description}`).join("\n")}\n`;
    }
  }
  writeFileSync(join(out, `${page.name}.md`), markdown.trimEnd() + "\n");
}

// In the order the docs index lists them; anything new goes at the end.
const ORDER = ["content-guide", "architecture", "development", "storage-and-sync", "database", "atlas", "atlas-3d", "api", "calculations", "deploying"];
const rank = (p) => {
  const i = ORDER.indexOf(posix.basename(p.source, ".md"));
  return i === -1 ? ORDER.length : i;
};
const devPages = [...pages.values()].filter((p) => !p.help && p.name !== "Home").sort((a, b) => rank(a) - rank(b));
const sidebar = [
  `**[Home](Home)**`,
  "",
  "**Docs**",
  "",
  ...devPages.map((p) => `- [${p.title}](${p.name})`),
  "",
  "**Student help**",
  "",
  ...helpMeta.map((h) => `- [${h.title}](${helpPages.get(h.id)})`),
  "",
];
writeFileSync(join(out, "_Sidebar.md"), sidebar.join("\n"));
writeFileSync(
  join(out, "_Footer.md"),
  `Generated from [docs/](${REPO}/tree/${BRANCH}/docs) and [content/help/](${REPO}/tree/${BRANCH}/content/help) on every push. Edit the files in the repo: changes made here are overwritten.\n`,
);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`wiki: ${pages.size} pages in ${out}/`);
