import { memo, useMemo, useRef, useState, type PointerEvent } from "react";
import { TRACE_COLORS, valueAt, type Tracing } from "../../lib/labTraces";

interface Props {
  xMax: number;
  xLabel: string;
  xTicks: number[];
  yMax: number;
  yLabel: string;
  /** Unit of the y value, for the legend readout. */
  yUnit: string;
  /** Finished tracings, oldest first. */
  tracings: Tracing[];
  /** The sweep in progress, drawn on top. */
  live: Tracing | null;
  /** Measure cursor position on the x axis, or null when off. */
  measureX?: number | null;
  onMeasure?: (x: number) => void;
}

const W = 560;
const H = 300;
const PAD = { l: 46, r: 14, t: 14, b: 40 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

function niceStep(max: number): number {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * SVG path for a tracing, reduced to at most a minimum and a maximum per screen column (in the
 * order they occur), so a 2,000-sample tetanus draws the same as the full data with a fraction
 * of the vertices, ripples included.
 */
function tracePath(points: [number, number][], xMax: number, yMax: number): string {
  const sx = PW / xMax;
  const sy = PH / yMax;
  const px = (x: number) => PAD.l + Math.min(x, xMax) * sx;
  const py = (y: number) => PAD.t + PH - Math.min(Math.max(y, 0), yMax) * sy;
  let d = "";
  let col = -1;
  let lo: [number, number] | null = null;
  let hi: [number, number] | null = null;
  const flush = () => {
    if (!lo || !hi) return;
    const [a, b] = lo[0] <= hi[0] ? [lo, hi] : [hi, lo];
    d += `${d ? "L" : "M"}${px(a[0]).toFixed(1)},${py(a[1]).toFixed(1)}`;
    if (b !== a) d += `L${px(b[0]).toFixed(1)},${py(b[1]).toFixed(1)}`;
  };
  for (const p of points) {
    const c = Math.floor(px(p[0]));
    if (c !== col) {
      flush();
      col = c;
      lo = p;
      hi = p;
    } else {
      if (lo && p[1] < lo[1]) lo = p;
      if (hi && p[1] > hi[1]) hi = p;
    }
  }
  flush();
  return d;
}

/** A finished tracing's path is built once: its points never change. */
const TracePath = memo(function TracePath({ points, xMax, yMax, color, emphasis }: { points: [number, number][]; xMax: number; yMax: number; color: string; emphasis: "latest" | "normal" | "muted" }) {
  const d = useMemo(() => tracePath(points, xMax, yMax), [points, xMax, yMax]);
  return <path d={d} className={`lab-scope-trace is-${emphasis}`} style={{ stroke: color }} />;
});

/** The static part of the screen: grid, ticks and axis labels. */
const ScopeGrid = memo(function ScopeGrid({ xMax, xTicks, xLabel, yMax, yLabel }: { xMax: number; xTicks: number[]; xLabel: string; yMax: number; yLabel: string }) {
  const yStep = niceStep(yMax);
  const yTicks: number[] = [];
  for (let y = 0; y <= yMax + 1e-9; y += yStep) yTicks.push(Number(y.toFixed(4)));
  return (
    <g>
      <rect x={PAD.l} y={PAD.t} width={PW} height={PH} className="lab-scope-screen" rx="4" />
      {xTicks.map((x) => {
        const px = PAD.l + (x / xMax) * PW;
        return (
          <g key={`x${x}`}>
            <line x1={px} y1={PAD.t} x2={px} y2={PAD.t + PH} className="lab-scope-grid" />
            <text x={px} y={PAD.t + PH + 15} className="lab-scope-tick" textAnchor="middle">
              {x}
            </text>
          </g>
        );
      })}
      {yTicks.map((y) => {
        const py = PAD.t + PH - (y / yMax) * PH;
        return (
          <g key={`y${y}`}>
            <line x1={PAD.l} y1={py} x2={PAD.l + PW} y2={py} className="lab-scope-grid" />
            <text x={PAD.l - 6} y={py + 4} className="lab-scope-tick" textAnchor="end">
              {y}
            </text>
          </g>
        );
      })}
      <text x={PAD.l + PW / 2} y={H - 6} className="lab-scope-label" textAnchor="middle">
        {xLabel}
      </text>
      <text x={12} y={PAD.t + PH / 2} className="lab-scope-label" textAnchor="middle" transform={`rotate(-90 12 ${PAD.t + PH / 2})`}>
        {yLabel}
      </text>
    </g>
  );
});

/** The force display: a dark screen with every tracing in its own colour, and a legend. */
export function Oscilloscope({ xMax, xLabel, xTicks, yMax, yLabel, yUnit, tracings, live, measureX, onMeasure }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  const toX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    return Math.min(xMax, Math.max(0, ((px - PAD.l) / PW) * xMax));
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (measureX == null || !onMeasure) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onMeasure(toX(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const x = toX(e.clientX);
    if (dragging.current && onMeasure) onMeasure(x);
    else if (e.pointerType === "mouse") setHoverX(x);
  };
  const stop = () => {
    dragging.current = false;
  };

  // The readout follows the measure line when it's on, otherwise the mouse.
  const readX = measureX ?? hoverX;
  const all = live ? [...tracings, live] : tracings;
  const latestId = all.length > 0 ? all[all.length - 1].id : null;
  const cursor = readX == null ? null : PAD.l + (readX / xMax) * PW;
  const emphasis = (t: Tracing) => (focusId != null ? (t.id === focusId ? "latest" : "muted") : t.id === latestId ? "latest" : "normal");
  const fmtX = (x: number) => (xMax <= 60 ? x.toFixed(2) : x.toFixed(1));

  return (
    <div className="lab-scope-box">
      <svg
        ref={svgRef}
        className={`lab-scope${measureX != null ? " is-measuring" : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${yLabel} against ${xLabel}, ${all.length} tracing${all.length === 1 ? "" : "s"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={() => { setHoverX(null); }}
      >
        <ScopeGrid xMax={xMax} xTicks={xTicks} xLabel={xLabel} yMax={yMax} yLabel={yLabel} />
        <g clipPath="url(#lab-scope-clip)">
          {tracings.map((t) => (
            <TracePath key={t.id} points={t.points} xMax={xMax} yMax={yMax} color={TRACE_COLORS[t.slot]} emphasis={emphasis(t)} />
          ))}
          {live && live.points.length > 1 && (
            <path d={tracePath(live.points, xMax, yMax)} className={`lab-scope-trace is-${emphasis(live)}`} style={{ stroke: TRACE_COLORS[live.slot] }} />
          )}
        </g>
        <defs>
          <clipPath id="lab-scope-clip">
            <rect x={PAD.l} y={PAD.t - 2} width={PW} height={PH + 4} />
          </clipPath>
        </defs>
        {cursor != null && (
          <g pointerEvents="none">
            <line x1={cursor} x2={cursor} y1={PAD.t} y2={PAD.t + PH} className={measureX != null ? "lab-scope-measure" : "lab-scope-crosshair"} />
            {measureX != null && <rect x={cursor - 7} y={PAD.t + PH - 14} width="14" height="14" rx="3" className="lab-scope-measure-handle" />}
            {readX != null &&
              all.map((t) => {
                const v = valueAt(t.points, readX);
                if (v == null) return null;
                const cy = PAD.t + PH - (Math.min(Math.max(v, 0), yMax) / yMax) * PH;
                return <circle key={t.id} cx={cursor} cy={cy} r="3.5" className="lab-scope-dot" style={{ fill: TRACE_COLORS[t.slot] }} />;
              })}
          </g>
        )}
      </svg>
      {all.length > 0 && (
        <ul className="lab-scope-legend" aria-label="Tracings">
          {readX != null && (
            <li className="lab-scope-legend-x">
              {xLabel.replace(/ \(.*/, "")} {fmtX(readX)}
            </li>
          )}
          {all.map((t) => {
            const v = readX == null ? null : valueAt(t.points, readX);
            return (
              <li
                key={t.id}
                className={focusId === t.id ? "is-focus" : undefined}
                onMouseEnter={() => { setFocusId(t.id); }}
                onMouseLeave={() => { setFocusId(null); }}
              >
                <i style={{ background: TRACE_COLORS[t.slot] }} aria-hidden="true" />
                {t.label}
                {v != null && (
                  <b>
                    {v.toFixed(2)} {yUnit}
                  </b>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
