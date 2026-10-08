import type { Flashcard } from "../../types/content";
import type { SectionRef } from "./types";

// A short description for each concept on the knowledge map, taken from the course's own notes
// at build time: "Epimysium: the outermost layer of dense irregular connective tissue,
// surrounding the entire muscle." Definitions written as such win over sentences that merely
// mention the term. Only ebooks, summaries and flashcards are read, never past exam papers.

export interface Description {
  text: string;
  /** How it was found: 3 a definition list or table, 2.8 a flashcard, 2.2–2.5 a defining sentence, 1 a mention. */
  score: number;
  /** Where it was found, for "read more". */
  from?: SectionRef;
}

export interface DescribeSource {
  /** Markdown documents split into sections, with where each section lives. */
  sections: { ref: SectionRef; subject: string; body: string }[];
  decks: ReadonlyMap<string, Flashcard[]>;
}

interface Candidate {
  text: string;
  score: number;
  subject: string;
  order: number;
  from?: SectionRef;
}

const MAX_LENGTH = 260;
/** Below this a candidate only mentions the term (or is a table row of values): not a description. */
export const DEFINITION_SCORE = 2.2;
const MIN_LENGTH = 25;
const BOLD_RE = /\*\*([^*\n]{2,80})\*\*/g;
// Verbs that make "**Term** is …" a definition rather than a passing mention.
const DEFINING = /^\s*(?:\([^)]*\)\s*)?,?\s*(?:is|are|was|were|refers? to|means?|describes?|consists? of|forms?|lines?|covers?|surrounds?|wraps?|connects?|carries|carry|contains?|produces?|makes? up)\b/i;

/** Markdown inline formatting and HTML down to plain text. */
export function plain(md: string): string {
  return md
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:]|$)/g, "$1$2")
    .replace(/\s*\((?:see |fig(?:ure)?\.? |table )[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuts a description to length at a sentence end if it can, else at a word, and tidies it. */
export function tidy(text: string): string {
  let t = text.replace(/^[\s:;,.–—-]+/, "").trim();
  if (t.length > MAX_LENGTH) {
    const cut = t.slice(0, MAX_LENGTH);
    // The last sentence end that isn't inside brackets.
    let end = -1;
    let depth = 0;
    for (let i = 0; i < cut.length - 1; i++) {
      const ch = cut.charAt(i);
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (ch === "." || ch === ";") && cut.charAt(i + 1) === " ") end = i;
    }
    if (end > MIN_LENGTH * 2) t = cut.slice(0, end + 1);
    else {
      t = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "");
      // Don't leave a bracket open.
      const open = t.lastIndexOf("(");
      if (open > t.lastIndexOf(")")) t = t.slice(0, open).trim();
      t += "…";
    }
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.endsWith(";")) t = `${t.slice(0, -1)}.`;
  if (!/[.!?…)]$/.test(t)) t += ".";
  return t;
}

/** Paragraphs and list items of a section body, each as one line of Markdown. */
export function blocks(body: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fence = false;
  const flush = () => {
    if (current.length) out.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
  };
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      flush();
      continue;
    }
    if (fence) continue;
    if (!line.trim() || /^\s*\|/.test(line) || /^\s*</.test(line)) {
      flush();
      // Table rows stay as rows.
      if (/^\s*\|/.test(line)) out.push(line.trim());
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) flush();
    current.push(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^>\s?/, ""));
  }
  flush();
  return out;
}

/**
 * Every place a section defines or mentions a concept, scored: a definition list or table row
 * ("**Term**: …") 3, a defining sentence ("**Term** is …") 2.5, any other sentence 1.
 */
export function candidatesIn(block: string, matches: (bold: string) => string | null): { key: string; text: string; score: number }[] {
  const out: { key: string; text: string; score: number }[] = [];
  if (block.startsWith("|")) {
    const cells = block.split("|").map((c) => c.trim()).filter((_cell, i, all) => i > 0 && i < all.length - 1);
    const first = /^\*\*([^*]+)\*\*/.exec(cells[0] ?? "");
    const key = first ? matches(first[1]) : null;
    const rest = cells.slice(1).map(plain).filter(Boolean).join("; ");
    // A row of values ("35–50 g/L") isn't a description: it needs words.
    if (key && (rest.match(/[A-Za-z]{3,}/g) ?? []).length >= 4) out.push({ key, text: rest, score: 2 });
    return out;
  }
  // "**Term**: definition", "**Term** (abbr) – definition"
  const lead = /^\*\*([^*]+)\*\*\s*(?:\([^)]*\)\s*)?[:–—]\s+(.+)$/.exec(block) ?? /^\*\*([^*]+)\*\*\s*(?:\([^)]*\)\s*)?-\s+(.+)$/.exec(block);
  if (lead) {
    const key = matches(lead[1]);
    // A lead-in that introduces a list ("**Types**:") isn't a definition.
    if (key && !lead[2].trim().endsWith(":")) out.push({ key, text: plain(lead[2]), score: 3 });
  }
  const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z(*"“])/);
  for (const sentence of sentences) {
    for (const m of sentence.matchAll(BOLD_RE)) {
      const key = matches(m[1]);
      if (!key || out.some((c) => c.key === key && c.score === 3)) continue;
      const after = sentence.slice((m.index ?? 0) + m[0].length);
      const defining = DEFINING.test(after);
      const text = plain(sentence);
      if (text.endsWith(":")) continue;
      out.push({ key, text, score: defining ? ((m.index ?? 0) < 4 ? 2.5 : 2.2) : 1 });
    }
  }
  return out;
}

/** A flashcard that asks for the term itself ("What is X?", "Define X", "X?") defines it. */
export function cardTerm(front: string): string {
  const f = front.trim().replace(/\?$/, "");
  const m = /^(?:what (?:is|are)|define|what does)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+mean)?$/i.exec(f);
  return m ? m[1] : f;
}

/** The best description for each concept key, from the notes and flashcards. */
export function describeConcepts(
  keys: ReadonlySet<string>,
  primary: ReadonlyMap<string, string>,
  source: DescribeSource,
  termKeyOf: (bold: string) => string | null,
): Map<string, Description> {
  const best = new Map<string, Candidate>();
  let order = 0;
  const offer = (key: string, c: Omit<Candidate, "order">) => {
    if (c.text.length < MIN_LENGTH) return;
    const candidate = { ...c, order: order++ };
    const current = best.get(key);
    const rank = (x: Candidate) => x.score + (x.subject === primary.get(key) ? 0.4 : 0);
    if (!current || rank(candidate) > rank(current)) best.set(key, candidate);
  };
  const matches = (bold: string) => {
    const key = termKeyOf(bold);
    return key && keys.has(key) ? key : null;
  };

  for (const { ref, subject, body } of source.sections) {
    for (const block of blocks(body)) {
      for (const c of candidatesIn(block, matches)) offer(c.key, { text: c.text, score: c.score, subject, from: ref });
    }
  }
  for (const [subject, deck] of source.decks) {
    for (const card of deck) {
      const key = termKeyOf(cardTerm(card.front));
      if (key && keys.has(key)) offer(key, { text: plain(card.back), score: 2.8, subject });
    }
  }

  const out = new Map<string, Description>();
  for (const [key, c] of best) out.set(key, c.from ? { text: tidy(c.text), score: c.score, from: c.from } : { text: tidy(c.text), score: c.score });
  return out;
}
