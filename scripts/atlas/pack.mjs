// raw.glb → web.glb: weld, simplify to a triangle budget, quantize, meshopt compression.
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplify, quantize, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
const [src, dst, ratioArg, errorArg] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const tris = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
const before = tris();
await doc.transform(
  // Materials stay as they are: they all look alike (no colours in the source), and their names
  // are what the app colours by.
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratioArg), error: Number(errorArg), lockBorder: false }),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 8 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(dst, doc);
console.log(dst, "tris", Math.round(before), "->", Math.round(tris()));
