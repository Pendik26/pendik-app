import { memo, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { itemAt } from "../lib/arrays";
import { Link, useParams } from "react-router-dom";
import { Oscilloscope } from "../components/lab/Oscilloscope";
import { TRACE_COLORS, freeSlot, valueAt, type Tracing } from "../lib/labTraces";
import { MuscleRig } from "../components/lab/MuscleRig";
import { DataPlot, type PlotSeries } from "../components/lab/DataPlot";
import { LabQuestions } from "../components/lab/LabQuestions";
import {
  MUSCLE,
  activeForceAt,
  fatigueTick,
  isotonicTwitch,
  passiveForce,
  recruitment,
  tetanicForce,
  type FatigueState,
  type IsotonicTwitch,
  type Stimulus,
} from "../lib/muscleSim";
import { findLabActivity, type LabActivity, type LabExercise, type LabMode } from "../lib/labActivities";
import { readJSON, writeJSON, STORAGE_KEYS } from "../lib/storage";
import { NotFound } from "./NotFound";
import { entry } from "../lib/records";

type Row = Record<string, number | null>;

interface Column {
  key: string;
  label: string;
  digits: number;
}

interface ModeConfig {
  xMax: number;
  xTicks: number[];
  xLabel: string;
  yMax: number;
  yLabel: string;
  /** Sweep time that passes per real millisecond. */
  simPerRealMs: number;
  /** Sampling interval of the trace, in sweep units. */
  sampleStep: number;
  speedNote: string;
  columns: Column[];
  plot?: { x: string; xLabel: string; yLabel: string; series: { key: string; label: string; tone: PlotSeries["tone"] }[] };
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
};

const V: Column = { key: "voltage", label: "Voltage (V)", digits: 1 };
const LEN: Column = { key: "length", label: "Length (mm)", digits: 0 };
const FORCES: Column[] = [
  { key: "active", label: "Active force (g)", digits: 2 },
  { key: "passive", label: "Passive force (g)", digits: 2 },
  { key: "total", label: "Total force (g)", digits: 2 },
];

const TWITCH_SWEEP = { xMax: 150, xTicks: range(0, 140, 20), xLabel: "Time (msec)", simPerRealMs: 1 / 8, sampleStep: 0.25, speedNote: "Slowed 8× so you can watch the twitch." };

const MODES: Record<LabMode, ModeConfig> = {
  twitch: {
    ...TWITCH_SWEEP,
    yMax: 2,
    yLabel: "Force (g)",
    columns: [V, { key: "active", label: "Active force (g)", digits: 2 }, { key: "latent", label: "Latent period (msec)", digits: 1 }],
    plot: { x: "voltage", xLabel: "Voltage (V)", yLabel: "Active force (g)", series: [{ key: "active", label: "Active force", tone: "a" }] },
  },
  voltage: {
    ...TWITCH_SWEEP,
    yMax: 2,
    yLabel: "Force (g)",
    columns: [V, LEN, ...FORCES],
    plot: { x: "voltage", xLabel: "Voltage (V)", yLabel: "Active force (g)", series: [{ key: "active", label: "Active force", tone: "a" }] },
  },
  length: {
    ...TWITCH_SWEEP,
    yMax: 3,
    yLabel: "Force (g)",
    columns: [V, LEN, ...FORCES],
    plot: {
      x: "length",
      xLabel: "Muscle length (mm)",
      yLabel: "Force (g)",
      series: [
        { key: "active", label: "Active", tone: "a" },
        { key: "passive", label: "Passive", tone: "b" },
        { key: "total", label: "Total", tone: "c" },
      ],
    },
  },
  frequency: {
    xMax: 1000,
    xTicks: range(0, 1000, 200),
    xLabel: "Time (msec)",
    yMax: 4,
    yLabel: "Force (g)",
    simPerRealMs: 1 / 4,
    sampleStep: 1,
    speedNote: "Slowed 4×: click Stimulate again while the trace is still running.",
    columns: [V, { key: "stimuli", label: "Stimuli", digits: 0 }, { key: "peak", label: "Peak force (g)", digits: 2 }],
  },
  tetanus: {
    xMax: 1000,
    xTicks: range(0, 1000, 200),
    xLabel: "Time (msec)",
    yMax: 5,
    yLabel: "Force (g)",
    simPerRealMs: 1 / 2,
    sampleStep: 0.5,
    speedNote: "Slowed 2×. The train runs until you click Stop Stimulus or the sweep ends.",
    columns: [V, { key: "rate", label: "Stimuli/sec", digits: 0 }, { key: "peak", label: "Peak force (g)", digits: 2 }],
    plot: { x: "rate", xLabel: "Stimuli per second", yLabel: "Peak force (g)", series: [{ key: "peak", label: "Peak force", tone: "a" }] },
  },
  fatigue: {
    xMax: 30,
    xTicks: range(0, 30, 5),
    xLabel: "Time (sec)",
    yMax: 5,
    yLabel: "Force (g)",
    simPerRealMs: 3 / 1000,
    sampleStep: 0.05,
    speedNote: "Runs 3× faster than real time. Stop, wait (rest), then stimulate again within the same sweep.",
    columns: [
      V,
      { key: "rate", label: "Stimuli/sec", digits: 0 },
      { key: "rest", label: "Rest period (sec)", digits: 1 },
      { key: "peak1", label: "Peak force, 1st bout (g)", digits: 2 },
      { key: "peak2", label: "Peak force after rest (g)", digits: 2 },
    ],
  },
  load: {
    xMax: 200,
    xTicks: range(0, 200, 40),
    xLabel: "Time (msec)",
    yMax: 4,
    yLabel: "Shortening (mm)",
    simPerRealMs: 1 / 8,
    sampleStep: 0.5,
    speedNote: "Slowed 8×. The trace shows how far the muscle shortens as it lifts the weight.",
    columns: [
      V,
      { key: "weight", label: "Weight (g)", digits: 1 },
      { key: "latent", label: "Time to lift (msec)", digits: 1 },
      { key: "velocity", label: "Velocity (mm/sec)", digits: 1 },
      { key: "distance", label: "Distance (mm)", digits: 2 },
    ],
    plot: { x: "weight", xLabel: "Load (g)", yLabel: "Velocity (mm/sec)", series: [{ key: "velocity", label: "Velocity", tone: "a" }] },
  },
};

const DEFAULTS: Record<LabMode, { voltage: number; length: number; rate: number; weight: number }> = {
  twitch: { voltage: 0, length: 75, rate: 50, weight: 0.5 },
  voltage: { voltage: 0, length: 75, rate: 50, weight: 0.5 },
  length: { voltage: 8.5, length: 75, rate: 50, weight: 0.5 },
  frequency: { voltage: 8.5, length: 75, rate: 50, weight: 0.5 },
  tetanus: { voltage: 8.5, length: 75, rate: 50, weight: 0.5 },
  fatigue: { voltage: 8.5, length: 75, rate: 120, weight: 0.5 },
  load: { voltage: 8.5, length: 75, rate: 50, weight: 0.5 },
};

const WEIGHTS = [0.5, 1.0, 1.5, 2.0];
/** One colour each: past this, the oldest tracing is dropped and its colour reused. */
const MAX_TRACINGS = TRACE_COLORS.length;

interface RunSettings {
  voltage: number;
  length: number;
  rate: number;
  weight: number;
  stimuli: number;
  rest?: number | null;
}

/** Legend label for a tracing: the variable the activity changes. */
function traceLabel(mode: LabMode, r: RunSettings): string {
  switch (mode) {
    case "length":
      return `${r.length} mm`;
    case "frequency":
      return `${r.stimuli} stimul${r.stimuli === 1 ? "us" : "i"}`;
    case "tetanus":
      return `${r.rate}/sec`;
    case "fatigue":
      return r.rest != null ? `${r.rate}/sec, rest ${r.rest.toFixed(1)} s` : `${r.rate}/sec`;
    case "load":
      return `${r.weight.toFixed(1)} g`;
    default:
      return `${r.voltage.toFixed(1)} V`;
  }
}

function fmt(v: number | null | undefined, digits: number): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function Stepper({ label, value, min, max, step, digits, unit, disabled, onChange }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (v: number) => { onChange(Math.min(max, Math.max(min, Number(v.toFixed(digits))))); };
  const commit = () => {
    if (draft !== null) {
      const v = Number(draft);
      if (Number.isFinite(v)) set(v);
      setDraft(null);
    }
  };
  return (
    <div className="lab-stepper">
      <span className="lab-stepper-label">{label}</span>
      <div className="lab-stepper-row">
        <button type="button" className="lab-stepper-btn" onClick={() => { set(value - step); }} disabled={disabled || value <= min} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          className="lab-stepper-input"
          inputMode="decimal"
          value={draft ?? value.toFixed(digits)}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => { setDraft(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              set(value + step);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              set(value - step);
            }
          }}
        />
        <button type="button" className="lab-stepper-btn" onClick={() => { set(value + step); }} disabled={disabled || value >= max} aria-label={`Increase ${label}`}>
          +
        </button>
        {unit && <span className="lab-stepper-unit">{unit}</span>}
      </div>
    </div>
  );
}

interface SimState {
  running: boolean;
  t: number;
  lastReal: number;
  raf: number;
  points: [number, number][];
  stimuli: Stimulus[];
  train: { next: number; to: number; period: number; recruit: number } | null;
  /** Fatigue bouts [start, stop] in seconds; stop is Infinity while stimulating. */
  bouts: [number, number][];
  boutPeaks: number[];
  fatigue: FatigueState;
  iso: IsotonicTwitch | null;
  peakActive: number;
  peak: number;
  /** Fatigue: the fresh tetanic plateau for this sweep's voltage and rate. */
  plateau: number;
  /** Settings captured when the sweep started. */
  voltage: number;
  length: number;
  rate: number;
  weight: number;
}

function newSim(): SimState {
  return {
    running: false,
    t: 0,
    lastReal: 0,
    raf: 0,
    points: [],
    stimuli: [],
    train: null,
    bouts: [],
    boutPeaks: [],
    fatigue: { phi: 1, force: 0 },
    iso: null,
    peakActive: 0,
    peak: 0,
    plateau: 0,
    voltage: 0,
    length: 75,
    rate: 50,
    weight: 0.5,
  };
}

/** What the page renders from the running simulation, published once per frame. */
interface View {
  running: boolean;
  points: [number, number][];
  t: number;
  trainOn: boolean;
  voltage: number;
  length: number;
  rate: number;
  weight: number;
  stimuli: number;
}

const IDLE_VIEW: View = { running: false, points: [], t: 0, trainOn: false, voltage: 0, length: MUSCLE.optimalLengthMm, rate: 0, weight: 0, stimuli: 0 };

/** The data table, CSV export and plot. Memoised: it changes only when rows do, not every frame. */
const DataPanel = memo(function DataPanel({
  cfg,
  rows,
  setRows,
  fileName,
}: {
  cfg: ModeConfig;
  rows: Row[];
  setRows: Dispatch<SetStateAction<Row[]>>;
  fileName: string;
}) {
  const [showPlot, setShowPlot] = useState(false);
  const plot = cfg.plot;

  const downloadCsv = () => {
    const header = cfg.columns.map((c) => `"${c.label}"`).join(",");
    const body = rows.map((r) => cfg.columns.map((c) => fmt(r[c.key], c.digits).replace("—", "")).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lab-data">
      <div className="lab-data-head">
        <h2>Data</h2>
        <div className="lab-data-actions">
          {plot && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => { setShowPlot((v) => !v); }} disabled={rows.length === 0} aria-expanded={showPlot}>
              {showPlot ? "Hide plot" : "Plot Data"}
            </button>
          )}
          <button type="button" className="btn btn-small btn-secondary" onClick={downloadCsv} disabled={rows.length === 0}>
            Download CSV
          </button>
          <button type="button" className="btn btn-small btn-secondary" onClick={() => { setRows([]); }} disabled={rows.length === 0}>
            Clear data
          </button>
        </div>
      </div>
      <div className="lab-table-wrap">
        <table className="lab-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              {cfg.columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="lab-sr">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cfg.columns.length + 2} className="lab-empty">
                  Stimulate, then Record Data to add a row.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {cfg.columns.map((c) => (
                    <td key={c.key}>{fmt(r[c.key], c.digits)}</td>
                  ))}
                  <td>
                    <button type="button" className="lab-row-delete" onClick={() => { setRows((prev) => prev.filter((_, j) => j !== i)); }} aria-label={`Delete row ${i + 1}`}>
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {plot && showPlot && rows.length > 0 && (
        <DataPlot
          xLabel={plot.xLabel}
          yLabel={plot.yLabel}
          series={plot.series.map((ser) => ({
            label: ser.label,
            tone: ser.tone,
            points: rows.filter((r) => r[plot.x] != null && r[ser.key] != null).map((r) => [r[plot.x] as number, r[ser.key] as number]),
          }))}
        />
      )}
    </div>
  );
});

function Bench({ exercise, activity }: { exercise: LabExercise; activity: LabActivity }) {
  const mode = activity.mode;
  const cfg = entry(MODES, mode);
  const defaults = entry(DEFAULTS, mode);
  const storageId = STORAGE_KEYS.labData(`${exercise.id}/${activity.slug}`);

  const [voltage, setVoltage] = useState(defaults.voltage);
  const [length, setLength] = useState(defaults.length);
  const [rate, setRate] = useState(defaults.rate);
  const [weight, setWeight] = useState(defaults.weight);
  const [tracings, setTracings] = useState<Tracing[]>([]);
  const [result, setResult] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>(() => readJSON<Row[]>(storageId, []));
  const [measure, setMeasure] = useState<number | null>(null);
  const [view, setView] = useState<View>(IDLE_VIEW);
  const [flash, setFlash] = useState(false);
  const sim = useRef<SimState>(newSim());
  const nextId = useRef(1);

  useEffect(() => { writeJSON(storageId, rows); }, [storageId, rows]);
  useEffect(() => () => { cancelAnimationFrame(sim.current.raf); }, []);

  const s = view;

  /** Copy what the page shows out of the simulation. */
  const publish = useCallback(() => {
    const st = sim.current;
    const trainOn =
      st.running && (mode === "fatigue" ? st.bouts.some(([, b]) => b === Infinity) : st.train !== null && st.train.next < st.train.to);
    setView({
      running: st.running,
      points: st.points.slice(),
      t: st.t,
      trainOn,
      voltage: st.voltage,
      length: st.length,
      rate: st.rate,
      weight: st.weight,
      stimuli: st.stimuli.length,
    });
  }, [mode]);

  const blink = useCallback(() => {
    setFlash(true);
    window.setTimeout(() => { setFlash(false); }, 180);
  }, []);

  /** Advance the sweep to sweep time `to`, one sample at a time; returns the samples added. */
  const advance = useCallback(
    (to: number) => {
      const st = sim.current;
      const step = cfg.sampleStep;
      let added = 0;
      while (st.t + step <= to + 1e-9) {
        const t = st.t + step;
        let y = 0;
        if (mode === "fatigue") {
          const bout = st.bouts.findIndex(([a, b]) => t >= a && t < b);
          st.fatigue = fatigueTick(st.fatigue, step, bout !== -1, st.plateau);
          y = st.fatigue.force;
          if (bout !== -1) st.boutPeaks.splice(bout, 1, Math.max(st.boutPeaks.at(bout) ?? 0, y));
        } else if (mode === "load") {
          y = st.iso ? (valueAt(st.iso.points, t) ?? 0) : 0;
        } else {
          while (st.train && st.train.next <= t && st.train.next < st.train.to) {
            st.stimuli.push({ t: st.train.next, recruit: st.train.recruit });
            st.train.next += st.train.period;
          }
          const active = activeForceAt(st.stimuli, t, st.length);
          st.peakActive = Math.max(st.peakActive, active);
          y = active + (mode === "length" || mode === "voltage" || mode === "twitch" ? passiveForce(st.length) : 0);
        }
        st.peak = Math.max(st.peak, y);
        st.points.push([t, y]);
        st.t = t;
        added++;
      }
      return added;
    },
    [cfg.sampleStep, mode],
  );

  const finish = useCallback(() => {
    const st = sim.current;
    st.running = false;
    st.train = null;
    let row: Row;
    switch (mode) {
      case "twitch":
        row = { voltage: st.voltage, active: st.peakActive, latent: null };
        break;
      case "voltage":
      case "length": {
        const passive = passiveForce(st.length);
        row = { voltage: st.voltage, length: st.length, active: st.peakActive, passive, total: st.peakActive + passive };
        break;
      }
      case "frequency":
        row = { voltage: st.voltage, stimuli: st.stimuli.length, peak: st.peak };
        break;
      case "tetanus":
        row = { voltage: st.voltage, rate: st.rate, peak: st.peak };
        break;
      case "fatigue": {
        const n = st.bouts.length;
        row = {
          voltage: st.voltage,
          rate: st.rate,
          rest: n >= 2 ? st.bouts[n - 1][0] - st.bouts[n - 2][1] : null,
          peak1: st.boutPeaks.at(0) ?? 0,
          peak2: n >= 2 ? (st.boutPeaks.at(n - 1) ?? 0) : null,
        };
        break;
      }
      case "load":
        row = {
          voltage: st.voltage,
          weight: st.weight,
          latent: st.iso?.latentMs ?? null,
          velocity: st.iso?.velocityMmS ?? 0,
          distance: st.iso?.shorteningMm ?? 0,
        };
        break;
    }
    const id = nextId.current++;
    const label = traceLabel(mode, { ...st, stimuli: st.stimuli.length, rest: row.rest });
    const points = st.points;
    setTracings((prev) => {
      const kept = prev.slice(-(MAX_TRACINGS - 1));
      return [...kept, { id, points, label, slot: freeSlot(kept) }];
    });
    setResult(row);
    publish();
  }, [mode, publish]);

  const loop = useCallback(
    function tick(now: number) {
      const st = sim.current;
      if (!st.running) return;
      const target = Math.min(cfg.xMax, st.t + (now - st.lastReal) * cfg.simPerRealMs);
      st.lastReal = now;
      const added = advance(target);
      if (st.t >= cfg.xMax - cfg.sampleStep / 2) {
        finish();
        return;
      }
      // A frame too short for a new sample has nothing new to draw.
      if (added > 0) publish();
      st.raf = requestAnimationFrame(tick);
    },
    [advance, cfg.xMax, cfg.sampleStep, cfg.simPerRealMs, finish, publish],
  );

  const startSweep = () => {
    cancelAnimationFrame(sim.current.raf);
    const st = newSim();
    st.running = true;
    st.voltage = voltage;
    st.length = mode === "length" ? length : MUSCLE.optimalLengthMm;
    st.rate = rate;
    st.weight = weight;
    st.lastReal = performance.now();
    st.points = [[0, mode === "length" || mode === "voltage" || mode === "twitch" ? passiveForce(st.length) : 0]];
    if (mode === "load") st.iso = isotonicTwitch(weight, recruitment(voltage), cfg.xMax);
    if (mode === "fatigue") st.plateau = tetanicForce(rate, recruitment(voltage));
    sim.current = st;
    setResult(null);
    st.raf = requestAnimationFrame(loop);
    return st;
  };

  const stimulate = () => {
    const st = sim.current;
    if (mode === "frequency" && st.running) {
      st.stimuli.push({ t: st.t, recruit: recruitment(voltage) });
      blink();
      return;
    }
    const fresh = startSweep();
    fresh.stimuli.push({ t: 0, recruit: recruitment(voltage) });
    blink();
    publish();
  };

  const trainOn = view.trainOn;

  const toggleTrain = () => {
    let st = sim.current;
    if (trainOn) {
      if (mode === "fatigue") st.bouts = st.bouts.map(([a, b]) => [a, b === Infinity ? st.t : b]);
      else if (st.train) st.train.to = st.t;
      publish();
      return;
    }
    if (!st.running) st = startSweep();
    if (mode === "fatigue") {
      st.bouts.push([st.t, Infinity]);
      st.boutPeaks.push(0);
    } else {
      st.train = { next: st.t, to: Infinity, period: 1000 / rate, recruit: recruitment(voltage) };
    }
    publish();
  };

  const clearTracings = () => { setTracings([]); };

  const record = () => {
    if (!result) return;
    const row = mode === "twitch" ? { ...result, latent: measure } : result;
    setRows((prev) => [...prev, row]);
  };

  // Current readouts: live while the sweep runs, else the last run.
  const liveNow = s.points.length > 0 ? s.points[s.points.length - 1][1] : 0;
  const activation =
    mode === "load"
      ? s.running
        ? activeForceAt([{ t: 0, recruit: recruitment(s.voltage) }], s.t, MUSCLE.optimalLengthMm) / MUSCLE.twitchPeakG
        : 0
      : s.running
        ? Math.min(1, Math.max(0, (liveNow - (mode === "length" || mode === "voltage" || mode === "twitch" ? passiveForce(s.length) : 0)) / cfg.yMax) * 1.6)
        : 0;
  const shortening = mode === "load" && s.running ? liveNow : 0;
  const running = s.running;

  const readouts: [string, string][] = (() => {
    if (running) return [[cfg.yLabel.replace(/ \(.*/, "") + " now", `${fmt(liveNow, 2)} ${mode === "load" ? "mm" : "g"}`]];
    if (!result) return [];
    return cfg.columns.filter((c) => !["voltage", "length", "rate", "weight"].includes(c.key) && !(mode === "twitch" && c.key === "latent")).map((c) => [c.label, fmt(result[c.key], c.digits)]);
  })();

  return (
    <div className="lab-bench">
      <div className="lab-stage">
        <div className="lab-rig-wrap">
          <MuscleRig
            lengthMm={mode === "length" ? length : MUSCLE.optimalLengthMm}
            activation={activation}
            stimulating={flash || trainOn}
            weightG={mode === "load" ? weight : null}
            shorteningMm={shortening}
          />
        </div>
        <div className="lab-scope-wrap">
          <Oscilloscope
            xMax={cfg.xMax}
            xLabel={cfg.xLabel}
            xTicks={cfg.xTicks}
            yMax={cfg.yMax}
            yLabel={cfg.yLabel}
            yUnit={mode === "load" ? "mm" : "g"}
            tracings={running ? tracings.slice(-(MAX_TRACINGS - 1)) : tracings}
            live={running ? { id: 0, points: s.points, label: traceLabel(mode, s), slot: freeSlot(tracings.slice(-(MAX_TRACINGS - 1))) } : null}
            measureX={measure}
            onMeasure={setMeasure}
          />
          <p className="lab-note">{cfg.speedNote}</p>
          {mode === "twitch" && (
            <div className="lab-measure">
              <button type="button" className={`btn btn-small btn-secondary${measure != null ? " is-active" : ""}`} onClick={() => { setMeasure(measure == null ? 10 : null); }} aria-pressed={measure != null}>
                {measure == null ? "Measure" : "Hide measure"}
              </button>
              {measure != null && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={cfg.xMax}
                    step={0.1}
                    value={measure}
                    onChange={(e) => { setMeasure(Number(e.target.value)); }}
                    aria-label="Measure line time (msec)"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lab-controls">
        <div className="lab-controls-set">
          <Stepper label="Voltage" unit="V" value={voltage} min={0} max={MUSCLE.maxV} step={mode === "voltage" ? 0.1 : 0.5} digits={1} onChange={setVoltage} disabled={running && mode !== "frequency"} />
          {mode === "length" && <Stepper label="Muscle length" unit="mm" value={length} min={MUSCLE.minLengthMm} max={MUSCLE.maxLengthMm} step={5} digits={0} onChange={setLength} disabled={running} />}
          {(mode === "tetanus" || mode === "fatigue") && <Stepper label="Stimuli/sec" value={rate} min={10} max={150} step={2} digits={0} onChange={setRate} disabled={trainOn} />}
          {mode === "load" && (
            <div className="lab-stepper">
              <span className="lab-stepper-label">Weight</span>
              <div className="lab-weights" role="radiogroup" aria-label="Weight">
                {WEIGHTS.map((w) => (
                  <button key={w} type="button" role="radio" aria-checked={weight === w} className={`lab-weight${weight === w ? " is-on" : ""}`} onClick={() => { setWeight(w); }} disabled={running}>
                    {w.toFixed(1)} g
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="lab-actions">
          {mode === "tetanus" || mode === "fatigue" ? (
            <button type="button" className={`btn${trainOn ? " btn-danger" : ""}`} onClick={toggleTrain}>
              {trainOn ? "Stop Stimulus" : "Multiple Stimulus"}
            </button>
          ) : (
            <button type="button" className="btn" onClick={stimulate} disabled={running && mode !== "frequency"}>
              {mode === "frequency" ? "Single Stimulus" : "Stimulate"}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={record} disabled={running || !result}>
            Record Data
          </button>
          <button type="button" className="btn btn-secondary" onClick={clearTracings} disabled={running || tracings.length === 0}>
            Clear Tracings
          </button>
        </div>
        {readouts.length > 0 && (
          <dl className="lab-readouts" aria-live="polite">
            {readouts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <DataPanel cfg={cfg} rows={rows} setRows={setRows} fileName={`${exercise.id}-activity-${activity.number}.csv`} />
    </div>
  );
}

export function LabActivityPage() {
  const { exerciseId = "", activitySlug = "" } = useParams();
  const found = findLabActivity(exerciseId, activitySlug);
  if (!found) return <NotFound />;
  const { exercise, activity } = found;
  const prev = itemAt(exercise.activities, activity.number - 2);
  const next = itemAt(exercise.activities, activity.number);

  return (
    <section className="page lab-page">
      <Link to="/lab" className="back-link">
        ← Virtual Lab
      </Link>
      <p className="lab-kicker">
        {exercise.title} · Activity {activity.number} of {exercise.activities.length}
      </p>
      <h1>{activity.title}</h1>
      <nav className="lab-activity-nav" aria-label="Activities">
        {exercise.activities.map((a) => (
          <Link key={a.slug} to={`/lab/${exercise.id}/${a.slug}`} className={`lab-activity-pill${a.slug === activity.slug ? " is-current" : ""}`} aria-current={a.slug === activity.slug ? "page" : undefined} title={a.title}>
            {a.number}
          </Link>
        ))}
      </nav>

      <div className="lab-intro">
        <details className="lab-card lab-background">
          <summary>Background</summary>
          {activity.background.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            Full walkthrough: <Link to={exercise.guide.to}>{exercise.guide.label}</Link>.
          </p>
        </details>
        <div className="lab-card lab-steps">
          <h2>Steps</h2>
          <ol>
            {activity.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <details className="lab-expected">
            <summary>What you should find</summary>
            <p>{activity.expected}</p>
          </details>
        </div>
      </div>

      {/* Keyed so switching activities starts a fresh bench. */}
      <Bench key={`${exercise.id}/${activity.slug}`} exercise={exercise} activity={activity} />

      <LabQuestions key={`q-${activity.slug}`} questions={activity.questions} />

      <nav className="lab-pager" aria-label="Previous and next activity">
        {prev ? (
          <Link to={`/lab/${exercise.id}/${prev.slug}`} className="btn btn-secondary">
            ← Activity {prev.number}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/lab/${exercise.id}/${next.slug}`} className="btn">
            Activity {next.number} →
          </Link>
        )}
      </nav>
    </section>
  );
}
