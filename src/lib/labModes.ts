import type { PlotSeries } from "../components/lab/DataPlot";
import type { LabMode } from "./labActivities";

export interface Column {
  key: string;
  /** English reference text; shown through the lab translation table. */
  label: string;
  digits: number;
}

export interface ModeConfig {
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

export const range = (from: number, to: number, step: number) => {
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

export const MODES: Record<LabMode, ModeConfig> = {
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

