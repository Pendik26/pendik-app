import { describe, expect, it } from "vitest";
import {
  MUSCLE,
  activeForceAt,
  fatigueRun,
  isotonicTwitch,
  lengthFactor,
  passiveForce,
  recruitment,
  stimulusTrain,
  tetanicForce,
  twitchShape,
  TWITCH_PEAK_MS,
} from "./muscleSim";

const peak = (fn: (t: number) => number, from: number, to: number, step = 0.25) => {
  let best = 0;
  for (let t = from; t <= to; t += step) best = Math.max(best, fn(t));
  return best;
};

describe("recruitment", () => {
  it("is zero below threshold and complete from the maximal stimulus", () => {
    expect(recruitment(0)).toBe(0);
    expect(recruitment(0.7)).toBe(0);
    expect(recruitment(MUSCLE.thresholdV)).toBeGreaterThan(0);
    expect(recruitment(MUSCLE.maximalV)).toBeCloseTo(1, 6);
    expect(recruitment(10)).toBeCloseTo(1, 6);
  });

  it("rises with voltage between threshold and maximal", () => {
    let last = 0;
    for (let v = 0.8; v <= 8.5; v += 0.5) {
      const r = recruitment(v);
      expect(r).toBeGreaterThan(last);
      last = r;
    }
  });
});

describe("single twitch", () => {
  const twitch = (voltage: number, length = 75) => (t: number) => activeForceAt([{ t: 0, recruit: recruitment(voltage) }], t, length);

  it("stays flat during the latent period, then peaks at 1.82 g for a maximal stimulus", () => {
    expect(twitchShape(MUSCLE.latentMs)).toBe(0);
    expect(twitchShape(MUSCLE.latentMs + 0.5)).toBeGreaterThan(0);
    expect(twitch(8.5)(TWITCH_PEAK_MS)).toBeCloseTo(MUSCLE.twitchPeakG, 2);
    expect(peak(twitch(10), 0, 150)).toBeCloseTo(MUSCLE.twitchPeakG, 2);
  });

  it("has the same latent period at every voltage", () => {
    for (const v of [2, 4, 8.5]) {
      expect(twitch(v)(MUSCLE.latentMs)).toBe(0);
      expect(twitch(v)(MUSCLE.latentMs + 0.5)).toBeGreaterThan(0);
    }
  });

  it("has relaxed by 150 ms", () => {
    expect(twitch(8.5)(150)).toBeLessThan(0.1);
  });
});

describe("summation and tetanus", () => {
  it("gives a higher second peak when the second stimulus comes during relaxation", () => {
    const stim = [
      { t: 0, recruit: 1 },
      { t: 60, recruit: 1 },
    ];
    const second = peak((t) => activeForceAt(stim, t, 75), 60, 150);
    expect(second).toBeGreaterThan(MUSCLE.twitchPeakG * 1.15);
  });

  it("gives equal twitches when the muscle relaxes fully in between", () => {
    const stim = [
      { t: 0, recruit: 1 },
      { t: 400, recruit: 1 },
    ];
    expect(peak((t) => activeForceAt(stim, t, 75), 400, 500)).toBeCloseTo(MUSCLE.twitchPeakG, 1);
  });

  it("is unfused at 50 stimuli/s and fused by 130", () => {
    const ripple = (rate: number) => {
      const stim = stimulusTrain(0, 1000, rate, 1);
      let lo = Infinity;
      let hi = 0;
      for (let t = 600; t < 900; t += 0.25) {
        const f = activeForceAt(stim, t, 75);
        lo = Math.min(lo, f);
        hi = Math.max(hi, f);
      }
      return (hi - lo) / hi;
    };
    expect(ripple(50)).toBeGreaterThan(0.05);
    expect(ripple(130)).toBeLessThan(0.02);
  });

  it("levels off at maximal tetanic tension, well above a twitch", () => {
    expect(tetanicForce(50)).toBeGreaterThan(MUSCLE.twitchPeakG);
    expect(tetanicForce(146)).toBeGreaterThan(tetanicForce(130));
    expect(tetanicForce(150) - tetanicForce(146)).toBeLessThan(0.02);
    expect(tetanicForce(150)).toBeGreaterThan(2.2 * MUSCLE.twitchPeakG);
  });
});

describe("length–tension", () => {
  it("peaks active force at 75 mm and adds passive force only when stretched", () => {
    expect(lengthFactor(75)).toBe(1);
    expect(lengthFactor(50)).toBeLessThan(0.6);
    expect(lengthFactor(100)).toBeLessThan(0.6);
    expect(passiveForce(75)).toBe(0);
    expect(passiveForce(60)).toBe(0);
    expect(passiveForce(90)).toBeGreaterThan(passiveForce(80));
    // Total force dips past the optimum, then climbs again.
    const total = (l: number) => lengthFactor(l) * MUSCLE.twitchPeakG + passiveForce(l);
    expect(total(85)).toBeLessThan(total(75));
    expect(total(100)).toBeGreaterThan(total(90));
  });
});

describe("fatigue", () => {
  it("declines during continuous stimulation and recovers more after longer rest", () => {
    const run = fatigueRun([[0, 10]], 120, 1, 12);
    const at = (s: number) => run.points.find(([t]) => t >= s)![1];
    expect(at(1)).toBeGreaterThan(at(9));
    const short = fatigueRun([[0, 10], [15, 20]], 120, 1, 20).peaks[1];
    const long = fatigueRun([[0, 10], [30, 35]], 120, 1, 35).peaks[1];
    expect(long).toBeGreaterThan(short);
  });
});

describe("isotonic contraction", () => {
  it("lifts lighter loads sooner and faster, and cannot lift a load above the twitch force", () => {
    const light = isotonicTwitch(0.5, 1, 200);
    const heavy = isotonicTwitch(1.5, 1, 200);
    const tooHeavy = isotonicTwitch(2, 1, 200);
    expect(light.latentMs!).toBeLessThan(heavy.latentMs!);
    expect(light.velocityMmS).toBeGreaterThan(heavy.velocityMmS);
    expect(light.shorteningMm).toBeGreaterThan(heavy.shorteningMm);
    expect(tooHeavy.latentMs).toBeNull();
    expect(tooHeavy.velocityMmS).toBe(0);
    expect(tooHeavy.shorteningMm).toBe(0);
    expect(light.points.at(-1)![1]).toBe(0);
  });
});
