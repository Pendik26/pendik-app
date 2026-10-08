import { Fragment } from "react";

/** Renders `text` with the given Fuse.js match [start, end] ranges wrapped in <mark>. */
export function HighlightText({
  text,
  ranges,
}: {
  text: string;
  ranges?: readonly (readonly [number, number])[];
}) {
  if (!ranges || ranges.length === 0) return <>{text}</>;

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: { start: number; end: number }[] = [];
  for (const [start, end] of sorted) {
    const last = parts.at(-1);
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      parts.push({ start, end });
    }
  }

  const nodes = [];
  let cursor = 0;
  for (const { start, end } of parts) {
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(<mark key={start}>{text.slice(start, end + 1)}</mark>);
    cursor = end + 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </>
  );
}
