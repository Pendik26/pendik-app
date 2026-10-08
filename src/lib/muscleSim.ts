// A small model of an isolated skeletal muscle on a force transducer, for the Virtual Lab's
// practice runs of the PhysioEx Exercise 2 dry lab. It reproduces the shapes and landmark
// numbers the practicum uses (threshold ~0.8 V, maximal stimulus ~8.5 V, a 1.82 g twitch,
// optimal length 75 mm, fused tetanus by ~130 stimuli/s, a steady fall in force with fatigue,
// slower shortening under heavier loads), not the internal equations of the published program.
// Times are in milliseconds unless a name says otherwise; forces are in grams.

export const MUSCLE = {
  /** Smallest voltage that produces any force. */
  thresholdV: 0.8,
  /** Voltage at which every fiber is recruited. */
  maximalV: 8.5,
  /** The stimulator's range. */
  maxV: 10,
  /** Stimulus to the first rise in force (excitation–contraction coupling). */
  latentMs: 2.8,
  /** Contraction phase: first rise to peak force. */
  riseMs: 15,
  /** Relaxation: time constant and shape of the fall from the peak. */
  decayMs: 55,
  decayShape: 1.4,
  /** Peak of a single maximal twitch at the optimal length. */
  twitchPeakG: 1.82,
  optimalLengthMm: 75,
  minLengthMm: 50,
  maxLengthMm: 100,
} as const;

// Summation is modelled as a saturating function of the summed "activation" of every twitch in
// progress: force = FORCE_CAP · (1 − e^(−S/SATURATION)). One twitch (S peaks at 1) gives
// twitchPeakG, and overlapping twitches add less and less as the muscle nears its maximal
// tetanic tension.
const SATURATION = 2;
const FORCE_CAP = MUSCLE.twitchPeakG / (1 - Math.exp(-1 / SATURATION));

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Fraction of fibers (motor units) a stimulus of this voltage recruits, 0–1. */
export function recruitment(voltage: number): number {
  if (voltage < MUSCLE.thresholdV - 1e-9) return 0;
  const x = clamp((voltage - MUSCLE.thresholdV) / (MUSCLE.maximalV - MUSCLE.thresholdV), 0, 1);
  // A few fibers fire right at threshold; most are recruited over the first few volts.
  return 0.02 + 0.98 * (1 - (1 - x) ** 2.2);
}

/** Normalised twitch (peak 1) at `t` ms after the stimulus. Zero during the latent period. */
export function twitchShape(t: number): number {
  const c = t - MUSCLE.latentMs;
  if (c <= 0) return 0;
  if (c < MUSCLE.riseMs) return Math.sin((Math.PI / 2) * (c / MUSCLE.riseMs)) ** 2;
  return Math.exp(-(((c - MUSCLE.riseMs) / MUSCLE.decayMs) ** MUSCLE.decayShape));
}

/** Time from the stimulus to peak force of a single twitch. */
export const TWITCH_PEAK_MS = MUSCLE.latentMs + MUSCLE.riseMs;

/** After this long a twitch has finished (below 0.1% of its peak). */
const TWITCH_END_MS = MUSCLE.latentMs + MUSCLE.riseMs + MUSCLE.decayMs * Math.log(1000) ** (1 / MUSCLE.decayShape);

/**
 * Active force relative to the optimal length: 1 at 75 mm, falling to ~0.55 at 50 mm and ~0.45
 * at 100 mm (filament overlap is lost faster on stretching than on shortening).
 */
export function lengthFactor(lengthMm: number): number {
  const stretch = lengthMm - MUSCLE.optimalLengthMm;
  const d = stretch / (stretch > 0 ? 28 : 32.4);
  return Math.exp(-d * d);
}

/** Passive (elastic, mostly titin) force of the resting muscle stretched to this length. */
export function passiveForce(lengthMm: number): number {
  const stretch = lengthMm - MUSCLE.optimalLengthMm;
  return stretch <= 0 ? 0 : 0.000705 * stretch ** 2.4;
}

export interface Stimulus {
  /** When it was delivered, ms from the start of the sweep. */
  t: number;
  /** Fraction of fibers it recruits (from `recruitment`). */
  recruit: number;
}

/**
 * Active force at time `t` from every stimulus delivered so far. Stimuli must be sorted by time.
 * `fatigue` scales the force (1 = fresh muscle).
 */
export function activeForceAt(stimuli: readonly Stimulus[], t: number, lengthMm: number, fatigue = 1): number {
  let activation = 0;
  let recruit = 0;
  // Walk back from the latest stimulus; older twitches have ended and contribute nothing.
  for (const s of [...stimuli].reverse()) {
    const since = t - s.t;
    if (since < 0) continue;
    if (since > TWITCH_END_MS) break;
    const w = twitchShape(since);
    if (w > 0) {
      activation += w;
      recruit = Math.max(recruit, s.recruit);
    }
  }
  if (activation === 0) return 0;
  return recruit * FORCE_CAP * (1 - Math.exp(-activation / SATURATION)) * lengthFactor(lengthMm) * fatigue;
}

/** Evenly spaced stimuli from `fromMs` (inclusive) to `toMs` (exclusive) at `perSecond`. */
export function stimulusTrain(fromMs: number, toMs: number, perSecond: number, recruit: number): Stimulus[] {
  const out: Stimulus[] = [];
  if (perSecond <= 0) return out;
  const period = 1000 / perSecond;
  for (let t = fromMs; t < toMs - 1e-9; t += period) out.push({ t, recruit });
  return out;
}

/** Area under one normalised twitch, in ms: sets how much a train of twitches sums. */
const TWITCH_AREA_MS = (() => {
  let area = 0;
  for (let t = 0; t < TWITCH_END_MS; t += 0.05) area += twitchShape(t) * 0.05;
  return area;
})();

/** Mean steady force of a train at `perSecond` (the tetanic plateau), at the optimal length. */
export function tetanicForce(perSecond: number, recruit = 1): number {
  const activation = (perSecond / 1000) * TWITCH_AREA_MS;
  return recruit * FORCE_CAP * (1 - Math.exp(-activation / SATURATION));
}

/** Largest force any stimulation can produce: the maximal tetanic tension. */
export const MAX_TETANIC_G = FORCE_CAP;

// ---------------------------------------------------------------------------------------------
// Fatigue (Activity 5) runs on a scale of seconds, so it is modelled on the tetanic plateau
// rather than twitch by twitch. A reserve `phi` (1 = fresh) drains while the muscle is
// stimulated and refills during rest.

/** Time constants for the fatigue reserve, in seconds. */
export const FATIGUE = { drainSec: 6, recoverSec: 15, onsetSec: 0.08, relaxSec: 0.1 } as const;

/** The reserve after `dtSec` more seconds of stimulation (or rest). */
export function fatigueStep(phi: number, dtSec: number, stimulating: boolean): number {
  return stimulating
    ? phi * Math.exp(-dtSec / FATIGUE.drainSec)
    : 1 - (1 - phi) * Math.exp(-dtSec / FATIGUE.recoverSec);
}

export interface FatigueState {
  /** Reserve left, 1 = fresh. */
  phi: number;
  force: number;
}

/** Advance a fatigue sweep by `dtSec`, stimulating at a train whose fresh plateau is `plateauG`. */
export function fatigueTick(state: FatigueState, dtSec: number, stimulating: boolean, plateauG: number): FatigueState {
  const force = stimulating
    ? // Force climbs quickly toward the (fatiguing) plateau...
      state.force + (plateauG * state.phi - state.force) * (1 - Math.exp(-dtSec / FATIGUE.onsetSec))
    : // ...and relaxes quickly when stimulation stops.
      state.force * Math.exp(-dtSec / FATIGUE.relaxSec);
  return { phi: fatigueStep(state.phi, dtSec, stimulating), force };
}

export interface FatigueRun {
  /** Samples of [time s, force g]. */
  points: [number, number][];
  /** Seconds of rest before each restart (after the first bout). */
  rests: number[];
  /** Peak force of each bout of stimulation. */
  peaks: number[];
}

/**
 * Force over a fatigue sweep. `bouts` are [start s, stop s] pairs of stimulation at `perSecond`;
 * the reserve drains during each bout and refills between them.
 */
export function fatigueRun(bouts: readonly [number, number][], perSecond: number, recruit: number, endSec: number, stepSec = 0.02): FatigueRun {
  const plateau = tetanicForce(perSecond, recruit);
  const points: [number, number][] = [];
  const peaks: number[] = bouts.map(() => 0);
  const rests = bouts.slice(1).map((b, i) => b[0] - (bouts.at(i)?.[1] ?? b[0]));
  let state: FatigueState = { phi: 1, force: 0 };
  for (let t = 0; t <= endSec + 1e-9; t += stepSec) {
    const bout = bouts.findIndex(([a, b]) => t >= a && t < b);
    state = fatigueTick(state, stepSec, bout !== -1, plateau);
    if (bout !== -1) peaks.splice(bout, 1, Math.max(peaks.at(bout) ?? 0, state.force));
    points.push([t, state.force]);
  }
  return { points, rests, peaks };
}

// ---------------------------------------------------------------------------------------------
// Isotonic contraction (Activity 7): the muscle lifts a load. It develops tension isometrically
// until the tension equals the load; only then does it shorten, at a speed set by the
// force–velocity (Hill) relation, and it lowers the load again as tension falls below it.

/** Shortening velocity with no load, mm/s. */
export const MAX_VELOCITY_MM_S = 100;
const HILL_A = 0.3;

/** Shortening velocity (mm/s) against `loadG` for a muscle whose isometric twitch peak is `peakG`. */
export function shorteningVelocity(loadG: number, peakG: number): number {
  if (peakG <= 0 || loadG >= peakG) return 0;
  return (MAX_VELOCITY_MM_S * HILL_A * (peakG - loadG)) / (loadG + HILL_A * peakG);
}

export interface IsotonicTwitch {
  /** Time from the stimulus until the load starts to move (ms), or null if it never moves. */
  latentMs: number | null;
  velocityMmS: number;
  /** Furthest the muscle shortened, mm. */
  shorteningMm: number;
  /** Samples of [time ms, shortening mm]. */
  points: [number, number][];
}

/** One stimulus with the muscle lifting `loadG` at the optimal length. */
export function isotonicTwitch(loadG: number, recruit: number, endMs: number, stepMs = 0.5): IsotonicTwitch {
  const stim: Stimulus[] = [{ t: 0, recruit }];
  const peakG = recruit * MUSCLE.twitchPeakG;
  const v = shorteningVelocity(loadG, peakG);
  const points: [number, number][] = [];
  let latentMs: number | null = null;
  let x = 0;
  let maxX = 0;
  for (let t = 0; t <= endMs + 1e-9; t += stepMs) {
    const f = activeForceAt(stim, t, MUSCLE.optimalLengthMm);
    if (v > 0 && f >= loadG && loadG > 0) {
      if (latentMs === null) latentMs = t;
      x += (v * stepMs) / 1000;
    } else if (x > 0) {
      // Once tension drops below the load, the load stretches the muscle back.
      x = Math.max(0, x - (v * stepMs) / 1000);
    }
    maxX = Math.max(maxX, x);
    points.push([t, x]);
  }
  return { latentMs, velocityMmS: v, shorteningMm: maxX, points };
}
