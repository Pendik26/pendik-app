import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { forceSimulation, type Simulation } from "d3-force";
import { labelAlpha, type GraphSettings } from "../../lib/knowledgeGraph/graphSettings";
import { anchors, applyForces, layoutLinks, type LayoutLink, type LayoutNode } from "../../lib/knowledgeGraph/layout";
import type { KnowledgeGraph } from "../../lib/knowledgeGraph/types";
import { LabelGrid, pixelRatio, placeHoverCard, readPalette, reducedMotion, SphereSprites, type Palette } from "./render";

// The knowledge map's 2D graph view, drawn on a canvas. The layout is live: it starts from the
// build's resting positions and keeps its physics, so a concept can be dragged and the others
// follow, and filtering or tuning the forces lets the map resettle. Hovering a concept lights
// it and its links and fades the rest; labels fade in with zoom, bigger concepts first. With
// the 3D effect on, concepts are drawn as lit spheres.

export interface NodeStyle {
  fill: string;
  /** Ringed as "needs work" (mastery colors). */
  weak?: boolean;
}

export interface GraphCanvasHandle {
  focusNode: (index: number) => void;
  fit: () => void;
  zoom: (factor: number) => void;
}

export interface GraphViewProps {
  graph: KnowledgeGraph;
  visible: boolean[];
  /** One style per concept, worked out once per color change rather than per frame. */
  styles: NodeStyle[];
  /** The open concept. */
  selected: number | null;
  settings: GraphSettings;
  onSelect: (index: number | null) => void;
  /** Changes whenever colors need re-reading (theme, color mode, progress). */
  paintKey: string;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.08;
const MAX_K = 6;
const FADE_MS = 160;
const LABEL_FONT_PX = 12;

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphViewProps>(function GraphCanvas(
  { graph, visible, styles, selected, settings, onSelect, paintKey },
  ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const palette = useRef<Palette | null>(null);
  const sprites = useRef(new SphereSprites());
  const labels = useRef(new LabelGrid());
  const frame = useRef(0);
  const animation = useRef(0);
  const hover = useRef<number | null>(null);
  // Hover fade: 0 = everything normal, 1 = all but the hovered neighbourhood faded.
  const fade = useRef({ value: 0, target: 0, at: 0 });
  const labelWidth = useRef(new Map<number, number>());
  // The latest "draw on the next frame", for the simulation's ticks and the hover fade, so
  // neither depends on what's selected or hovered.
  const scheduleRef = useRef<() => void>(() => {});

  // The live layout: one node per concept, starting where the build left it.
  const nodes = useMemo<LayoutNode[]>(
    () => anchors(graph.nodes).map(({ cx, cy }, i) => ({ i, cx, cy, r: graph.nodes[i].r, x: graph.nodes[i].x, y: graph.nodes[i].y })),
    [graph],
  );
  const simulation = useRef<Simulation<LayoutNode, LayoutLink> | null>(null);

  const neighbours = useMemo(() => {
    const out = graph.nodes.map(() => [] as number[]);
    for (const e of graph.edges) {
      out[e.s].push(e.t);
      out[e.t].push(e.s);
    }
    return out;
  }, [graph]);

  // Which labels claim space first: mentions plus link weight.
  const rank = useMemo(() => {
    const degree = graph.nodes.map(() => 0);
    for (const e of graph.edges) {
      degree[e.s] += e.w;
      degree[e.t] += e.w;
    }
    return graph.nodes
      .map((n, i) => ({ i, score: n.mentions + degree[i] }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.i);
  }, [graph]);

  const { nodeSize, linkThickness, textFade, depthEffect } = settings;
  const radius = useCallback((i: number, k: number) => Math.max(1.4, (graph.nodes[i]?.r ?? 3) * nodeSize * 0.6 * Math.sqrt(k)), [graph, nodeSize]);

  const draw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const p = (palette.current ??= readPalette(c));
    const dpr = pixelRatio();
    const { w, h } = size.current;
    const { x: vx, y: vy, k } = view.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sx = (x: number) => (x - vx) * k + w / 2;
    const sy = (y: number) => (y - vy) * k + h / 2;

    // Advance the hover fade.
    const now = performance.now();
    const f = fade.current;
    if (f.value !== f.target) {
      const step = reducedMotion() ? 1 : (now - f.at) / FADE_MS;
      f.value = f.target > f.value ? Math.min(f.target, f.value + step) : Math.max(f.target, f.value - step);
      if (f.value !== f.target) requestAnimationFrame(() => { scheduleRef.current(); });
    }
    f.at = now;

    const hovered = hover.current;
    const lit = new Set<number>(hovered === null ? [] : [hovered, ...(neighbours[hovered] ?? [])]);
    const dim = 1 - 0.82 * f.value;
    const isLit = (i: number) => lit.size === 0 || lit.has(i);
    // The open concept's links stay picked out even when nothing is hovered.
    const anchor = hovered ?? (selected !== null && visible[selected] ? selected : null);

    // Links: one batched path for the ordinary ones, then the hovered or open concept's.
    const thick = linkThickness * Math.max(0.5, Math.min(1.3, k));
    ctx.lineWidth = thick;
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = 0.7 * (lit.size ? dim : 1);
    ctx.beginPath();
    let ownCount = 0;
    const own: number[] = [];
    for (const e of graph.edges) {
      if (!visible[e.s] || !visible[e.t]) continue;
      if (anchor !== null && (e.s === anchor || e.t === anchor)) {
        own.push(e.s, e.t);
        ownCount++;
        continue;
      }
      const a = nodes[e.s];
      const b = nodes[e.t];
      ctx.moveTo(sx(a.x ?? 0), sy(a.y ?? 0));
      ctx.lineTo(sx(b.x ?? 0), sy(b.y ?? 0));
    }
    ctx.stroke();
    if (ownCount) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = thick + 0.7;
      ctx.beginPath();
      for (let j = 0; j < own.length; j += 2) {
        ctx.moveTo(sx(nodes[own[j]].x ?? 0), sy(nodes[own[j]].y ?? 0));
        ctx.lineTo(sx(nodes[own[j + 1]].x ?? 0), sy(nodes[own[j + 1]].y ?? 0));
      }
      ctx.stroke();
    }

    // Concepts. Flat dots are batched into one path per color (and per faded or lit), so a
    // frame fills a handful of paths instead of 700; with the 3D effect each is a sprite.
    const flat = new Map<string, Path2D>();
    const flatDim = new Map<string, Path2D>();
    const rings: { x: number; y: number; r: number; weak: boolean; chosen: boolean }[] = [];
    for (const n of nodes) {
      const i = n.i;
      if (!visible[i]) continue;
      const r = radius(i, k);
      const x = sx(n.x ?? 0);
      const y = sy(n.y ?? 0);
      if (x < -r - 4 || x > w + r + 4 || y < -r - 4 || y > h + r + 4) continue;
      const style = styles[i];
      const fill = i === hovered ? p.accent : (style?.fill ?? p.muted);
      const on = isLit(i);
      if (depthEffect) {
        ctx.globalAlpha = on ? 1 : dim;
        sprites.current.draw(ctx, fill, x, y, r);
      } else {
        const bucket = on || dim === 1 ? flat : flatDim;
        let path = bucket.get(fill);
        if (!path) {
          path = new Path2D();
          bucket.set(fill, path);
        }
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
      }
      if (style?.weak || i === selected) rings.push({ x, y, r, weak: Boolean(style?.weak), chosen: i === selected });
    }
    for (const [fill, path] of flatDim) {
      ctx.globalAlpha = dim;
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    for (const [fill, path] of flat) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
    for (const ring of rings) {
      if (ring.weak) {
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r + 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.weak;
        ctx.stroke();
      }
      if (ring.chosen) {
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.accent;
        ctx.stroke();
      }
    }

    // Labels under the dots: faded in by zoom, never on top of each other. The hovered
    // neighbourhood and the open concept always get theirs.
    ctx.font = `500 ${LABEL_FONT_PX}px ${p.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    labels.current.clear();
    const forced = new Set<number>([...(selected !== null ? [selected] : []), ...(hovered !== null ? [hovered] : []), ...lit]);
    const done = new Set<number>();
    for (const i of [...forced, ...rank]) {
      if (done.has(i) || !visible[i]) continue;
      done.add(i);
      const must = forced.has(i);
      const node = graph.nodes[i];
      let alpha = must ? 1 : labelAlpha(k, node.r * nodeSize, textFade);
      if (!must && lit.size) alpha *= dim;
      // Ranked biggest first: once the labels have faded out, the rest are smaller still.
      if (alpha < 0.03) {
        if (!must && !lit.size) break;
        continue;
      }
      const n = nodes[i];
      const x = sx(n.x ?? 0);
      const y = sy(n.y ?? 0) + radius(i, k) + 4;
      if (x < -80 || x > w + 80 || y < -20 || y > h + 20) continue;
      let tw = labelWidth.current.get(i);
      if (tw === undefined) {
        tw = ctx.measureText(node.label).width;
        labelWidth.current.set(i, tw);
      }
      if (!labels.current.claim(x, y, tw, LABEL_FONT_PX, must)) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.bg;
      ctx.strokeText(node.label, x, y);
      ctx.fillStyle = must || lit.has(i) ? p.text : p.muted;
      ctx.fillText(node.label, x, y);
    }
    ctx.globalAlpha = 1;
  }, [graph, nodes, neighbours, rank, visible, styles, selected, linkThickness, nodeSize, textFade, depthEffect, radius]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Colors and fonts are read once per theme or color change, not every frame.
  useEffect(() => {
    palette.current = null;
    sprites.current.clear();
    labelWidth.current.clear();
    schedule();
  }, [paintKey, schedule]);

  // The simulation: created once, at rest (a new d3 simulation starts at alpha 1, which would
  // re-run the whole layout), redrawn on every tick.
  useEffect(() => {
    const sim = forceSimulation<LayoutNode, LayoutLink>([]).alpha(0).stop();
    sim.on("tick", () => { scheduleRef.current(); });
    simulation.current = sim;
    return () => {
      sim.stop();
      simulation.current = null;
    };
  }, [nodes]);

  /** Lets the layout move by at least this much (filters and forces changed). */
  const reheat = useCallback((alpha: number) => {
    const sim = simulation.current;
    if (!sim) return;
    if (reducedMotion()) {
      // No animation: settle at once and draw the result.
      sim.alpha(alpha).stop();
      sim.tick(Math.ceil(Math.log(sim.alphaMin() / alpha) / Math.log(1 - sim.alphaDecay())));
      scheduleRef.current();
      return;
    }
    sim.alpha(Math.max(sim.alpha(), alpha)).restart();
  }, []);

  // Only the shown concepts take part, so filtering lets the rest close up. The first run
  // starts from the build's layout, already at rest: nothing to move.
  const firstRun = useRef(true);
  const { center, repel, link, distance } = settings.forces;
  useEffect(() => {
    const sim = simulation.current;
    if (!sim) return;
    sim.nodes(nodes.filter((n) => visible[n.i]));
    applyForces(sim, layoutLinks(graph.edges.filter((e) => visible[e.s] && visible[e.t])), { center, repel, link, distance });
    if (firstRun.current) {
      firstRun.current = false;
      scheduleRef.current();
      return;
    }
    reheat(0.35);
  }, [graph, nodes, visible, center, repel, link, distance, reheat]);

  const bounds = useCallback(
    (only?: number[]) => {
      const list = (only ?? nodes.filter((n) => visible[n.i]).map((n) => n.i)).flatMap((i) => nodes.slice(i, i + 1));
      if (list.length === 0) return { x: 0, y: 0, k: 1 };
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const n of list) {
        x0 = Math.min(x0, n.x ?? 0);
        x1 = Math.max(x1, n.x ?? 0);
        y0 = Math.min(y0, n.y ?? 0);
        y1 = Math.max(y1, n.y ?? 0);
      }
      const { w, h } = size.current;
      const k = Math.min(4, Math.max(MIN_K * 2, Math.min(w / (x1 - x0 + 120), h / (y1 - y0 + 120))));
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k };
    },
    [nodes, visible],
  );

  const animateTo = useCallback(
    (to: View) => {
      cancelAnimationFrame(animation.current);
      const from = { ...view.current };
      const start = performance.now();
      const step = (t: number) => {
        const p = reducedMotion() ? 1 : Math.min(1, (t - start) / 450);
        const e = 1 - (1 - p) ** 3;
        view.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e };
        draw();
        if (p < 1) animation.current = requestAnimationFrame(step);
      };
      animation.current = requestAnimationFrame(step);
    },
    [draw],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (i: number) => {
        const n = nodes.at(i);
        if (!n) return;
        const b = bounds([i, ...(neighbours[i] ?? [])]);
        animateTo({ x: n.x ?? 0, y: n.y ?? 0, k: Math.max(0.9, Math.min(1.6, b.k)) });
      },
      fit: () => { animateTo(bounds()); },
      zoom: (f: number) => { animateTo({ ...view.current, k: Math.min(MAX_K, Math.max(MIN_K, view.current.k * f)) }); },
    }),
    [nodes, neighbours, bounds, animateTo],
  );

  // Size the canvas to its box and the screen's pixel density; fit the map the first time.
  const fitted = useRef(false);
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const resize = () => {
      const dpr = pixelRatio();
      size.current = { w: el.clientWidth, h: el.clientHeight };
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      if (!fitted.current && el.clientWidth > 0) {
        view.current = bounds();
        fitted.current = true;
      }
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, [bounds, draw]);

  useEffect(schedule, [schedule]);

  // Wheel zoom, around the pointer. A native listener, so the page doesn't scroll as well.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = c.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      const { w, h } = size.current;
      const v = view.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0015)));
      const wx = (px - w / 2) / v.k + v.x;
      const wy = (py - h / 2) / v.k + v.y;
      view.current = { k, x: wx - (px - w / 2) / k, y: wy - (py - h / 2) / k };
      scheduleRef.current();
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => { c.removeEventListener("wheel", onWheel); };
  }, []);

  const setHover = (i: number | null, at?: { x: number; y: number }) => {
    if (hover.current !== i) {
      hover.current = i;
      fade.current.target = i === null ? 0 : 1;
      fade.current.at = performance.now();
      scheduleRef.current();
    }
    const node = i === null ? undefined : graph.nodes[i];
    placeHoverCard(card.current, node && at ? { label: node.label, text: node.d, ...at } : null, size.current);
  };

  // Pointer: drag empty space to pan, drag a concept to move it, pinch to zoom, tap to open.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const dragging = useRef<LayoutNode | null>(null);

  const toWorld = (p: { x: number; y: number }) => {
    const { w, h } = size.current;
    const v = view.current;
    return { x: (p.x - w / 2) / v.k + v.x, y: (p.y - h / 2) / v.k + v.y };
  };

  const hit = (px: number, py: number): number | null => {
    const { w, h } = size.current;
    const { x: vx, y: vy, k } = view.current;
    let best: number | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (!visible[n.i]) continue;
      const dx = ((n.x ?? 0) - vx) * k + w / 2 - px;
      const dy = ((n.y ?? 0) - vy) * k + h / 2 - py;
      const reach = radius(n.i, k) + 7;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const d = Math.hypot(dx, dy);
      if (d < reach && d < bestD) {
        best = n.i;
        bestD = d;
      }
    }
    return best;
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : { x: e.clientX, y: e.clientY };
  };

  const release = () => {
    const n = dragging.current;
    if (!n) return;
    n.fx = null;
    n.fy = null;
    dragging.current = null;
    simulation.current?.alphaTarget(0);
  };

  return (
    <div className="map-canvas-wrap" ref={wrap}>
      <canvas
        ref={canvas}
        className="map-canvas"
        role="img"
        aria-label="Knowledge map graph. Use the concept list or search to explore it with a keyboard or screen reader."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          moved.current = 0;
          if (pointers.current.size === 2) {
            release();
            const [a, b] = [...pointers.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
            return;
          }
          const i = hit(p.x, p.y);
          dragging.current = i === null ? null : (nodes[i] ?? null);
        }}
        onPointerMove={(e) => {
          const p = local(e);
          const prev = pointers.current.get(e.pointerId);
          if (!prev) {
            const i = e.pointerType === "mouse" ? hit(p.x, p.y) : null;
            setHover(i, p);
            e.currentTarget.style.cursor = i === null ? "grab" : "pointer";
            return;
          }
          pointers.current.set(e.pointerId, p);
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            view.current.k = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d)));
            moved.current += 10;
            scheduleRef.current();
            return;
          }
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          moved.current += Math.abs(dx) + Math.abs(dy);
          const node = dragging.current;
          if (node) {
            if (moved.current < 4) return;
            // Pull the concept along; its links drag the neighbours after it.
            const world = toWorld(p);
            node.fx = world.x;
            node.fy = world.y;
            setHover(node.i);
            const sim = simulation.current;
            if (sim && !reducedMotion()) sim.alphaTarget(0.25).restart();
            else if (sim) {
              sim.tick(3);
              scheduleRef.current();
            }
            e.currentTarget.style.cursor = "grabbing";
            return;
          }
          view.current.x -= dx / view.current.k;
          view.current.y -= dy / view.current.k;
          setHover(null);
          scheduleRef.current();
        }}
        onPointerUp={(e) => {
          const p = local(e);
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          release();
          if (moved.current < 6 && pointers.current.size === 0) onSelect(hit(p.x, p.y));
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          release();
        }}
        onPointerLeave={() => { setHover(null); }}
      />
      <div className="map-hover-card" ref={card} hidden aria-hidden="true">
        <strong />
        <span />
      </div>
    </div>
  );
});
