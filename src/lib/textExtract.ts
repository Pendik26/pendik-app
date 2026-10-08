/**
 * Strips markdown syntax and embedded HTML (including inline <svg> diagrams,
 * which are pure coordinate noise) down to plain, searchable text.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MarkdownSection {
  heading: string;
  body: string;
}

/** Splits markdown into ## sections (H1 title lines are dropped — they duplicate the page title). */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of markdown.split("\n")) {
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      current = { heading: h2[1].trim(), lines: [] };
      sections.push(current);
    } else if (current && !/^#\s+/.test(line)) {
      current.lines.push(line);
    }
  }

  return sections.map((s) => ({ heading: s.heading, body: s.lines.join("\n") }));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
