import { Marked } from "marked";

/**
 * Heading anchors: "Anatomical planes and sections" → "anatomical-planes-and-sections", with
 * "-2", "-3"… for repeats in one document. The knowledge map links to sections with the same
 * slugger, so both must count headings in the same order.
 */
export function headingSlugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base =
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/<[^>]+>|[*_`]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "section";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

/** Markdown to HTML with an id on every heading, so sections can be linked to. */
export function renderMarkdown(markdown: string): string {
  const slug = headingSlugger();
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth, text }) {
        return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
}
