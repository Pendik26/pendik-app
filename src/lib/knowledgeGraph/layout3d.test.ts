import { describe, expect, it } from "vitest";
import { createLayout3D, settle3D, sphereAnchors, tick3D, ALPHA_MIN } from "./layout3d";
import type { KnowledgeGraph } from "./types";

function graphOf(n: number, links: [number, number][]): KnowledgeGraph {
  return {
    version: 1,
    nodes: Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      label: `C${i}`,
      x: (i % 5) * 40,
      y: Math.floor(i / 5) * 40,
      r: 4,
      subjects: [i < n / 2 ? "1.2/anatomy" : "1.2/physiology"],
      mentions: 3,
      sections: [],
      cards: {},
      questions: {},
      labels: {},
    })),
    edges: links.map(([s, t]) => ({ s, t, w: 5 })),
  };
}

describe("sphereAnchors", () => {
  it("spreads anchors over a sphere of the given radius", () => {
    const pts = sphereAnchors(4, 100);
    for (const p of pts) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(100, 5);
    expect(new Set(pts.map((p) => p.y.toFixed(3))).size).toBe(4);
  });
});

describe("3D layout", () => {
  const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [10, 11], [11, 12]];

  it("settles to finite positions, with linked concepts closer than unlinked ones", () => {
    const L = createLayout3D(graphOf(20, links));
    const visible = Array(20).fill(true);
    settle3D(L, visible);
    expect(L.alpha).toBeLessThan(ALPHA_MIN);
    for (let i = 0; i < L.n; i++) expect(Number.isFinite(L.x[i] + L.y[i] + L.z[i])).toBe(true);
    const dist = (a: number, b: number) => Math.hypot(L.x[a] - L.x[b], L.y[a] - L.y[b], L.z[a] - L.z[b]);
    const linked = links.reduce((s, [a, b]) => s + dist(a, b), 0) / links.length;
    expect(linked).toBeLessThan(dist(0, 19));
  });

  it("pushes unlinked concepts apart", () => {
    const L = createLayout3D(graphOf(2, []));
    L.ax.fill(0);
    L.ay.fill(0);
    L.az.fill(0);
    L.x.set([-10, 10]);
    L.y.set([0, 0]);
    L.z.set([0, 0]);
    tick3D(L, [true, true], { center: 0, repel: 1, link: 1, distance: 1 });
    expect(L.x[1] - L.x[0]).toBeGreaterThan(20);
  });

  it("uses all three dimensions and separates subjects", () => {
    const L = createLayout3D(graphOf(20, links));
    settle3D(L, Array(20).fill(true));
    const spread = (a: Float64Array) => Math.max(...a) - Math.min(...a);
    expect(spread(L.y)).toBeGreaterThan(20);
    const mean = (from: number, to: number, a: Float64Array) => a.slice(from, to).reduce((s, v) => s + v, 0) / (to - from);
    const gap = Math.hypot(mean(0, 10, L.x) - mean(10, 20, L.x), mean(0, 10, L.y) - mean(10, 20, L.y), mean(0, 10, L.z) - mean(10, 20, L.z));
    expect(gap).toBeGreaterThan(100);
  });

  it("is deterministic, leaves hidden concepts alone and holds a pinned one", () => {
    const a = createLayout3D(graphOf(20, links));
    const b = createLayout3D(graphOf(20, links));
    const visible = Array(20).fill(true);
    visible[5] = false;
    a.fx[0] = 1;
    a.fy[0] = 2;
    a.fz[0] = 3;
    b.fx[0] = 1;
    b.fy[0] = 2;
    b.fz[0] = 3;
    const hidden = [a.x[5], a.y[5], a.z[5]];
    for (let t = 0; t < 50; t++) {
      tick3D(a, visible);
      tick3D(b, visible);
    }
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect([a.x[5], a.y[5], a.z[5]]).toEqual(hidden);
    expect([a.x[0], a.y[0], a.z[0]]).toEqual([1, 2, 3]);
  });
});

describe("3D layout from the build", () => {
  it("starts at rest where the build put each concept", () => {
    const graph = graphOf(3, [[0, 1]]);
    graph.nodes.forEach((node, i) => {
      node.p3 = [i * 10, i * 20, i * 30];
    });
    const L = createLayout3D(graph);
    expect(L.alpha).toBe(0);
    expect([L.x[2], L.y[2], L.z[2]]).toEqual([20, 40, 60]);
    expect(tick3D(L, [true, true, true])).toBe(false);
  });
});
