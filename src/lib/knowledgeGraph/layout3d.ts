import { DEFAULT_FORCES, type ForceScale } from "./layout";
import type { KnowledgeGraph } from "./types";

// The knowledge map in three dimensions: the 2D map's forces (links, repulsion, collisions, a
// pull toward each subject's anchor) in x, y and z, with each subject's anchor on a sphere so
// subjects spread into their own regions of space. It's d3-force's velocity Verlet scheme,
// written out for 3D; repulsion is pairwise within a cutoff, plenty fast for 700 concepts.

export interface Layout3D {
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  r: Float64Array;
  /** Where each concept's subjects pull it. */
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  /** A dragged concept is pinned here (NaN when free). */
  fx: Float64Array;
  fy: Float64Array;
  fz: Float64Array;
  links: { s: number; t: number; w: number }[];
  degree: Uint16Array;
  alpha: number;
  alphaTarget: number;
}

const RING = 420;
const LINK_DISTANCE = 46;
const CHARGE = -42;
const CHARGE_RANGE = 380;
const PULL = 0.045;
const VELOCITY_KEEP = 0.6;
export const ALPHA_MIN = 0.001;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);

/** Subject anchors spread evenly over a sphere (a Fibonacci lattice). */
export function sphereAnchors(count: number, radius = RING): { x: number; y: number; z: number }[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = count === 1 ? 0 : 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    return { x: Math.cos(golden * i) * ring * radius, y: y * radius, z: Math.sin(golden * i) * ring * radius };
  });
}

/** A 3D layout starting from the 2D map (x and y become x and z), lifted toward each subject's anchor. */
export function createLayout3D(graph: KnowledgeGraph): Layout3D {
  const n = graph.nodes.length;
  const names = [...new Set(graph.nodes.map((node) => node.subjects[0]?.split("/")[1] ?? ""))].sort();
  // A few points on a sphere don't average to its centre; shift them (and the 2D start) so
  // the map unfolds around the origin, where the camera looks.
  const spots = sphereAnchors(names.length);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const sx = mean(spots.map((p) => p.x));
  const sy = mean(spots.map((p) => p.y));
  const sz = mean(spots.map((p) => p.z));
  const where = new Map(names.map((name, i) => [name, { x: spots[i].x - sx, y: spots[i].y - sy, z: spots[i].z - sz }]));
  const mx = mean(graph.nodes.map((node) => node.x));
  const my = mean(graph.nodes.map((node) => node.y));
  const L: Layout3D = {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    vz: new Float64Array(n),
    r: new Float64Array(n),
    ax: new Float64Array(n),
    ay: new Float64Array(n),
    az: new Float64Array(n),
    fx: new Float64Array(n).fill(Number.NaN),
    fy: new Float64Array(n).fill(Number.NaN),
    fz: new Float64Array(n).fill(Number.NaN),
    links: graph.edges.map((e) => ({ s: e.s, t: e.t, w: e.w })),
    degree: new Uint16Array(n),
    alpha: 1,
    alphaTarget: 0,
  };
  graph.nodes.forEach((node, i) => {
    const own = node.subjects.slice(0, 3).map((s) => where.get(s.split("/")[1] ?? "") ?? { x: 0, y: 0, z: 0 });
    L.ax[i] = own.reduce((a, c) => a + c.x, 0) / Math.max(1, own.length);
    L.ay[i] = own.reduce((a, c) => a + c.y, 0) / Math.max(1, own.length);
    L.az[i] = own.reduce((a, c) => a + c.z, 0) / Math.max(1, own.length);
    // A deterministic jitter, so the same map always unfolds the same way.
    const jitter = (((i * 2654435761) % 1000) / 1000 - 0.5) * 60;
    L.x[i] = node.x - mx;
    L.y[i] = L.ay[i] * 0.5 + jitter;
    L.z[i] = node.y - my;
    L.r[i] = node.r;
  });
  for (const e of L.links) {
    L.degree[e.s]++;
    L.degree[e.t]++;
  }
  // Positions settled at build time: start there, at rest.
  if (n > 0 && graph.nodes.every((node) => node.p3)) {
    graph.nodes.forEach((node, i) => {
      const [x, y, z] = node.p3 ?? [0, 0, 0];
      L.x[i] = x;
      L.y[i] = y;
      L.z[i] = z;
    });
    L.alpha = 0;
  }
  return L;
}

/** One step of the simulation over the shown concepts; returns false once it has come to rest. */
export function tick3D(L: Layout3D, visible: readonly boolean[], scale: ForceScale = DEFAULT_FORCES): boolean {
  L.alpha += (L.alphaTarget - L.alpha) * ALPHA_DECAY;
  const alpha = L.alpha;
  const { x, y, z, vx, vy, vz } = L;

  // Links pull toward their rest length, the lighter end moving more (as in d3).
  const distance = LINK_DISTANCE * scale.distance;
  for (const { s, t, w } of L.links) {
    if (!visible[s] || !visible[t]) continue;
    let dx = x[t] + vx[t] - x[s] - vx[s];
    let dy = y[t] + vy[t] - y[s] - vy[s];
    let dz = z[t] + vz[t] - z[s] - vz[s];
    let l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    l = ((l - distance) / l) * alpha * Math.min(0.7, w / 10) * scale.link;
    dx *= l;
    dy *= l;
    dz *= l;
    const b = L.degree[s] / (L.degree[s] + L.degree[t]);
    vx[t] -= dx * b;
    vy[t] -= dy * b;
    vz[t] -= dz * b;
    vx[s] += dx * (1 - b);
    vy[s] += dy * (1 - b);
    vz[s] += dz * (1 - b);
  }

  // Repulsion within range, and no overlaps.
  const shown: number[] = [];
  for (let i = 0; i < L.n; i++) if (visible[i]) shown.push(i);
  const strength = CHARGE * scale.repel * alpha;
  const range2 = CHARGE_RANGE * CHARGE_RANGE;
  for (let a = 0; a < shown.length; a++) {
    const i = shown[a];
    for (let b = a + 1; b < shown.length; b++) {
      const j = shown[b];
      let dx = x[j] - x[i];
      let dy = y[j] - y[i];
      let dz = z[j] - z[i];
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > range2) continue;
      if (d2 < 1e-6) {
        // Two concepts in the same spot: nudge them apart by their indexes.
        dx = ((i - j) % 3) * 0.01 + 0.01;
        dy = 0.01;
        dz = 0.01;
        d2 = dx * dx + dy * dy + dz * dz;
      }
      // strength < 0, so each is pushed away from the other.
      const f = strength / d2;
      vx[i] += dx * f;
      vy[i] += dy * f;
      vz[i] += dz * f;
      vx[j] -= dx * f;
      vy[j] -= dy * f;
      vz[j] -= dz * f;
      const reach = L.r[i] + L.r[j] + 3;
      if (d2 < reach * reach) {
        const d = Math.sqrt(d2);
        const push = ((reach - d) / d) * 0.35;
        vx[i] -= dx * push;
        vy[i] -= dy * push;
        vz[i] -= dz * push;
        vx[j] += dx * push;
        vy[j] += dy * push;
        vz[j] += dz * push;
      }
    }
  }

  // The pull toward each concept's subject, then move.
  const pull = PULL * scale.center * alpha;
  for (const i of shown) {
    vx[i] += (L.ax[i] - x[i]) * pull;
    vy[i] += (L.ay[i] - y[i]) * pull;
    vz[i] += (L.az[i] - z[i]) * pull;
    if (!Number.isNaN(L.fx[i])) {
      x[i] = L.fx[i];
      y[i] = L.fy[i];
      z[i] = L.fz[i];
      vx[i] = 0;
      vy[i] = 0;
      vz[i] = 0;
      continue;
    }
    x[i] += vx[i] *= VELOCITY_KEEP;
    y[i] += vy[i] *= VELOCITY_KEEP;
    z[i] += vz[i] *= VELOCITY_KEEP;
  }
  return L.alpha >= ALPHA_MIN || L.alphaTarget > 0;
}

/** Ticks until the layout rests (or the limit); for reduced motion, where nothing animates. */
export function settle3D(L: Layout3D, visible: readonly boolean[], scale?: ForceScale, limit = 400) {
  for (let t = 0; t < limit && tick3D(L, visible, scale); t++);
}
