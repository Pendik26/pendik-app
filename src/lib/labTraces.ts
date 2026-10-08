// Tracings on the Virtual Lab oscilloscope: their colours and how to read a value off one.

export interface Tracing {
  id: number;
  points: [number, number][];
  /** What was varied for this run, e.g. "4.0 V" or "90 mm". */
  label: string;
  /** Colour slot (index into TRACE_COLORS), fixed for the tracing's lifetime. */
  slot: number;
}

/**
 * One colour per tracing, in a fixed order, stepped for the dark screen (validated: every slot
 * ≥ 3:1 on it, adjacent pairs separable with colour-vision deficiency). A tracing keeps its slot
 * until it is cleared, so earlier runs never change colour.
 */
export const TRACE_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;

/** The lowest colour slot not used by `tracings`. */
export function freeSlot(tracings: readonly Tracing[]): number {
  const used = new Set(tracings.map((t) => t.slot));
  for (let i = 0; i < TRACE_COLORS.length; i++) if (!used.has(i)) return i;
  return 0;
}

/** Value of a tracing at `x`, by linear interpolation; null outside it. */
export function valueAt(points: [number, number][], x: number): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last || x < first[0] || x > last[0]) return null;
  // The last point at or before x, and the one after it (binary search).
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((points.at(mid)?.[0] ?? x) <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points.at(lo) ?? first;
  const [x1, y1] = points.at(hi) ?? last;
  return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}
