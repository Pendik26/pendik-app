// The knowledge map's data: concepts from across every block and subject, linked where they're
// studied together. Built at deploy time (build.ts) into /knowledge-graph.json; the app only
// reads it.

export interface SectionRef {
  /** "{blockId}/{subjectId}/{chapterId}" for an ebook chapter, "summary:{blockId}/{subjectId}" for a summary. */
  c: string;
  /** The section's heading. */
  h: string;
  /** Its anchor on the page. */
  a: string;
}

export interface GraphNode {
  id: string;
  label: string;
  /** Laid out at build time. */
  x: number;
  y: number;
  r: number;
  /** Where the 3D view puts it, also laid out at build time (missing from older builds). */
  p3?: [number, number, number];
  /** Subject keys ("1.2/anatomy"), most-mentioning first. */
  subjects: string[];
  /** Sections, cards, questions and labels that mention it. */
  mentions: number;
  sections: SectionRef[];
  /** By subject key: flashcard ids, quiz question ids and image-occlusion label ids that mention it. */
  cards: Record<string, string[]>;
  questions: Record<string, string[]>;
  labels: Record<string, string[]>;
  /** A short description from the notes or flashcards, when one was found. */
  d?: string;
  /** The section the description comes from. */
  da?: SectionRef;
}

export interface GraphEdge {
  /** Node indexes. */
  s: number;
  t: number;
  /** How often the two come up together. */
  w: number;
  /** How they relate ("innervates", "part of"…), when AI labels have been generated. */
  rel?: string;
}

export interface KnowledgeGraph {
  version: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const GRAPH_URL = "/knowledge-graph.json";
