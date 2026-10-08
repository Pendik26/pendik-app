export interface PlotSeries {
  label: string;
  /** CSS class suffix for the series colour: "a", "b" or "c". */
  tone: "a" | "b" | "c";
  points: [number, number][];
}

interface Props {
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
}

const W = 520;
const H = 260;
const PAD = { l: 48, r: 16, t: 16, b: 42 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  const end = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.floor(lo / step) * step; v <= end + step * 1e-6; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** "Plot Data": the recorded runs as a line chart, one line per series. */
export function DataPlot({ series, xLabel, yLabel }: Props) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <p className="lab-empty">Record some data first.</p>;
  const xs = all.map((p) => p[0]);
  const xt = ticks(Math.min(...xs), Math.max(...xs));
  const yt = ticks(0, Math.max(0.5, ...all.map((p) => p[1])));
  const [x0, x1] = [xt[0], xt[xt.length - 1]];
  const y1 = yt[yt.length - 1];
  const px = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * PW;
  const py = (y: number) => PAD.t + PH - (y / y1) * PH;

  return (
    <figure className="lab-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.map((s) => s.label).join(", ")} against ${xLabel}`}>
        {xt.map((x) => (
          <g key={`x${x}`}>
            <line x1={px(x)} x2={px(x)} y1={PAD.t} y2={PAD.t + PH} className="lab-plot-grid" />
            <text x={px(x)} y={PAD.t + PH + 15} textAnchor="middle" className="lab-plot-tick">
              {x}
            </text>
          </g>
        ))}
        {yt.map((y) => (
          <g key={`y${y}`}>
            <line x1={PAD.l} x2={PAD.l + PW} y1={py(y)} y2={py(y)} className="lab-plot-grid" />
            <text x={PAD.l - 6} y={py(y) + 4} textAnchor="end" className="lab-plot-tick">
              {y}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={PAD.l + PW} y1={PAD.t + PH} y2={PAD.t + PH} className="lab-plot-axis" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={PAD.t + PH} className="lab-plot-axis" />
        <text x={PAD.l + PW / 2} y={H - 6} textAnchor="middle" className="lab-plot-label">
          {xLabel}
        </text>
        <text x={13} y={PAD.t + PH / 2} textAnchor="middle" className="lab-plot-label" transform={`rotate(-90 13 ${PAD.t + PH / 2})`}>
          {yLabel}
        </text>
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a[0] - b[0]);
          return (
            <g key={s.label} className={`lab-plot-series tone-${s.tone}`}>
              <polyline points={pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(" ")} />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={px(x)} cy={py(y)} r="3.5" />
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="lab-plot-legend">
          {series.map((s) => (
            <span key={s.label} className={`tone-${s.tone}`}>
              <i aria-hidden="true" /> {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
