import { forceCollide, forceLink, forceManyBody, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "./types";

// The map's physics, shared by the build (which lays the map out once, so it opens instantly)
// and the map page (which keeps it moving, so concepts can be dragged and the forces tuned).
// With the default strengths the page's simulation starts from the build's resting layout.

export interface LayoutNode extends SimulationNodeDatum {
  /** Index in graph.nodes. */
  i: number;
  r: number;
  /** Where its subject (or subjects) pull it. */
  cx: number;
  cy: number;
}

export interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  w: number;
}

/** Force strengths, as multiples of the defaults (1 = the build's layout). */
export interface ForceScale {
  center: number;
  repel: number;
  link: number;
  distance: number;
}

export const DEFAULT_FORCES: ForceScale = { center: 1, repel: 1, link: 1, distance: 1 };

const RING = 420;
const LINK_DISTANCE = 46;
const CHARGE = -42;
const CHARGE_RANGE = 380;
const PULL = 0.045;

/** Each subject's anchor on a circle; a concept shared by subjects sits between theirs. */
export function anchors(nodes: readonly GraphNode[]): { cx: number; cy: number }[] {
  const names = [...new Set(nodes.map((n) => n.subjects[0]?.split("/")[1] ?? ""))].sort();
  const centre = new Map(
    names.map((name, i) => {
      const angle = (i / Math.max(1, names.length)) * Math.PI * 2;
      return [name, { x: Math.cos(angle) * RING, y: Math.sin(angle) * RING }];
    }),
  );
  return nodes.map((n) => {
    const own = n.subjects.slice(0, 3).map((s) => centre.get(s.split("/")[1] ?? "") ?? { x: 0, y: 0 });
    return {
      cx: own.reduce((a, c) => a + c.x, 0) / Math.max(1, own.length),
      cy: own.reduce((a, c) => a + c.y, 0) / Math.max(1, own.length),
    };
  });
}

export function layoutLinks(edges: readonly GraphEdge[]): LayoutLink[] {
  return edges.map((e) => ({ source: e.s, target: e.t, w: e.w }));
}

/** Sets (or resets) every force on a simulation; links refer to nodes by their graph index. */
export function applyForces(simulation: Simulation<LayoutNode, LayoutLink>, links: LayoutLink[], scale: ForceScale = DEFAULT_FORCES) {
  simulation
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(links)
        .id((d) => d.i)
        .distance(LINK_DISTANCE * scale.distance)
        .strength((l) => Math.min(0.7, l.w / 10) * scale.link),
    )
    .force("charge", forceManyBody<LayoutNode>().strength(CHARGE * scale.repel).distanceMax(CHARGE_RANGE))
    .force("collide", forceCollide<LayoutNode>((d) => d.r + 3))
    .force("x", forceX<LayoutNode>((d) => d.cx).strength(PULL * scale.center))
    .force("y", forceY<LayoutNode>((d) => d.cy).strength(PULL * scale.center));
}
