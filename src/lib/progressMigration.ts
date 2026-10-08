import type { Subject } from "../types/content";
import { studyBlocks } from "./blocks";
import { ebookSubjects, flashcardSubjects, keyOf, quizSubjects, summarySubjects } from "./content";
import { storageKey, type KeyTypeName } from "./storageSchema";
import { own } from "./records";

/**
 * Per-subject progress used to be stored under the bare subject id ("medicine:flashcards:physiology").
 * Now that a subject can have content in several blocks, it's stored under "{blockId}/{subjectId}".
 * This lists which subject list each old key type belongs to, so an old key can be matched to
 * the block that had that content.
 */
export const SUBJECT_SCOPED_TYPES: Partial<Record<KeyTypeName, Subject[]>> = {
  flashcards: flashcardSubjects,
  tagfilter: flashcardSubjects,
  examdate: flashcardSubjects,
  quiz: quizSubjects,
  quizdue: quizSubjects,
  quizinprogress: quizSubjects,
  lastread: summarySubjects,
  ebook: ebookSubjects,
  ebookdone: ebookSubjects,
};

const blockOrder = (blockId: string) => {
  const i = studyBlocks.findIndex((b) => b.id === blockId);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

/**
 * The new key for an old-style key, or null if it isn't one. When a subject has the same content
 * type in several blocks, the old key belonged to the earliest one: before per-block keys, a
 * subject could only have each type in one block, and every later block's content is newer.
 */
export function migratedKey(
  key: string,
  subjectsByType: Partial<Record<string, Subject[]>> = SUBJECT_SCOPED_TYPES,
): string | null {
  // Image-occlusion reviews were briefly kept inside the flashcard keys.
  const occlusion = key.match(/^medicine:flashcards:([^/]+\/[^/]+)\/occlusion$/);
  if (occlusion) return storageKey("occlusion", occlusion[1]);
  const match = key.match(/^medicine:([a-z]+):([^/]+)$/);
  if (!match) return null;
  const [, type, subjectId] = match;
  const subjects = own(subjectsByType, type);
  if (!subjects) return null;
  const candidates = subjects
    .filter((s) => s.id === subjectId)
    .sort((a, b) => blockOrder(a.blockId) - blockOrder(b.blockId));
  return candidates.length ? storageKey(type as KeyTypeName, keyOf(candidates[0])) : null;
}

/**
 * Renames every old-style progress key in storage to its per-block key. An old key wins over an
 * existing new one, so restoring an old backup restores its progress. Safe to run repeatedly.
 */
export function migrateLegacyProgressKeys(storage: Storage = window.localStorage): number {
  let moved = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) keys.push(key);
    }
    for (const key of keys) {
      const target = migratedKey(key);
      if (!target) continue;
      const value = storage.getItem(key);
      if (value !== null) storage.setItem(target, value);
      storage.removeItem(key);
      moved += 1;
    }
  } catch {
    // localStorage unavailable — nothing to migrate.
  }
  return moved;
}
