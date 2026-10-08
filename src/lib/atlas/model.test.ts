import { describe, expect, it } from "vitest";
import {
  allStructures,
  attachmentsFor,
  describeStructure,
  greekRoot,
  latinWithSide,
  nodesOutside,
  parseNode,
  searchAtlas,
  sideLabel,
  tissueColor,
  topGroupOf,
  topGroups,
  type AtlasIndex,
} from "./model";

describe("structure names", () => {
  it("reads the side and drops Blender's duplicate numbers and the brackets", () => {
    expect(parseNode("Parietal bone.r")).toEqual({ name: "Parietal bone", side: "r" });
    expect(parseNode("Hip bone.l.001")).toEqual({ name: "Hip bone", side: "l" });
    expect(parseNode("Sinus of frontal bone")).toEqual({ name: "Sinus of frontal bone", side: null });
    expect(parseNode("(Accessory pancreas)")).toEqual({ name: "Accessory pancreas", side: null });
  });
});

describe("tissue colours", () => {
  it("come from the material names, with muscles varied by action", () => {
    expect(tissueColor("Bone-1.001", "skeletal")).toBe("#e3d7bd");
    expect(tissueColor("Artery", "cardiovascular")).toBe("#c4302b");
    expect(tissueColor("Pulmonary artery", "cardiovascular")).toBe("#4a72c4");
    expect(tissueColor("Origin-Flexion", "skeletal")).toBe("#d64a4a");
    expect(tissueColor("Nerve-3", "nervous")).toBe("#e3c548");
    expect(tissueColor("Flexion", "muscular")).toMatch(/^hsl\(/);
    expect(tissueColor("Flexion", "muscular")).not.toBe(tissueColor("Extension", "muscular"));
  });
});

const index: AtlasIndex = {
  version: 1,
  systems: [
    { id: "skeletal", label: "Skeleton", file: "skeletal.glb", bytes: 1, tris: 1, structures: 2 },
    { id: "muscular", label: "Muscles", file: "muscular.glb", bytes: 1, tris: 1, structures: 1 },
  ],
  paths: [["Appendicular skeleton", "Skeleton of free lower limb"], ["Muscles of upper limb"]],
  nodes: {
    skeletal: [["Femur.r", 0], ["Femur.l", 0], ["Body of femur.r", 0]],
    muscular: [["Deltoid muscle.r", 1], ["Deltoid muscle.l", 1]],
  },
  landmarks: {},
  attachments: [
    ["Deltoid muscle.o1r", "Deltoid muscle", "o"],
    ["Deltoid muscle.er", "Deltoid muscle", "i"],
    ["Masseter.or", "Masseter", "o"],
  ],
};

describe("anatomical names", () => {
  it("writes the side as dextra or sinistra", () => {
    expect(sideLabel("r")).toBe("Dextra");
    expect(sideLabel("l")).toBe("Sinistra");
    expect(sideLabel(null)).toBe("");
  });

  it("makes the side agree with the Latin head noun", () => {
    expect(latinWithSide("Ren", "r")).toBe("Ren dexter");
    expect(latinWithSide("Scapula", "l")).toBe("Scapula sinistra");
    expect(latinWithSide("Os femoris", "r")).toBe("Os femoris dextrum");
    expect(latinWithSide("Musculus deltoideus", "l")).toBe("Musculus deltoideus sinister");
    expect(latinWithSide("Caput longum musculi bicipitis brachii", "r")).toBe("Caput longum musculi bicipitis brachii dextrum");
    expect(latinWithSide("Arteria femoralis", "r")).toBe("Arteria femoralis dextra");
    expect(latinWithSide("Ligamentum patellae", "l")).toBe("Ligamentum patellae sinistrum");
    expect(latinWithSide("Pulmo dexter", "r")).toBe("Pulmo dexter");
    expect(latinWithSide("Cor", null)).toBe("Cor");
    expect(latinWithSide("Chiasma opticum", "r")).toBe("Chiasma opticum dextrum");
    expect(latinWithSide("Musculi rotatores", "l")).toBe("Musculi rotatores sinistri");
    expect(latinWithSide("Partes", "r")).toBe("Partes dextrae");
  });

  it("adds the Greek root behind clinical terms", () => {
    expect(greekRoot("Kidney")).toBe("nephros");
    expect(greekRoot("Suprarenal gland")).toBe("epinephros");
    expect(greekRoot("Right lung")).toBe("pneumon");
    expect(greekRoot("Femur")).toBeNull();
  });
});

describe("searching the atlas", () => {
  const all = allStructures(index);
  it("finds by name or group, once per side, names that start with it first", () => {
    expect(searchAtlas(all, "femur").map((h) => h.name)).toEqual(["Femur", "Body of femur"]);
    expect(searchAtlas(all, "upper limb").map((h) => h.name)).toEqual(["Deltoid muscle"]);
    expect(searchAtlas(all, "  ")).toEqual([]);
  });

  it("finds by the Latin name too", () => {
    const withLatin = allStructures(index, { Femur: "Os femoris", "Deltoid muscle": "Musculus deltoideus" });
    expect(searchAtlas(withLatin, "os femoris").map((h) => h.name)).toEqual(["Femur"]);
    expect(searchAtlas(withLatin, "deltoideus")[0]?.latin).toBe("Musculus deltoideus");
  });

  it("finds a muscle's attachments, and the whole muscle's for one of its parts", () => {
    expect(attachmentsFor(index, "Deltoid muscle.r").map((a) => a.type)).toEqual(["o", "i"]);
    expect(attachmentsFor(index, "Clavicular part of deltoid muscle.r")).toHaveLength(2);
    expect(attachmentsFor(index, "Temporalis muscle.r")).toEqual([]);
  });

  it("groups a system's structures by their top-level group, and can leave groups out", () => {
    expect(topGroups(index, "skeletal")).toEqual([{ name: "Appendicular skeleton", count: 3 }]);
    expect(nodesOutside(index, "skeletal", [])).toBeNull();
    expect(nodesOutside(index, "skeletal", ["Appendicular skeleton"])).toEqual([]);
    expect(nodesOutside(index, "muscular", ["Appendicular skeleton"])).toEqual(["Deltoid muscle.r", "Deltoid muscle.l"]);
    expect(topGroupOf(index, "muscular", "Deltoid muscle.l")).toBe("Muscles of upper limb");
  });

  it("looks up descriptions without the side", () => {
    expect(describeStructure({ "Deltoid muscle": "The deltoid." }, "Deltoid muscle.l")).toBe("The deltoid.");
    expect(describeStructure({ "(Accessory pancreas)": "Extra." }, "(Accessory pancreas)")).toBe("Extra.");
    expect(describeStructure(null, "Femur.r")).toBeNull();
  });
});

const shippedIndex = Object.values(import.meta.glob<AtlasIndex>("/public/atlas/atlas.json", { eager: true, import: "default" })).at(0);
const shippedLatin = Object.values(import.meta.glob<Record<string, string>>("/public/atlas/latin.json", { eager: true, import: "default" })).at(0);
const shippedFiles = new Set(Object.keys(import.meta.glob("/public/atlas/*.glb.gz", { query: "?url", import: "default", eager: true })));

describe("the shipped atlas", () => {
  it.skipIf(!shippedIndex)("lists every system's file and only structures with names", () => {
    const shipped = shippedIndex as AtlasIndex;
    expect(shipped.systems.map((s) => s.id)).toContain("skeletal");
    for (const s of shipped.systems) {
      expect(shippedFiles.has(`/public/atlas/${s.file}`), s.file).toBe(true);
      for (const [node, p] of shipped.nodes[s.id] ?? []) {
        expect(parseNode(node).name.length).toBeGreaterThan(1);
        expect(shipped.paths[p]).toBeDefined();
      }
    }
    expect(searchAtlas(allStructures(shipped), "femur")[0]?.name).toBe("Femur");
    if (shippedLatin) expect(searchAtlas(allStructures(shipped, shippedLatin), "ren")[0]?.name).toBe("Kidney");
  });
});
