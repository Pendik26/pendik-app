// The 3D anatomy atlas's data (public/atlas/, converted from Z-Anatomy by scripts/atlas/): the
// index of body systems, structures and landmarks, and the helpers the page and viewer share.
// Structure names come from the models' node names: "Parietal bone.r" is the right parietal bone.

export const ATLAS_BASE = "/atlas/";

export interface AtlasSystem {
  id: string;
  label: string;
  file: string;
  bytes: number;
  tris: number;
  /** Distinct structures, left and right counted once. */
  structures: number;
}

export interface AtlasIndex {
  version: 1;
  systems: AtlasSystem[];
  /** Group paths ("Axial skeleton" › "Cranium"…), referred to by index. */
  paths: string[][];
  /** Per system: [node name, path index]. */
  nodes: Record<string, [string, number][]>;
  /** Per system: [name, x, y, z, node it's on (or "")]. Metres, Y up. */
  landmarks: Record<string, [string, number, number, number, string][]>;
  /** Muscle attachment areas on the bones: [node, muscle, "o" origin | "i" insertion]. */
  attachments: [string, string, "o" | "i"][];
  attachmentsFile?: { file: string; bytes: number; tris: number };
}

/** The layer of muscle attachment areas, shown over the skeleton. */
export const ATTACHMENTS = "attachments";

export type Side = "r" | "l" | null;

/** "Parietal bone.r" → the right parietal bone; "(Accessory pancreas)" → "Accessory pancreas". */
export function parseNode(node: string): { name: string; side: Side } {
  const plain = node.replace(/\.\d{3}$/, "");
  const m = /^(.*)\.([rl])$/.exec(plain);
  const name = (m ? m[1] : plain).replace(/^\((.*)\)$/, "$1").trim();
  return { name, side: m ? (m[2] as "r" | "l") : null };
}

/** The side as anatomists write it on its own: dextra (right) or sinistra (left). */
export const sideLabel = (side: Side) => (side === "r" ? "Dextra" : side === "l" ? "Sinistra" : "");
/** The side in plain English, for screen readers and tooltips. */
export const sideEnglish = (side: Side) => (side === "r" ? "Right" : side === "l" ? "Left" : "");
/** The short form, as in "Femur (dx)". */
export const sideShort = (side: Side) => (side === "r" ? "dx" : side === "l" ? "sin" : "");

/** Latin (Terminologia Anatomica) names by English name, from Z-Anatomy's translation table. */
export type LatinNames = Readonly<Record<string, string>>;

export const latinOf = (latin: LatinNames | null, name: string): string | null => latin?.[name] ?? null;

// The gender of a Latin head noun, so the side agrees with it: ren dexter, scapula dextra,
// os femoris dextrum. Most follow their ending; these are the exceptions the atlas meets.
const MASCULINE = new Set(["ren", "lien", "pulmo", "tendo", "margo", "dens", "pons", "mons", "pes", "paries", "venter", "testis", "canalis", "unguis", "cortex", "apex", "thorax", "pharynx", "larynx", "index", "hallux", "pollex", "funiculus", "sanguis", "orbis", "axis", "vertex", "meatus", "porus", "humerus", "fornix"]);
const FEMININE = new Set(["manus", "auris", "naris", "cutis", "pelvis", "basis", "radix", "cervix", "calx", "frons", "cartilago", "regio", "articulatio", "pars", "facies", "glandula", "cavitas", "tunica", "lamina", "incisura", "fossa", "valva", "vena", "arteria", "spina", "crista", "linea", "tuberositas", "fovea", "papilla", "membrana", "vesica", "tuba", "ampulla", "insula", "fissura", "commissura", "capsula", "vagina", "bursa", "trochlea", "patella", "scapula", "clavicula", "costa", "ulna", "tibia", "fibula", "phalanx", "mandibula", "maxilla", "vertebra", "mamma", "lingua", "tonsilla", "pleura", "aorta", "glans", "lens", "cornea", "retina", "sclera", "chorda", "ansa", "rima", "plica", "lingula", "uvula", "concha", "mamma", "squama", "epididymis"]);
const NEUTER = new Set(["os", "cor", "corpus", "pectus", "latus", "tempus", "caput", "femur", "hepar", "abdomen", "foramen", "rete", "calcar", "pancreas", "ganglion", "ligamentum", "septum", "labium", "atrium", "cerebrum", "cerebellum", "mesenterium", "omentum", "ovarium", "rectum", "duodenum", "jejunum", "ileum", "colon", "sternum", "sacrum", "occiput", "ilium", "ischium", "acetabulum", "olecranon", "acromion", "tegmen", "velum", "frenulum", "retinaculum", "crus", "genu", "cornu", "tuberculum", "encephalon", "diaphragma", "systema", "stroma", "infundibulum", "vas", "manubrium", "chiasma", "platysma"]);
type Gender = "m" | "f" | "n" | "mp" | "fp";
function genderOf(latinName: string): Gender {
  const head = latinName.trim().replace(/^\(/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  if (NEUTER.has(head)) return "n";
  if (FEMININE.has(head)) return "f";
  if (MASCULINE.has(head)) return "m";
  if (/ae$/.test(head)) return "fp";
  // Third-declension plurals: partes, radices (feminine); rotatores, levatores (masculine).
  if (/es$/.test(head) && head !== "pes" && head !== "stapes" && head !== "facies") return /^(partes|radices|regiones|articulationes)$/.test(head) ? "fp" : "mp";
  if (/i$/.test(head)) return "mp";
  if (/ma$/.test(head)) return "n"; // Greek neuters: chiasma, stroma, platysma
  if (/a$/.test(head)) return "f"; // feminine singular, or a neuter plural: both take "dextra"
  if (/(um|on|ur|ut|e|ar|en)$/.test(head)) return "n";
  if (/(io|go|do|tas|is|x)$/.test(head)) return "f";
  return "m";
}
const SIDE_FORMS: Record<Gender, [string, string]> = {
  m: ["dexter", "sinister"],
  f: ["dextra", "sinistra"],
  n: ["dextrum", "sinistrum"],
  mp: ["dextri", "sinistri"],
  fp: ["dextrae", "sinistrae"],
};

/** A Latin name with its side, the adjective agreeing with the head noun: "Ren dexter". */
export function latinWithSide(latinName: string, side: Side): string {
  if (!side) return latinName;
  // Names that already carry a side ("Atrium dextrum") keep it.
  if (/\b(dext|sinist)/i.test(latinName)) return latinName;
  const [right, left] = SIDE_FORMS[genderOf(latinName)];
  return `${latinName} ${side === "r" ? right : left}`;
}

// Greek roots behind the clinical words (nephritis, pneumonia, arthritis…), shown beside the
// Latin, never instead of it. The first match wins.
const GREEK: [RegExp, string][] = [
  [/\b(suprarenal|adrenal) gland\b/i, "epinephros"],
  [/^kidney$/i, "nephros"],
  [/\blung\b/i, "pneumon"],
  [/^heart$/i, "kardia"],
  [/^(uterus|body of uterus)$/i, "hystera, metra"],
  [/^ovary$/i, "oophoron"],
  [/^testis$/i, "orchis"],
  [/\b(mammary gland|breast)\b/i, "mastos"],
  [/^eyeball$/i, "ophthalmos"],
  [/^tongue$/i, "glossa"],
  [/^gallbladder$/i, "cholecystis"],
  [/^urinary bladder$/i, "kystis"],
  [/^spleen$/i, "splen"],
  [/^rectum$/i, "proktos"],
  [/^small intestine$/i, "enteron"],
  [/^spinal cord$/i, "myelos"],
  [/^(skin|integument)$/i, "derma"],
  [/^(oral cavity|mouth)$/i, "stoma"],
  [/^(external )?nose$/i, "rhis"],
  [/\bvertebra\b/i, "spondylos"],
  [/\bjoint\b/i, "arthron"],
  [/\bvein\b/i, "phleps"],
  [/\bcartilage\b/i, "chondros"],
  [/\bgland\b/i, "aden"],
];

/** The Greek root of an English structure name, where clinical terms come from it. */
export function greekRoot(name: string): string | null {
  for (const [re, root] of GREEK) if (re.test(name)) return root;
  return null;
}

/** The name a structure's description is filed under (as the models write it). */
export const descriptionKey = (node: string) => node.replace(/\.\d{3}$/, "").replace(/\.[rl]$/, "");

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** A muscle red, nudged per action group so neighbouring muscles can be told apart. */
function muscleTone(material: string): string {
  const h = Math.abs(hash(material));
  const hue = 2 + (h % 14);
  const light = 38 + ((h >> 4) % 10);
  // Comma form: the one three.js's colour parser reads.
  return `hsl(${hue}, 52%, ${light}%)`;
}

/** Tissue colours, from the models' material names (the files carry no colours of their own). */
const TISSUES: [RegExp, string][] = [
  [/^origin-/i, "#d64a4a"],
  [/^end-/i, "#3f7fd6"],
  [/pulmonary artery/i, "#4a72c4"],
  [/pulmonary vein/i, "#c8473e"],
  [/arter/i, "#c4302b"],
  [/vein/i, "#3a5fb0"],
  [/^skin-in/i, "#c98f74"],
  [/skin/i, "#d9a98a"],
  [/^nail/i, "#eadad2"],
  [/^black/i, "#303030"],
  [/cartilage/i, "#a9c7d6"],
  [/suture/i, "#b9ab8c"],
  [/^bone/i, "#e3d7bd"],
  [/articular capsule/i, "#b8b0d6"],
  [/ligament/i, "#cfc59a"],
  [/tendon/i, "#ece4d2"],
  [/bursa/i, "#9dc2e0"],
  [/fascia/i, "#d9cdb4"],
  [/^fat/i, "#e8cf72"],
  [/white matter/i, "#efe7da"],
  [/grey matter|gray matter/i, "#b9a7a0"],
  [/nucleus/i, "#c98a7a"],
  [/nerve|ganglion|spinal cord/i, "#e3c548"],
  [/brain|lobe|cerebell|gyr|sulc|cortex|ventric/i, "#e7b9b0"],
  [/lymph/i, "#6fae5c"],
  [/gland/i, "#d8a35a"],
  [/lung/i, "#e6a3a3"],
  [/bronch/i, "#d9c7a8"],
  [/mucosa/i, "#d98a8a"],
  [/intestine/i, "#d9a07a"],
  [/ductus/i, "#8fbf8f"],
  [/peritoneum/i, "#d8c6a0"],
  [/organ/i, "#c97c6a"],
  [/direction|movement|plane|line/i, "#8a9a96"],
];

export function tissueColor(material: string, system: string): string {
  const name = material.replace(/\.\d{3}$/, "");
  for (const [re, color] of TISSUES) if (re.test(name)) return color;
  if (system === "muscular" || system === "cardiovascular") return muscleTone(name);
  if (system === "skeletal") return "#e3d7bd";
  return "#c8c0b0";
}

/** How see-through a system starts: skin and the reference planes would hide everything. */
export const defaultOpacity = (system: string) => (system === "regions" ? 0.55 : system === "references" ? 0.4 : 1);

export interface AtlasHit {
  system: string;
  node: string;
  name: string;
  side: Side;
  path: string[];
  /** The Latin name, when the atlas has one. */
  latin?: string;
}

/** Every structure, once per side, for search and lookups. */
export function allStructures(index: AtlasIndex, latin: LatinNames | null = null): AtlasHit[] {
  return index.systems.flatMap((s) =>
    (index.nodes[s.id] ?? []).map(([node, p]) => {
      const parsed = parseNode(node);
      const la = latinOf(latin, parsed.name);
      return { system: s.id, node, ...parsed, path: index.paths[p] ?? [], ...(la ? { latin: la } : {}) };
    }),
  );
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Structures whose English or Latin name contains every word typed, or whose group does
 * ("femur", "os femoris", "deltoid", "cranial nerve"). Left and right count as one result;
 * names starting with the query first.
 */
export function searchAtlas(all: readonly AtlasHit[], query: string, limit = 40): AtlasHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const seen = new Set<string>();
  const scored: { hit: AtlasHit; score: number }[] = [];
  for (const hit of all) {
    const key = `${hit.system}|${hit.name}`;
    if (seen.has(key)) continue;
    const name = fold(hit.name);
    const latin = fold(hit.latin ?? "");
    const where = fold(hit.path.join(" "));
    if (!words.every((w) => name.includes(w) || latin.includes(w) || where.includes(w))) continue;
    seen.add(key);
    const inName = words.filter((w) => name.includes(w) || latin.includes(w)).length;
    const first = words[0] ?? "";
    const starts = name.startsWith(first) || (latin !== "" && latin.startsWith(first));
    scored.push({ hit, score: (starts ? 100 : 0) + inName * 10 - name.length / 100 });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map((s) => s.hit);
}

/** The short description of a structure, if the atlas has one (from Z-Anatomy, after Wikipedia). */
export function describeStructure(descriptions: Readonly<Record<string, string>> | null, node: string): string | null {
  if (!descriptions) return null;
  const key = descriptionKey(node);
  return descriptions[key] ?? descriptions[`(${key})`] ?? descriptions[parseNode(node).name] ?? null;
}

export const formatMB = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e6 ? 1 : 1)} MB`;

/**
 * The attachment areas of a muscle: its own, or the whole muscle's for one of its parts
 * ("Clavicular part of deltoid muscle" attaches where the deltoid does).
 */
export function attachmentsFor(index: AtlasIndex, muscle: string): { node: string; type: "o" | "i" }[] {
  const name = parseNode(muscle).name.toLowerCase();
  return index.attachments
    .filter(([, m]) => {
      const of = parseNode(m).name.toLowerCase();
      return of === name || name.endsWith(` of ${of}`) || of.endsWith(` of ${name}`);
    })
    .map(([node, , type]) => ({ node, type }));
}

/** Each layer's model: its URL, versioned by its size so a new model replaces the cached one. */
export function atlasFiles(index: AtlasIndex): Record<string, { url: string; bytes: number }> {
  const files: Record<string, { url: string; bytes: number }> = {};
  const add = (id: string, f: { file: string; bytes: number }) => {
    files[id] = { url: `${ATLAS_BASE}${f.file}?v=${f.bytes}`, bytes: f.bytes };
  };
  for (const s of index.systems) add(s.id, s);
  if (index.attachmentsFile) add(ATTACHMENTS, index.attachmentsFile);
  return files;
}

/** A system's top-level groups (regions or sub-systems), with how many structures each has. */
export function topGroups(index: AtlasIndex, system: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const [, p] of index.nodes[system] ?? []) {
    const top = index.paths[p]?.[0];
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

/** The structures of a system outside some of its top-level groups (null when none are left out). */
export function nodesOutside(index: AtlasIndex, system: string, hidden: readonly string[]): string[] | null {
  if (hidden.length === 0) return null;
  const out = new Set(hidden);
  return (index.nodes[system] ?? []).filter(([, p]) => !out.has(index.paths[p]?.[0] ?? "")).map(([node]) => node);
}

/** The top-level group a structure is in. */
export function topGroupOf(index: AtlasIndex, system: string, node: string): string | null {
  const p = (index.nodes[system] ?? []).find(([n]) => n === node)?.[1];
  return p === undefined ? null : (index.paths[p]?.[0] ?? null);
}

/** Groups left out when a system is first shown: the fasciae would hide every muscle. */
export const DEFAULT_HIDDEN_GROUPS: Readonly<Record<string, string[]>> = { muscular: ["Fasciae"] };
