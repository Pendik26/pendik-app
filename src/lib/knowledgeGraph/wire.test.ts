import { describe, expect, it } from "vitest";
import type { KnowledgeGraph } from "./types";
import { decodeGraph, encodeGraph } from "./wire";

const s1 = { c: "1.2/anatomy/chapter-01", h: "Muscle", a: "muscle" };
const s2 = { c: "1.2/anatomy/chapter-01", h: "Tendon", a: "tendon" };
const s3 = { c: "summary:1.2/histology", h: "Skin", a: "skin" };
const node = (id: string, sections: typeof s1[], da?: typeof s1) => ({
  id,
  label: id,
  x: 0,
  y: 0,
  r: 4,
  subjects: ["1.2/anatomy"],
  mentions: 3,
  sections,
  cards: {},
  questions: {},
  labels: {},
  ...(da ? { d: "A thing.", da } : {}),
});
const graph: KnowledgeGraph = {
  version: 1,
  nodes: [node("a", [s1, s2], s2), node("b", [s2, s3]), node("c", [])],
  edges: [{ s: 0, t: 1, w: 3 }],
};

describe("the map's file", () => {
  it("lists each section and file once, and reads back to the same graph", () => {
    const wire = encodeGraph(graph);
    expect(wire.files).toEqual(["1.2/anatomy/chapter-01", "summary:1.2/histology"]);
    expect(wire.sections).toHaveLength(3);
    expect(wire.nodes[0].sections).toEqual([0, 1]);
    expect(wire.nodes[0].da).toBe(1);
    expect(decodeGraph(JSON.parse(JSON.stringify(wire)))).toEqual(graph);
  });

  it("still reads the plain format older builds wrote, and refuses anything else", () => {
    expect(decodeGraph(JSON.parse(JSON.stringify(graph)))).toEqual(graph);
    expect(() => decodeGraph({ hello: 1 })).toThrow();
  });
});
