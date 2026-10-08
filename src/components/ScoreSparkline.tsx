import type { QuizAttempt } from "../types/content";

/** Compact trend accessory for a quiz's score history — de-emphasis line, accent end-marker. */
export function ScoreSparkline({ history }: { history: QuizAttempt[] }) {
  const points = history.slice(-12);
  if (points.length < 2) return null;

  const w = 120;
  const h = 32;
  const pad = 5;
  const ratios = points.map((p) => p.score / p.total);
  const min = Math.min(...ratios, 0);
  const max = Math.max(...ratios, 1);
  const range = max - min || 1;

  const coords = ratios.map((r, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((r - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Score trend over the last ${points.length} attempts, most recent ${Math.round(ratios[ratios.length - 1] * 100)} percent`}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
