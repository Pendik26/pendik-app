import { CATALOG } from "./catalog.generated.js";
import type { StudyKind } from "./db.js";

// What exists in content/: every flashcard, occlusion label, quiz question (with its answer) and
// ebook chapter, so a study record can be checked before it earns points.

/** The item, or null when content/ has no such thing. `answer` is a quiz question's right option (print position). */
export function catalogItem(kind: StudyKind, deck: string, itemId: string): { answer: number | null } | null {
  const key = `${kind}|${deck}|${itemId}`;
  return Object.hasOwn(CATALOG, key) ? { answer: CATALOG[key] } : null;
}
