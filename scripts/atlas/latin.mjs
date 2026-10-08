// web/latin.json: the Latin (Terminologia Anatomica) name of every structure, group and
// landmark in the atlas, from Z-Anatomy's translation table: { "Femur": "Os femoris", … }.
// Run from the work folder (see build.sh), after index.mjs.
import { readFileSync, statSync, writeFileSync } from "node:fs";

const table = readFileSync("zanat/Resources/Descriptions/OriginalDescriptions/Translations.txt", "utf8").split(/\r?\n/);
const header = table[0].split(";");
const LATIN = header.indexOf("Latin");
const latin = new Map();
for (const line of table.slice(1)) {
  const cols = line.split(";");
  const en = cols[0]?.trim();
  const la = cols[LATIN]?.trim();
  if (en && la && !latin.has(en.toLowerCase())) latin.set(en.toLowerCase(), la);
}

const index = JSON.parse(readFileSync("web/atlas.json", "utf8"));
// The names as the app shows them: no Blender suffixes, no side, no brackets.
const plain = (n) => n.replace(/\.\d{3}$/, "").replace(/\.[rl]$/, "").replace(/^\((.*)\)$/, "$1").trim();
const names = new Set([
  ...Object.values(index.nodes).flatMap((list) => list.map(([node]) => plain(node))),
  ...index.paths.flat(),
  ...Object.values(index.landmarks).flatMap((list) => list.map(([name]) => plain(name))),
  ...index.attachments.map(([, muscle]) => plain(muscle)),
]);

const out = {};
for (const name of [...names].sort()) {
  const la = latin.get(name.toLowerCase());
  if (la) out[name] = la;
}
writeFileSync("web/latin.json", JSON.stringify(out));
console.log("latin", Object.keys(out).length, "of", names.size, "names,", statSync("web/latin.json").size, "bytes");
