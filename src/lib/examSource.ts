import type { MessageKey } from "../i18n/i18n";

const KNOWN: Record<string, MessageKey> = { ub: "exam.sourceUb", tryout: "exam.sourceTryout" };

/** A paper's source code as students read it: known codes translated, others capitalised. */
export function sourceLabel(source: string, t: (key: MessageKey) => string): string {
  const key = KNOWN[source.trim().toLowerCase()];
  if (key) return t(key);
  return source.charAt(0).toUpperCase() + source.slice(1);
}
