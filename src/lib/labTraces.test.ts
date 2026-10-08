import { describe, expect, it } from "vitest";
import { TRACE_COLORS, freeSlot, valueAt, type Tracing } from "./labTraces";

const t = (id: number, slot: number): Tracing => ({ id, slot, label: `${id}`, points: [] });

describe("freeSlot", () => {
  it("gives each tracing its own colour and reuses a colour only after its tracing is gone", () => {
    expect(freeSlot([])).toBe(0);
    expect(freeSlot([t(1, 0), t(2, 1)])).toBe(2);
    // The tracing in slot 0 was dropped: its colour is free again, the others keep theirs.
    expect(freeSlot([t(2, 1), t(3, 2)])).toBe(0);
    const full = TRACE_COLORS.map((_, i) => t(i + 1, i));
    expect(freeSlot(full.slice(1))).toBe(0);
  });
});

describe("valueAt", () => {
  it("interpolates between samples and is null outside the tracing", () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 2],
      [20, 1],
    ];
    expect(valueAt(pts, 5)).toBe(1);
    expect(valueAt(pts, 15)).toBe(1.5);
    expect(valueAt(pts, 25)).toBeNull();
    expect(valueAt([], 1)).toBeNull();
  });
});
