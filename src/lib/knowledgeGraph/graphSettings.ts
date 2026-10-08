import { DEFAULT_FORCES, type ForceScale } from "./layout";

// The knowledge map's settings panel, modelled on Obsidian's graph view: what's shown
// (filters), how concepts are colored (groups), how they're drawn (display) and the physics
// (forces). Saved on the device; read back through sanitize, since storage can hold anything.

export type ColorBy = "subject" | "mastery" | "none";
export type ViewMode = "2d" | "3d";
export type Projection = "perspective" | "orthographic";

export interface GraphSettings {
  /** The flat graph, or a real 3D one you can fly around. */
  view: ViewMode;
  /** Concepts drawn as lit spheres with depth (fog in 3D); off draws flat dots, which is lighter. */
  depthEffect: boolean;
  /** 3D: perspective (things shrink with distance) or orthographic (they don't). */
  projection: Projection;
  /** 3D: turn slowly around the graph. */
  autoRotate: boolean;
  colorBy: ColorBy;
  /** Only concepts taught in more than one subject or block. */
  bridgesOnly: boolean;
  /** Concepts with no links. */
  orphans: boolean;
  /** -3 (labels only close up) to 3 (labels from far out). */
  textFade: number;
  nodeSize: number;
  linkThickness: number;
  forces: ForceScale;
}

export const DEFAULT_SETTINGS: GraphSettings = {
  view: "2d",
  depthEffect: true,
  projection: "perspective",
  autoRotate: false,
  colorBy: "subject",
  bridgesOnly: false,
  orphans: true,
  textFade: 0,
  nodeSize: 1,
  linkThickness: 1,
  forces: DEFAULT_FORCES,
};

/** Slider ranges: [min, max, step]. Forces run from off to about three times the default. */
export const RANGES = {
  textFade: [-3, 3, 0.1],
  nodeSize: [0.3, 2.5, 0.05],
  linkThickness: [0.2, 3, 0.05],
  center: [0, 3, 0.05],
  repel: [0, 3, 0.05],
  link: [0, 2, 0.05],
  distance: [0.3, 3, 0.05],
} as const satisfies Record<string, readonly [number, number, number]>;

function num(value: unknown, [min, max]: readonly [number, number, number], fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** A valid settings object from whatever was stored, falling back to the defaults field by field. */
export function sanitizeSettings(raw: unknown): GraphSettings {
  const s = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const f = (typeof s.forces === "object" && s.forces !== null ? s.forces : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    view: s.view === "3d" ? "3d" : "2d",
    depthEffect: typeof s.depthEffect === "boolean" ? s.depthEffect : d.depthEffect,
    projection: s.projection === "orthographic" ? "orthographic" : "perspective",
    autoRotate: typeof s.autoRotate === "boolean" ? s.autoRotate : d.autoRotate,
    colorBy: s.colorBy === "mastery" || s.colorBy === "none" ? s.colorBy : "subject",
    bridgesOnly: typeof s.bridgesOnly === "boolean" ? s.bridgesOnly : d.bridgesOnly,
    orphans: typeof s.orphans === "boolean" ? s.orphans : d.orphans,
    textFade: num(s.textFade, RANGES.textFade, d.textFade),
    nodeSize: num(s.nodeSize, RANGES.nodeSize, d.nodeSize),
    linkThickness: num(s.linkThickness, RANGES.linkThickness, d.linkThickness),
    forces: {
      center: num(f.center, RANGES.center, d.forces.center),
      repel: num(f.repel, RANGES.repel, d.forces.repel),
      link: num(f.link, RANGES.link, d.forces.link),
      distance: num(f.distance, RANGES.distance, d.forces.distance),
    },
  };
}

/** How opaque a concept's label is at zoom k: bigger concepts' labels appear first. */
export function labelAlpha(k: number, r: number, textFade: number): number {
  const threshold = 1.1 - textFade * 0.3;
  return Math.min(1, Math.max(0, (k * Math.sqrt(r / 6) - threshold) / 0.35));
}
