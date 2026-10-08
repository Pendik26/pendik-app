import type { GraphNode, KnowledgeGraph, SectionRef } from "./types";

// /knowledge-graph.json on the wire. The same few hundred sections are cited by many concepts,
// so they're listed once (with their chapter paths listed once too) and concepts cite them by
// number, about halving the file. The app turns it back into a KnowledgeGraph on load.

export interface WireGraph {
  version: 2;
  /** Chapter or summary paths (SectionRef.c). */
  files: string[];
  /** [file index, heading, anchor]. */
  sections: [number, string, string][];
  nodes: (Omit<GraphNode, "sections" | "da"> & { sections: number[]; da?: number })[];
  edges: KnowledgeGraph["edges"];
}

export function encodeGraph(graph: KnowledgeGraph): WireGraph {
  const files: string[] = [];
  const fileIndex = new Map<string, number>();
  const sections: WireGraph["sections"] = [];
  const sectionIndex = new Map<string, number>();
  const ref = (s: SectionRef): number => {
    const key = `${s.c}#${s.a}`;
    let i = sectionIndex.get(key);
    if (i === undefined) {
      let f = fileIndex.get(s.c);
      if (f === undefined) {
        f = files.push(s.c) - 1;
        fileIndex.set(s.c, f);
      }
      i = sections.push([f, s.h, s.a]) - 1;
      sectionIndex.set(key, i);
    }
    return i;
  };
  const nodes = graph.nodes.map(({ sections: own, da, ...rest }) => ({
    ...rest,
    sections: own.map(ref),
    ...(da ? { da: ref(da) } : {}),
  }));
  return { version: 2, files, sections, nodes, edges: graph.edges };
}

/** The graph from the file: the wire format, or the plain one older builds wrote. */
export function decodeGraph(data: unknown): KnowledgeGraph {
  const raw = data as Partial<WireGraph> & Partial<KnowledgeGraph> & { version?: number };
  if (raw.version !== 2) {
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error("Not a knowledge graph");
    return raw as KnowledgeGraph;
  }
  const files = raw.files ?? [];
  const sections: SectionRef[] = (raw.sections ?? []).map(([f, h, a]) => ({ c: files[f] ?? "", h, a }));
  const nodes = (raw.nodes ?? []).map(({ sections: own, da, ...rest }): GraphNode => {
    const node: GraphNode = { ...rest, sections: own.flatMap((i) => sections[i] ?? []) };
    const from = da === undefined ? undefined : sections[da];
    if (from) node.da = from;
    return node;
  });
  return { version: 1, nodes, edges: raw.edges ?? [] };
}
