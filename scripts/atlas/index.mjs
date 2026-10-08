import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const SYSTEMS = [
  ["skeletal", "Skeleton"],
  ["joints", "Joints and ligaments"],
  ["muscular", "Muscles"],
  ["cardiovascular", "Heart and vessels"],
  ["nervous", "Nervous system"],
  ["visceral", "Organs"],
  ["lymphatic", "Lymphatic system"],
  ["regions", "Skin and regions"],
  ["references", "Planes and directions"],
];
const paths = [], pathIndex = new Map();
const pathOf = (p) => {
  const key = p.join("\u0000");
  if (!pathIndex.has(key)) { pathIndex.set(key, paths.length); paths.push(p); }
  return pathIndex.get(key);
};
const round = (v) => Math.round(v * 1000) / 1000;
const out = { version: 1, systems: [], paths, nodes: {}, landmarks: {}, attachments: [] };
async function info(file) {
  const doc = await io.read(file);
  const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  const tris = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  // Shipped gzipped (the host doesn't compress .glb, and the app unzips it with DecompressionStream):
  // meshopt's output shrinks by about a third more.
  writeFileSync(`${file}.gz`, gzipSync(readFileSync(file), { level: 9 }));
  return { names, tris: Math.round(tris), bytes: statSync(`${file}.gz`).size };
}
for (const [id, label] of SYSTEMS) {
  const meta = JSON.parse(readFileSync(`raw/${id}.json`, "utf8"));
  const { names, tris, bytes } = await info(`web/${id}.glb`);
  const nodes = meta.structures.filter((s) => names.has(s.node)).map((s) => [s.node, pathOf(s.groups)]);
  out.nodes[id] = nodes;
  out.systems.push({ id, label, file: `${id}.glb.gz`, bytes, tris, structures: new Set(nodes.map(([n]) => n.replace(/\.[rl]$/, ""))).size });
  const lm = meta.landmarks.map((l) => [l.name, ...l.at.map(round), l.on && names.has(l.on) ? l.on : ""]);
  if (lm.length) out.landmarks[id] = lm;
  if (meta.attachments.length) {
    const a = await info("web/attachments.glb");
    out.attachments = meta.attachments.filter((x) => a.names.has(x.node)).map((x) => [x.node, x.muscle, x.type === "origin" ? "o" : "i"]);
    out.attachmentsFile = { file: "attachments.glb.gz", bytes: a.bytes, tris: a.tris };
  }
}
writeFileSync("web/atlas.json", JSON.stringify(out));
console.log(out.systems.map((s) => `${s.id} ${s.structures} structures ${s.tris} tris ${(s.bytes / 1e6).toFixed(1)} MB`).join("\n"));
console.log("paths", paths.length, "attachments", out.attachments.length, "landmarks", Object.values(out.landmarks).reduce((n, l) => n + l.length, 0), "index bytes", statSync("web/atlas.json").size);
