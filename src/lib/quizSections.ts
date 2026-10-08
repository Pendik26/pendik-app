import type { QuizQuestion } from "../types/content";

export const SECTION_SIZE = 25;
/** Below this many questions, a single sitting is still reasonable — don't offer to split it up. */
export const SECTION_THRESHOLD = 50;

export interface QuizSection {
  shortLabel: string;
  range: string;
  label: string;
  questions: QuizQuestion[];
}

/**
 * Splits a large bank into evenly-sized sections (no tiny leftover section) so it can be studied
 * in smaller sittings. Returns an empty array when the bank is at or below the threshold —
 * callers should treat that as "no split needed, it's a reasonable single sitting already".
 */
export function buildSections(
  bank: QuizQuestion[],
  sectionSize = SECTION_SIZE,
  threshold = SECTION_THRESHOLD,
): QuizSection[] {
  if (bank.length <= threshold) return [];

  const numSections = Math.ceil(bank.length / sectionSize);
  const base = Math.floor(bank.length / numSections);
  const remainder = bank.length % numSections;

  const sections: QuizSection[] = [];
  let offset = 0;
  for (let i = 0; i < numSections; i++) {
    const size = base + (i < remainder ? 1 : 0);
    const questions = bank.slice(offset, offset + size);
    const start = offset + 1;
    const end = offset + size;
    const shortLabel = `Section ${i + 1}`;
    const range = `Q${start}–${end}`;
    sections.push({ shortLabel, range, label: `${shortLabel} (${range})`, questions });
    offset += size;
  }
  return sections;
}
