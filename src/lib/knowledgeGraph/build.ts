import { forceSimulation } from "d3-force";
import { ebookMeta, flashcardDecks, loadEbookChapters, loadOcclusionNotes, occlusionKeys, quizBanks, summaries } from "../content";
import { headingSlugger } from "../markdownHtml";
import { occlusionCards } from "../occlusion";
import type { Flashcard, OcclusionNote, QuizQuestion } from "../../types/content";
import { DEFINITION_SCORE, describeConcepts, type DescribeSource } from "./describe";
import { anchors, applyForces, layoutLinks, type LayoutNode } from "./layout";
import { createLayout3D, settle3D } from "./layout3d";
import type { GraphEdge, GraphNode, KnowledgeGraph, SectionRef } from "./types";
import { own, setOwn } from "../records";

// Builds the knowledge map from the course material. Concepts are the terms the ebooks and
// summaries put in bold; a concept is kept when it comes up again and again across sections,
// flashcards, quiz questions and labelled figures. Two concepts are linked when they come up in
// the same paragraph, card or question, so the same idea taught in two subjects or two blocks
// becomes one node that joins them. Past-paper exam questions are never read: the result is a
// public file.

const MIN_MENTIONS = 3;
const MAX_NODES = 700;
const MIN_EDGE_WEIGHT = 2;
const EDGES_PER_NODE = 10;
const MAX_REFS = 25;
const MAX_SECTIONS = 8;

/** Words that are bold for emphasis or as labels, not as concepts. */
const STOP_TERMS = new Set(
  [
    "procedure", "contents", "background", "expected result", "normal result", "record data", "clear tracing", "stimulate",
    "where", "what", "why", "how", "when", "which", "note", "tip", "example", "remember", "key point", "summary", "answer",
    "true", "false", "yes", "no", "not", "both", "all", "none", "only", "always", "never", "more", "less", "increase", "decrease",
    "floor", "roof", "wall", "lateral", "medial", "anterior", "posterior", "superior", "inferior", "proximal", "distal",
    "left", "right", "upper", "lower", "deep", "superficial", "internal", "external", "first", "second", "third", "last",
    "important", "warning", "caution", "result", "results", "goal", "aim", "step", "steps", "rule", "trick", "mnemonic",
    "question", "quiz", "exam", "chapter", "section", "figure", "table", "slide", "see", "also", "and", "or", "the",
  ].map((t) => termKey(t)),
);

/** Everyday or positional words that are bold for emphasis; they aren't concepts on their own. */
const GENERIC_WORDS = new Set(
  (
    "layer structure about other function inside outside location shape central thick thin round before after motor transverse trunk branch " +
    "vertebral cervical thoracic lumbar sacral space outer inner action region light dark weight peripheral skeletal longer shorter intermediate " +
    "basal cardiac femoral present simple movement segment complete contractile cranial cross-section frequency longitudinal branching clinical " +
    "control raise sensory total voltage active boundary mechanical structural tibial abdominal cylindrical nasal process corpus fusion somatic " +
    "extend orbital pulse elongated direct curve division loose passive relaxed stretching vascular mental reference slower faster basi learned " +
    "lengthen accumulation adequate measure muscular plain thicker transport detache latin organization protection oblique cephalic visceral " +
    "palmar plantar gluteal dorsum classification regeneration matter level type part side group form way area unit point line surface " +
    "normal common general main major minor large small big high low early late new old same different similar specific"
  )
    .split(" ")
    .map((w) => termKey(w)),
);

const FIRST_WORD_STOP = new Set(["mainly", "mostly", "no", "number", "only", "very", "each", "every", "some", "the", "a", "an", "and", "or", "of", "in", "on", "to", "is", "are", "with", "for", "by", "at", "from", "its", "it", "this", "that"]);
const LAST_WORD_STOP = new Set(["into", "onto", "than", "then", "as", "be", "not", "very", "more", "less", "which", "who", "when", "where"]);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is|as|os)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

/** The key a term is matched on: its words, lower case, singular. */
export function termKey(text: string): string {
  return tokenize(text).join(" ");
}

/** A bold phrase as a concept, or null when it's a label, a number or too generic. */
export function cleanTerm(raw: string): { key: string; label: string } | null {
  if (/:\s*$/.test(raw.trim())) return null;
  const label = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[`_]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, "")
    .trim();
  const words = tokenize(label);
  if (words.length === 0 || words.length > 5 || label.length > 48) return null;
  if (words.some((w) => /^\d/.test(w))) return null;
  if (FIRST_WORD_STOP.has(words[0]) || FIRST_WORD_STOP.has(words[words.length - 1]) || LAST_WORD_STOP.has(words[words.length - 1])) return null;
  // Leftovers of a phrase cut by the bold ("(about", "OL = transverse, IC = …").
  if (/[()=,;/?!]/.test(label)) return null;
  // Spinal levels and nerve-number ranges ("C5–T1", "VIII–X") aren't concepts by themselves.
  if (/^[A-Z]{0,2}\d*[–-][A-Z]{0,2}\d*$/.test(label) || /^[IVXL]+[–-][IVXL]+$/.test(label)) return null;
  if (words.length === 1) {
    const w = words[0];
    if (w.length < 5 || GENERIC_WORDS.has(w) || w.endsWith("ly")) return null;
  }
  const key = words.join(" ");
  if (STOP_TERMS.has(key)) return null;
  return { key, label };
}

interface Unit {
  subject: string;
  /** Text to find concepts in. */
  text: string;
  /** Linking weight for concepts found together (0: refs only). */
  pairWeight: number;
  /** For a whole section: its paragraphs, which carry the links instead. */
  paragraphs?: string[];
  section?: SectionRef;
  card?: string;
  question?: string;
  label?: string;
}

interface Section {
  heading: string;
  anchor: string;
  body: string;
}

/** A Markdown document by heading, with the anchors renderMarkdown gives them. */
export function splitSections(markdown: string): Section[] {
  const slug = headingSlugger();
  const out: Section[] = [];
  let current: Section = { heading: "", anchor: "", body: "" };
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      if (current.body.trim() || current.heading) out.push(current);
      current = { heading: m[2].replace(/[*_`]/g, "").trim(), anchor: slug(m[2]), body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  if (current.body.trim() || current.heading) out.push(current);
  return out;
}

const BOLD_RE = /\*\*([^*\n]{2,80})\*\*/g;

export interface GraphInput {
  chapters: ReadonlyMap<string, string>;
  summaries: ReadonlyMap<string, string>;
  occlusion: ReadonlyMap<string, OcclusionNote[]>;
  /** Flashcard decks and quiz banks, by subject key. */
  decks?: ReadonlyMap<string, Flashcard[]>;
  banks?: ReadonlyMap<string, QuizQuestion[]>;
  /** A concept needs this many mentions to be kept (default MIN_MENTIONS). */
  minMentions?: number;
  /** AI-labelled relations, by "termA|termB" (keys sorted). */
  relations?: ReadonlyMap<string, string>;
  /** Written descriptions, by concept id (content/graph/glossary.json); they win over the notes. */
  glossary?: ReadonlyMap<string, string>;
}

export function buildKnowledgeGraph(input: GraphInput): KnowledgeGraph {
  // 1. Candidate concepts: bold terms in the ebooks and summaries.
  const surfaces = new Map<string, Map<string, number>>();
  const addSurface = (raw: string) => {
    const t = cleanTerm(raw);
    if (!t) return;
    const forms = surfaces.get(t.key) ?? new Map<string, number>();
    forms.set(t.label, (forms.get(t.label) ?? 0) + 1);
    surfaces.set(t.key, forms);
  };
  for (const md of [...input.chapters.values(), ...input.summaries.values()]) for (const m of md.matchAll(BOLD_RE)) addSurface(m[1]);
  const maxWords = 5;

  // 2. The units concepts are looked for in.
  const units: Unit[] = [];
  const sectionUnits = (md: string, subject: string, c: string) => {
    for (const s of splitSections(md)) {
      const text = `${s.heading}\n${s.body}`;
      units.push({
        subject,
        text,
        pairWeight: 1,
        paragraphs: s.body.split(/\n\s*\n/).filter((p) => p.trim()),
        section: { c, h: s.heading, a: s.anchor },
      });
    }
  };
  for (const [chapterKey, md] of input.chapters) {
    const [blockId, subjectId] = chapterKey.split("/");
    sectionUnits(md, `${blockId}/${subjectId}`, chapterKey);
  }
  for (const [key, md] of input.summaries) sectionUnits(md, key, `summary:${key}`);
  for (const [key, deck] of input.decks ?? []) for (const card of deck) units.push({ subject: key, text: `${card.front}\n${card.back}`, pairWeight: 2, card: card.id });
  for (const [key, bank] of input.banks ?? []) {
    for (const q of bank) units.push({ subject: key, text: `${q.question}\n${q.options[q.answer] ?? ""}\n${q.explanation}`, pairWeight: 2, question: q.id });
  }
  for (const [key, notes] of input.occlusion) {
    for (const card of occlusionCards(notes)) units.push({ subject: key, text: card.mask.label, pairWeight: 0, label: card.id });
  }

  // 3. Find the candidates in each unit: longest match first, so "radial nerve" isn't also "nerve".
  const find = (text: string): string[] => {
    const words = tokenize(text);
    const found = new Set<string>();
    for (let i = 0; i < words.length; ) {
      let matched = 0;
      for (let n = Math.min(maxWords, words.length - i); n >= 1; n--) {
        const key = words.slice(i, i + n).join(" ");
        if (surfaces.has(key)) {
          found.add(key);
          matched = n;
          break;
        }
      }
      i += matched || 1;
    }
    return [...found];
  };

  interface Acc {
    mentions: number;
    bySubject: Map<string, number>;
    sections: SectionRef[];
    cards: Record<string, string[]>;
    questions: Record<string, string[]>;
    labels: Record<string, string[]>;
  }
  const acc = new Map<string, Acc>();
  const pairs = new Map<string, number>();
  const push = (rec: Record<string, string[]>, subject: string, id: string) => {
    const list = own(rec, subject) ?? [];
    if (list.length < MAX_REFS && !list.includes(id)) list.push(id);
    setOwn(rec, subject, list);
  };
  const link = (terms: string[], weight: number) => {
    const sorted = [...terms].sort();
    sorted.forEach((a, i) => {
      for (const b of sorted.slice(i + 1)) {
        const k = `${a}|${b}`;
        pairs.set(k, (pairs.get(k) ?? 0) + weight);
      }
    });
  };
  for (const u of units) {
    const terms = find(u.text);
    for (const t of terms) {
      const a: Acc = acc.get(t) ?? { mentions: 0, bySubject: new Map(), sections: [], cards: {}, questions: {}, labels: {} };
      a.mentions += 1;
      a.bySubject.set(u.subject, (a.bySubject.get(u.subject) ?? 0) + 1);
      if (u.section && a.sections.length < MAX_SECTIONS) a.sections.push(u.section);
      if (u.card) push(a.cards, u.subject, u.card);
      if (u.question) push(a.questions, u.subject, u.question);
      if (u.label) push(a.labels, u.subject, u.label);
      acc.set(t, a);
    }
    if (u.paragraphs) for (const p of u.paragraphs) link(find(p), u.pairWeight);
    else if (u.pairWeight > 0) link(terms, u.pairWeight);
  }

  // 4. Keep the concepts that recur; label each with its most common written form.
  const kept = [...acc.entries()]
    .filter(([, a]) => a.mentions >= (input.minMentions ?? MIN_MENTIONS))
    .sort((a, b) => b[1].mentions - a[1].mentions || a[0].localeCompare(b[0]))
    .slice(0, MAX_NODES);
  const index = new Map(kept.map(([key], i) => [key, i]));

  // A short description for each, from the notes (or a flashcard that asks for it).
  const sources: DescribeSource = { sections: [], decks: input.decks ?? new Map() };
  for (const [c, md] of input.chapters) {
    const [blockId, subjectId] = c.split("/");
    for (const s of splitSections(md)) sources.sections.push({ ref: { c, h: s.heading, a: s.anchor }, subject: `${blockId}/${subjectId}`, body: s.body });
  }
  for (const [key, md] of input.summaries) {
    for (const s of splitSections(md)) sources.sections.push({ ref: { c: `summary:${key}`, h: s.heading, a: s.anchor }, subject: key, body: s.body });
  }
  const primary = new Map(kept.map(([key, a]) => [key, [...a.bySubject.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? ""]));
  const descriptions = describeConcepts(new Set(index.keys()), primary, sources, (bold) => cleanTerm(bold)?.key ?? null);
  // The glossary's wording first; otherwise a definition from the notes or a flashcard (never a
  // sentence that only mentions the term). "da" points at the notes' own definition, if any.
  const describe = (key: string): Pick<GraphNode, "d" | "da"> => {
    const found = descriptions.get(key);
    const defined = found && found.score >= DEFINITION_SCORE ? found : undefined;
    const text = input.glossary?.get(key.replace(/ /g, "-")) ?? defined?.text;
    if (!text) return {};
    return defined?.from ? { d: text, da: defined.from } : { d: text };
  };
  const nodes: GraphNode[] = kept.map(([key, a]) => {
    const forms = [...(surfaces.get(key) ?? new Map()).entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    const best = forms[0]?.[0] ?? key;
    return {
      id: key.replace(/ /g, "-"),
      label: best.charAt(0).toUpperCase() + best.slice(1),
      x: 0,
      y: 0,
      r: Math.round(Math.min(16, 3 + Math.sqrt(a.mentions) * 1.15) * 10) / 10,
      subjects: [...a.bySubject.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([s]) => s),
      mentions: a.mentions,
      sections: a.sections,
      cards: a.cards,
      questions: a.questions,
      labels: a.labels,
      ...describe(key),
    };
  });

  // 5. Links: pairs that come up together at least twice, the strongest few per concept.
  const candidates: (GraphEdge & { key: string })[] = [];
  for (const [k, w] of pairs) {
    if (w < MIN_EDGE_WEIGHT) continue;
    const [a, b] = k.split("|");
    const s = index.get(a);
    const t = index.get(b);
    if (s === undefined || t === undefined) continue;
    candidates.push({ key: k, s, t, w });
  }
  const perNode = new Map<number, (typeof candidates)[number][]>();
  for (const e of candidates) {
    for (const n of [e.s, e.t]) {
      const edges = perNode.get(n) ?? [];
      edges.push(e);
      perNode.set(n, edges);
    }
  }
  const keep = new Set<string>();
  for (const list of perNode.values()) {
    list.sort((x, y) => y.w - x.w || x.key.localeCompare(y.key));
    for (const e of list.slice(0, EDGES_PER_NODE)) keep.add(e.key);
  }
  const edges: GraphEdge[] = candidates
    .filter((e) => keep.has(e.key))
    .sort((x, y) => x.key.localeCompare(y.key))
    .map(({ key, s, t, w }) => {
      const rel = input.relations?.get(key);
      return rel ? { s, t, w, rel } : { s, t, w };
    });

  layout(nodes, edges);
  layout3D(nodes, edges);
  return { version: 1, nodes, edges };
}

/** The 3D view's positions, settled once here so the view opens at rest instead of unfolding. */
function layout3D(nodes: GraphNode[], edges: GraphEdge[]) {
  const L = createLayout3D({ version: 1, nodes, edges });
  settle3D(L, nodes.map(() => true));
  const round = (v: number) => Math.round(v * 10) / 10;
  nodes.forEach((node, i) => {
    node.p3 = [round(L.x[i]), round(L.y[i]), round(L.z[i])];
  });
}

/** Positions the nodes once, at build time: subjects pull their concepts into regions. */
function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const sim: LayoutNode[] = anchors(nodes).map(({ cx, cy }, i) => {
    const jitter = ((i * 2654435761) % 1000) / 1000 - 0.5;
    return { i, cx, cy, r: nodes[i].r, x: cx + jitter * 80, y: cy + (((i * 40503) % 1000) / 1000 - 0.5) * 80 };
  });
  const simulation = forceSimulation(sim).stop();
  applyForces(simulation, layoutLinks(edges));
  for (let t = 0; t < 400; t++) simulation.tick();
  for (const s of sim) {
    nodes[s.i].x = Math.round((s.x ?? 0) * 10) / 10;
    nodes[s.i].y = Math.round((s.y ?? 0) * 10) / 10;
  }
}

const glossaryFiles = import.meta.glob<Record<string, string>>("/content/graph/glossary.json", { eager: true, import: "default" });
const glossary = new Map(Object.entries(Object.values(glossaryFiles).at(0) ?? {}));

const relationFiles = import.meta.glob<Record<string, string>>("/content/graph/relations.json", { eager: true, import: "default" });
const relations = new Map(Object.entries(Object.values(relationFiles).at(0) ?? {}));

/** The graph from everything in content/ (and AI relation labels, if they've been generated). */
export async function buildFromContent(): Promise<KnowledgeGraph> {
  const chapters = await loadEbookChapters();
  const occlusion = new Map<string, OcclusionNote[]>();
  for (const key of occlusionKeys) occlusion.set(key, (await loadOcclusionNotes(key)) ?? []);
  // Chapters only of books listed in a meta.json (drafts without one stay out).
  const listed = new Map([...chapters].filter(([k]) => ebookMeta.has(k.split("/").slice(0, 2).join("/"))));
  return buildKnowledgeGraph({ chapters: listed, summaries, occlusion, decks: flashcardDecks, banks: quizBanks, relations, glossary });
}
