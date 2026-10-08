import { ebookMeta, loadEbookChapter, summaries } from "./content";
import { streamAi, type AiResult } from "./aiStream";
import { markdownToPlainText, splitMarkdownSections, truncate } from "./textExtract";

// Behind the "Explain" panel: the passages of the student's own notes that match a question
// (no AI, works offline), and the call that asks the server's AI to explain it.

export interface NotePassage {
  title: string;
  /** Plain text, trimmed to a few paragraphs. */
  text: string;
  to: string;
}

const PASSAGE_CHARS = 1500;

/** Every section of a subject's summary and ebook, as plain-text passages. */
async function subjectPassages(key: string): Promise<NotePassage[]> {
  const out: NotePassage[] = [];
  const summary = summaries.get(key);
  if (summary) {
    for (const s of splitMarkdownSections(summary)) {
      const text = markdownToPlainText(s.body);
      if (text) out.push({ title: `Summary: ${s.heading}`, text, to: `/summaries/${key}` });
    }
  }
  const book = ebookMeta.get(key);
  if (book) {
    const chapters = await Promise.all(book.chapters.map(async (c) => ({ c, md: await loadEbookChapter(`${key}/${c.id}`) })));
    for (const { c, md } of chapters) {
      if (!md) continue;
      for (const s of splitMarkdownSections(md)) {
        const text = markdownToPlainText(s.body);
        if (text) out.push({ title: `${c.title}: ${s.heading}`, text, to: `/ebooks/${key}/${c.id}` });
      }
    }
  }
  return out;
}

const cache = new Map<string, Promise<NotePassage[]>>();

// Common question words that say nothing about the topic.
const STOPWORDS = new Set(
  "which what when where while with that this these those from into than then there their they them have has been being were will would could should about above below after before between other others most more less least very also only each some such both does doing done following true false except correct answer called known type types classified describe explain name list state give part parts form forms".split(" "),
);

const termsOf = (text: string) => Array.from(new Set((text.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w))));

/**
 * The few passages of a subject's notes that best match the question and its answer: each
 * passage scores the rarity (inverse document frequency) of every question term it contains,
 * so "patella" and "sesamoid" count for far more than "bone".
 */
export async function findNotes(key: string, query: string, limit = 3): Promise<NotePassage[]> {
  let passages = cache.get(key);
  if (!passages) {
    passages = subjectPassages(key);
    cache.set(key, passages);
  }
  const all = await passages;
  const terms = termsOf(query).slice(0, 20);
  if (all.length === 0 || terms.length === 0) return [];
  const haystacks = all.map((p) => ({ title: p.title.toLowerCase(), text: p.text.toLowerCase() }));
  const idf = new Map(
    terms.map((t) => {
      const df = haystacks.filter((h) => h.text.includes(t) || h.title.includes(t)).length;
      return [t, df === 0 ? 0 : Math.log(1 + all.length / df)] as const;
    }),
  );
  return all
    .map((p, i) => {
      const hay = haystacks.at(i);
      let score = 0;
      for (const t of terms) {
        const w = idf.get(t) ?? 0;
        if (hay?.title.includes(t)) score += w * 1.5;
        else if (hay?.text.includes(t)) score += w;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => ({ ...p, text: truncate(p.text, PASSAGE_CHARS) }));
}

export interface ExplainInput {
  subject: string;
  question: string;
  options: string[];
  answer: string;
  chosen?: string;
  explanation?: string;
  notes: NotePassage[];
}

export type ExplainResult = AiResult;

/** Asks the server's AI to explain, calling onText with the answer as it streams in. */
export function askAi(input: ExplainInput, onText: (text: string) => void, signal?: AbortSignal): Promise<ExplainResult> {
  return streamAi("/api/ai/explain", { ...input, notes: input.notes.map(({ title, text }) => ({ title, text })) }, onText, signal);
}
