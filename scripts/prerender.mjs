// Runs after `vite build`: writes a static HTML page for every public route, sitemap.xml and
// robots.txt into dist/ (see src/prerender/site.ts). Uses Vite to load the renderer, since the
// app's content modules rely on import.meta.glob.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const dist = "dist";
const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "error",
});

try {
  const { renderSite } = await server.ssrLoadModule("/src/prerender/site.ts");
  const { SITE_ORIGIN } = await server.ssrLoadModule("/src/lib/site.ts");
  const origin = (process.env.SITE_URL || SITE_ORIGIN).replace(/\/+$/, "");
  const template = await readFile(join(dist, "index.html"), "utf8");
  const { files, indexed } = await renderSite(template, origin);
  for (const [path, contents] of files) {
    const out = join(dist, path);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, contents);
  }
  const pages = [...files.keys()].filter((p) => p.endsWith("/index.html")).length;
  const graph = JSON.parse(files.get("knowledge-graph.json") ?? "{\"nodes\":[],\"edges\":[]}");
  console.log(`prerender: ${pages} pages (${indexed.length} in the sitemap), 404.html, sitemap.xml, robots.txt; knowledge map: ${graph.nodes.length} concepts, ${graph.edges.length} links`);
} finally {
  await server.close();
}
