import { useEffect, useId, useRef, useState, type PointerEvent, type RefObject } from "react";

// Two small single-series charts for the Progress and Exam plan pages. One series each, so no
// legend (the heading names it); thin marks in the accent; hairline grid; a tooltip on hover
// or focus; and a visually hidden table with every value.

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
}

/** The chart's drawn width in CSS pixels, so text and marks keep their size at any width. */
function useWidth(ref: RefObject<HTMLDivElement | null>, fallback = 640): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { setWidth(Math.max(240, Math.round(el.clientWidth))); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, [ref]);
  return width;
}

const niceMax = (v: number) => {
  if (v <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
};

export interface BarDatum {
  key: string;
  /** Axis label (shown for a few bars only). */
  short: string;
  /** Tooltip and table label. */
  label: string;
  value: number;
}

/** Columns over time, e.g. cards reviewed per day. */
export function DailyBars({ data, unit, caption }: { data: BarDatum[]; unit: string; caption: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const W = useWidth(wrap);
  const H = 150;
  const pad = { l: 34, r: 6, t: 10, b: 22 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const band = (W - pad.l - pad.r) / data.length;
  const bar = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(W / 110)));

  const show = (d: BarDatum, i: number, e?: PointerEvent) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const px = pad.l + band * i + band / 2;
    setTip({ x: e ? e.clientX - box.left : px, y: Math.min(y(d.value), H - 30), value: `${d.value} ${unit}`, label: d.label });
  };

  return (
    <figure className="chart">
      <div className="chart-wrap" ref={wrap} onPointerLeave={() => { setTip(null); }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart-svg" aria-hidden="true">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={pad.l - 6} y={y(t) + 4} className="chart-axis" textAnchor="end">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + band * i + (band - bar) / 2;
            const top = y(d.value);
            const base = y(0);
            const h = base - top;
            const r = Math.min(4, h, bar / 2);
            return (
              <g key={d.key}>
                {d.value > 0 && (
                  <path
                    className="chart-bar"
                    d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${base} Z`}
                  />
                )}
                {i % labelEvery === labelEvery - 1 || i === data.length - 1 ? (
                  <text x={x + bar / 2} y={H - 6} className="chart-axis" textAnchor="middle">
                    {d.short}
                  </text>
                ) : null}
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={band}
                  height={H - pad.t - pad.b}
                  className="chart-hit"
                  onPointerMove={(e) => { show(d, i, e); }}
                />
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Day</th>
            <th>{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface TrendPoint {
  date: Date;
  /** 0–100. */
  value: number;
  label: string;
}

/**
 * Scores over time on a fixed 0–100% scale, with the target as a reference line and, when
 * there's a projection, a dashed run from the last score to the exam date.
 */
export function ScoreTrend({ points, target, projection, caption }: { points: TrendPoint[]; target?: number; projection?: { date: Date; value: number } | null; caption: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const gradient = useId();
  const W = useWidth(wrap);
  const H = 190;
  const pad = { l: 38, r: 14, t: 12, b: 24 };
  if (points.length === 0) return null;
  const t0 = points[0].date.getTime();
  const t1 = Math.max(projection?.date.getTime() ?? 0, points[points.length - 1].date.getTime(), t0 + 86_400_000);
  const x = (d: Date) => pad.l + ((d.getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const sx = e.clientX - box.left;
    // The point nearest the pointer (the first, on a tie).
    const p = points.reduce((nearest, q) => (Math.abs(x(q.date) - sx) < Math.abs(x(nearest.date) - sx) ? q : nearest));
    setActive(points.indexOf(p));
    setTip({ x: x(p.date), y: y(p.value), value: `${Math.round(p.value)}%`, label: p.label });
  };

  return (
    <figure className="chart">
      <div
        className="chart-wrap"
        ref={wrap}
        onPointerLeave={() => {
          setTip(null);
          setActive(null);
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart-svg" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={pad.l - 6} y={y(t) + 4} className="chart-axis" textAnchor="end">
                {t}%
              </text>
            </g>
          ))}
          {target !== undefined && (
            <g>
              <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="chart-target" />
              <text x={pad.l + 4} y={y(target) - 5} className="chart-axis">
                Target {target}%
              </text>
            </g>
          )}
          {points.length > 1 && <path d={`${path} L${x(last.date)},${y(0)} L${x(points[0].date)},${y(0)} Z`} fill={`url(#${gradient})`} />}
          {points.length > 1 && <path d={path} className="chart-line" />}
          {projection && (
            <g>
              <line x1={x(last.date)} y1={y(last.value)} x2={x(projection.date)} y2={y(projection.value)} className="chart-projection" />
              <circle cx={x(projection.date)} cy={y(projection.value)} r={4.5} className="chart-dot chart-dot-hollow" />
              <text x={x(projection.date) - 8} y={y(projection.value) - 10} className="chart-axis chart-axis-strong" textAnchor="end">
                ~{Math.round(projection.value)}% on exam day
              </text>
            </g>
          )}
          {points.map((p, i) => (
            <circle key={i} cx={x(p.date)} cy={y(p.value)} r={active === i ? 6 : 4.5} className="chart-dot" />
          ))}
          <text x={pad.l} y={H - 6} className="chart-axis">
            {fmt(points[0].date)}
          </text>
          <text x={W - pad.r} y={H - 6} className="chart-axis" textAnchor="end">
            {fmt(new Date(t1))}
          </text>
          <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} className="chart-hit" onPointerMove={onMove} />
        </svg>
        <Tooltip tip={tip} />
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{Math.round(p.value)}%</td>
            </tr>
          ))}
          {projection && (
            <tr>
              <td>Projected on exam day</td>
              <td>{Math.round(projection.value)}%</td>
            </tr>
          )}
        </tbody>
      </table>
    </figure>
  );
}
