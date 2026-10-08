/**
 * Markdown-ish model text as safe React text: paragraphs, "- " or "1." lists, **bold** and
 * `code` shown plainly. Never raw HTML.
 */
export function AiText({ text }: { text: string }) {
  const blocks = text
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim()
    .split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{l.replace(/^\s*([-*•]|\d+\.)\s+/, "")}</li>);
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return <p key={i}>{block}</p>;
      })}
    </>
  );
}
