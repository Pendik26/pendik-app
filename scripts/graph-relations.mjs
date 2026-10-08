// "AI on top" for the knowledge map: asks the site's AI gateway how the most strongly linked
// concepts relate ("innervates", "part of", "type of"…) and saves the answers to
// content/graph/relations.json, which the map's build reads. Run it after content changes:
//
//   AI_BASE_URL=… AI_API_KEY=… AI_MODEL=… npm run graph:relations [-- --limit 400]
//
// Only labels links that don't have one yet; commit the JSON file afterwards.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const FILE = "content/graph/relations.json";
const BATCH = 25;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 400;

const base = process.env.AI_BASE_URL?.replace(/\/+$/, "");
const key = process.env.AI_API_KEY;
const model = process.env.AI_MODEL?.split(",")[0]?.trim();
if (!base || !key || !model) {
  console.error("Set AI_BASE_URL, AI_API_KEY and AI_MODEL (the same values as the site uses).");
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "error" });
let graph;
try {
  graph = await (await server.ssrLoadModule("/src/lib/knowledgeGraph/build.ts")).buildFromContent();
} finally {
  await server.close();
}

const existing = JSON.parse(await readFile(FILE, "utf8").catch(() => "{}"));
const termOf = (n) => n.id.replace(/-/g, " ");
const subjects = (n) => [...new Set(n.subjects.map((s) => s.split("/")[1]))].join(", ");
const todo = graph.edges
  .map((e) => {
    const [a, b] = [graph.nodes[e.s], graph.nodes[e.t]].sort((x, y) => termOf(x).localeCompare(termOf(y)));
    return { a, b, w: e.w, key: `${termOf(a)}|${termOf(b)}` };
  })
  .filter((p) => !existing[p.key])
  .sort((x, y) => y.w - x.w)
  .slice(0, LIMIT);

console.log(`${todo.length} links to label (${Object.keys(existing).length} already labelled).`);

const SYSTEM =
  "You label links in a medical-school knowledge map. For each numbered pair of concepts, say how the FIRST relates to the SECOND in 1 to 4 lowercase words, such as: part of, type of, layer of, innervates, supplies, binds to, made of, regulates, causes, found in, attaches to, opposes. If there is no specific relationship, answer: related to. Reply with only a JSON object mapping each pair number to its phrase.";

async function ask(batch) {
  const lines = batch.map((p, i) => `${i + 1}. ${p.a.label} (${subjects(p.a)}) → ${p.b.label} (${subjects(p.b)})`).join("\n");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: 900, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: lines }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`gateway answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = (await res.json()).choices?.[0]?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json || "{}");
}

const clean = (v) =>
  typeof v === "string"
    ? v.toLowerCase().replace(/[^a-z ,'-]/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ")
    : "";

let added = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  try {
    const answers = await ask(batch);
    batch.forEach((p, j) => {
      const rel = clean(answers[String(j + 1)]);
      if (rel && rel !== "related to") {
        existing[p.key] = rel;
        added += 1;
      }
    });
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  } catch (err) {
    console.error(`  batch ${i / BATCH + 1} failed: ${err.message}`);
  }
  const sorted = Object.fromEntries(Object.entries(existing).sort(([x], [y]) => x.localeCompare(y)));
  await writeFile(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}
console.log(`Labelled ${added} links. Rebuild (npm run build) to put them on the map.`);
