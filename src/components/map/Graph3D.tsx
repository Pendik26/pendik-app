import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { labelAlpha, type GraphSettings } from "../../lib/knowledgeGraph/graphSettings";
import { basis, frameSphere, lerpCamera, NEAR, orbit, pan, project, unproject, type Camera } from "../../lib/knowledgeGraph/camera3d";
import { createLayout3D, settle3D, tick3D, type Layout3D } from "../../lib/knowledgeGraph/layout3d";
import type { KnowledgeGraph } from "../../lib/knowledgeGraph/types";
import type { GraphCanvasHandle, GraphViewProps } from "./GraphCanvas";
import { FitIcon } from "./ObsIcons";
import { LabelGrid, pixelRatio, placeHoverCard, readPalette, reducedMotion, SphereSprites, type Palette } from "./render";

// The knowledge map in real 3D, navigated like a 3D editor's viewport (Blender, Unity, Unreal):
// orbit around a target, pan, dolly in and out, fly with WASD/QE, snap to front, right or top
// views from the axis gizmo or the number keys, perspective or orthographic, a grid floor
// with the X and Z axes, and depth fog. The layout is a 3D version of the map's physics, kept
// live so concepts can be dragged in space.

interface Props extends GraphViewProps {
  onSettings: (patch: Partial<GraphSettings>) => void;
}

const AXIS = { x: "#e5484d", y: "#46a758", z: "#3e7bf0" } as const;
const FLOOR_Y = -620;
const GRID_HALF = 1200;
const GRID_STEP = 100;
const FADE_MS = 160;
const LABEL_FONT_PX = 12;
const GIZMO = 84;
const MAX_RADIUS_PX = 26;

// One 3D layout per graph, kept while the page is open, so switching views doesn't re-run it.
const layouts = new WeakMap<KnowledgeGraph, Layout3D>();

const START: Camera = { tx: 0, ty: 0, tz: 0, yaw: 0.65, pitch: 0.38, dist: 1500, fov: (52 * Math.PI) / 180, ortho: false };

export const Graph3D = forwardRef<GraphCanvasHandle, Props>(function Graph3D(
  { graph, visible, styles, selected, settings, onSelect, paintKey, onSettings },
  ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gizmo = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const palette = useRef<Palette | null>(null);
  const sprites = useRef(new SphereSprites());
  const labels = useRef(new LabelGrid());
  const labelWidth = useRef(new Map<number, number>());
  const [help, setHelp] = useState(false);

  const layout = useMemo(() => {
    let L = layouts.get(graph);
    if (!L) {
      L = createLayout3D(graph);
      layouts.set(graph, L);
    }
    return L;
  }, [graph]);

  const neighbours = useMemo(() => {
    const out = graph.nodes.map(() => [] as number[]);
    for (const e of graph.edges) {
      out[e.s].push(e.t);
      out[e.t].push(e.s);
    }
    return out;
  }, [graph]);
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

  // Everything the frame loop reads lives in refs, so props changing never restarts it.
  const cam = useRef<Camera>({ ...START, ortho: settings.projection === "orthographic" });
  const tween = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
  const state = useRef({ visible, styles, selected, settings });
  state.current = { visible, styles, selected, settings };
  const simActive = useRef(layout.alpha >= 0.001);
  const interacted = useRef(false);
  /** A concept opened while the layout is still unfolding: the camera tracks it until it settles. */
  const follow = useRef<number | null>(null);
  const keys = useRef(new Set<string>());
  const hover = useRef<number | null>(null);
  const fade = useRef({ value: 0, target: 0 });
  const running = useRef(false);
  const raf = useRef(0);
  const last = useRef(0);
  const projected = useRef({ x: new Float64Array(layout.n), y: new Float64Array(layout.n), d: new Float64Array(layout.n), s: new Float64Array(layout.n) });

  // Capped, so a concept right in front of the camera doesn't fill the view.
  const radius = (i: number, scale: number) => Math.min(MAX_RADIUS_PX, Math.max(1.2, (graph.nodes[i]?.r ?? 3) * state.current.settings.nodeSize * 0.9 * scale));

  /** The visible concepts' centre and radius. */
  const sphereOf = useCallback(
    (only?: number[]) => {
      const list = only ?? graph.nodes.map((_, i) => i).filter((i) => state.current.visible[i]);
      if (list.length === 0) return { x: 0, y: 0, z: 0, r: 300 };
      let x = 0;
      let y = 0;
      let z = 0;
      for (const i of list) {
        x += layout.x[i];
        y += layout.y[i];
        z += layout.z[i];
      }
      x /= list.length;
      y /= list.length;
      z /= list.length;
      let r = 0;
      for (const i of list) r = Math.max(r, Math.hypot(layout.x[i] - x, layout.y[i] - y, layout.z[i] - z));
      return { x, y, z, r: Math.max(r, 120) };
    },
    [graph, layout],
  );

  /** A camera on a concept and its neighbourhood. */
  const frameNode = useCallback(
    (i: number) => {
      const s = sphereOf([i, ...(neighbours[i] ?? [])]);
      return frameSphere(cam.current, layout.x[i], layout.y[i], layout.z[i], Math.min(s.r, 260));
    },
    [layout, neighbours, sphereOf],
  );

  const flyTo = useCallback((to: Camera) => {
    if (reducedMotion()) {
      cam.current = to;
      tween.current = null;
    } else tween.current = { from: { ...cam.current }, to, start: performance.now() };
    kickRef.current();
  }, []);

  const drawGizmo = useCallback(() => {
    const g = gizmo.current;
    const ctx = g?.getContext("2d");
    if (!g || !ctx) return;
    const dpr = pixelRatio();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GIZMO, GIZMO);
    const b = basis(cam.current);
    const c = GIZMO / 2;
    const p = palette.current;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.fillStyle = p ? `${p.bg}cc` : "rgb(0 0 0 / 0.4)";
    ctx.fill();
    // Each axis's direction on screen, drawn back to front.
    const axes = (["x", "y", "z"] as const).flatMap((a) => {
      const v = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[a];
      const sx = v[0] * b.rx + v[1] * b.ry + v[2] * b.rz;
      const sy = -(v[0] * b.ux + v[1] * b.uy + v[2] * b.uz);
      const depth = v[0] * b.fx + v[1] * b.fy + v[2] * b.fz;
      return [
        { a, sign: 1, x: c + sx * 28, y: c + sy * 28, depth },
        { a, sign: -1, x: c - sx * 28, y: c - sy * 28, depth: -depth },
      ];
    });
    axes.sort((m, n) => n.depth - m.depth);
    for (const ax of axes) {
      const color = AXIS[ax.a];
      if (ax.sign === 1) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(ax.x, ax.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ax.x, ax.y, ax.sign === 1 ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = ax.sign === 1 ? color : `${color}55`;
      ctx.fill();
      if (ax.sign === 1) {
        ctx.fillStyle = "#fff";
        ctx.font = "700 9px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ax.a.toUpperCase(), ax.x, ax.y + 0.5);
      }
    }
  }, []);

  const draw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const p = (palette.current ??= readPalette(c));
    const { visible: vis, styles: sty, selected: sel, settings: set } = state.current;
    const dpr = pixelRatio();
    const { w, h } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const camera = cam.current;
    const b = basis(camera);
    const L = layout;
    const P = projected.current;

    // Project every shown concept once; note the depth range for the fog.
    let near = Infinity;
    let far = -Infinity;
    const order: number[] = [];
    for (let i = 0; i < L.n; i++) {
      if (!vis[i]) continue;
      const q = project(camera, b, w, h, L.x[i], L.y[i], L.z[i]);
      P.x[i] = q.x;
      P.y[i] = q.y;
      P.d[i] = q.depth;
      P.s[i] = q.scale;
      if (!camera.ortho && q.depth <= NEAR) continue;
      order.push(i);
      near = Math.min(near, q.depth);
      far = Math.max(far, q.depth);
    }
    const span = Math.max(1, far - near);
    const fogOf = (depth: number) => (set.depthEffect ? Math.min(1, Math.max(0, (depth - near) / span)) : 0);
    const inFront = (i: number) => camera.ortho || P.d[i] > NEAR;

    // The grid floor and its X (red) and Z (blue) axes, faded toward the edges.
    const segment = (x0: number, z0: number, x1: number, z1: number) => {
      let a = project(camera, b, w, h, x0, FLOOR_Y, z0);
      let e = project(camera, b, w, h, x1, FLOOR_Y, z1);
      if (!camera.ortho) {
        if (a.depth <= NEAR && e.depth <= NEAR) return null;
        // Clip the part behind the camera.
        if (a.depth <= NEAR || e.depth <= NEAR) {
          const t = (NEAR + 1 - a.depth) / (e.depth - a.depth);
          const mx = x0 + (x1 - x0) * t;
          const mz = z0 + (z1 - z0) * t;
          const m = project(camera, b, w, h, mx, FLOOR_Y, mz);
          if (a.depth <= NEAR) a = m;
          else e = m;
        }
      }
      return [a.x, a.y, e.x, e.y] as const;
    };
    ctx.lineWidth = 1;
    for (let v = -GRID_HALF; v <= GRID_HALF; v += GRID_STEP) {
      const fadeOut = 1 - Math.abs(v) / (GRID_HALF + GRID_STEP);
      for (const [x0, z0, x1, z1, axis] of [
        [v, -GRID_HALF, v, GRID_HALF, v === 0 ? AXIS.z : ""],
        [-GRID_HALF, v, GRID_HALF, v, v === 0 ? AXIS.x : ""],
      ] as const) {
        const s = segment(x0, z0, x1, z1);
        if (!s) continue;
        ctx.globalAlpha = axis ? 0.75 : 0.55 * fadeOut;
        ctx.strokeStyle = axis || p.grid;
        ctx.lineWidth = axis ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        ctx.lineTo(s[2], s[3]);
        ctx.stroke();
      }
    }

    // Hover fade.
    const hovered = hover.current;
    const lit = new Set<number>(hovered === null ? [] : [hovered, ...(neighbours[hovered] ?? [])]);
    const dim = 1 - 0.82 * fade.current.value;
    const isLit = (i: number) => lit.size === 0 || lit.has(i);
    const anchor = hovered ?? (sel !== null && vis[sel] ? sel : null);

    // Links in three depth bands (nearer is stronger), then the hovered or open concept's.
    const bands = set.depthEffect ? [new Path2D(), new Path2D(), new Path2D()] : [new Path2D()];
    const own = new Path2D();
    let hasOwn = false;
    for (const e of graph.edges) {
      if (!vis[e.s] || !vis[e.t] || !inFront(e.s) || !inFront(e.t)) continue;
      if (anchor !== null && (e.s === anchor || e.t === anchor)) {
        own.moveTo(P.x[e.s], P.y[e.s]);
        own.lineTo(P.x[e.t], P.y[e.t]);
        hasOwn = true;
        continue;
      }
      const band = bands.length === 1 ? bands[0] : bands[Math.min(2, Math.floor(fogOf((P.d[e.s] + P.d[e.t]) / 2) * 3))];
      band.moveTo(P.x[e.s], P.y[e.s]);
      band.lineTo(P.x[e.t], P.y[e.t]);
    }
    ctx.strokeStyle = p.line;
    const strength = [0.85, 0.5, 0.26];
    bands.forEach((band, k) => {
      ctx.globalAlpha = (bands.length === 1 ? 0.7 : strength[k]) * (lit.size ? dim : 1);
      ctx.lineWidth = set.linkThickness * (bands.length === 1 ? 1 : [1.2, 1, 0.8][k]);
      ctx.stroke(band);
    });
    if (hasOwn) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = set.linkThickness + 0.8;
      ctx.stroke(own);
    }

    // Concepts, far to near so nearer spheres cover farther ones.
    order.sort((a, z) => P.d[z] - P.d[a]);
    for (const i of order) {
      const r = radius(i, P.s[i]);
      const x = P.x[i];
      const y = P.y[i];
      if (x < -r || x > w + r || y < -r || y > h + r) continue;
      const fill = i === hovered ? p.accent : (sty[i]?.fill ?? p.muted);
      // Concepts between the camera and what it looks at thin out, so they don't hide it.
      const close = i === sel || (lit.size > 0 && lit.has(i)) || camera.ortho ? 1 : Math.max(0.15, Math.min(1, P.d[i] / (camera.dist * 0.45)));
      const alpha = (isLit(i) ? 1 : dim) * (1 - 0.6 * fogOf(P.d[i])) * close;
      ctx.globalAlpha = alpha;
      if (set.depthEffect) sprites.current.draw(ctx, fill, x, y, r);
      else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (sty[i]?.weak) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.weak;
        ctx.stroke();
      }
      if (i === sel) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.accent;
        ctx.stroke();
      }
    }

    // Labels: the open and hovered concepts, then the biggest on screen, never overlapping.
    ctx.font = `500 ${LABEL_FONT_PX}px ${p.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    labels.current.clear();
    const forced = new Set<number>([...(sel !== null ? [sel] : []), ...(hovered !== null ? [hovered] : []), ...lit]);
    let placed = 0;
    for (const i of [...forced, ...rank]) {
      if (!vis[i] || !inFront(i)) continue;
      const must = forced.has(i);
      if (!must && placed > 160) break;
      const node = graph.nodes[i];
      let alpha = must ? 1 : labelAlpha(P.s[i] * 1.6, node.r * set.nodeSize, set.textFade) * (1 - 0.7 * fogOf(P.d[i]));
      if (!must && lit.size) alpha *= dim;
      if (alpha < 0.05) continue;
      const x = P.x[i];
      const y = P.y[i] + radius(i, P.s[i]) + 4;
      if (x < -80 || x > w + 80 || y < -20 || y > h + 20) continue;
      let tw = labelWidth.current.get(i);
      if (tw === undefined) {
        tw = ctx.measureText(node.label).width;
        labelWidth.current.set(i, tw);
      }
      if (!labels.current.claim(x, y, tw, LABEL_FONT_PX, must)) continue;
      placed++;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.bg;
      ctx.strokeText(node.label, x, y);
      ctx.fillStyle = must || lit.has(i) ? p.text : p.muted;
      ctx.fillText(node.label, x, y);
    }
    ctx.globalAlpha = 1;
    drawGizmo();
    // radius reads settings through state; graph and layout are fixed for this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, layout, neighbours, rank, drawGizmo]);

  /** The frame loop: physics, flying, auto-rotate, camera moves and fades; stops when idle. */
  const frame = useCallback(
    (now: number) => {
      const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
      last.current = now;
      let busy = false;
      const { visible: vis, settings: set } = state.current;
      if (simActive.current) {
        const reduced = reducedMotion();
        if (reduced) {
          settle3D(layout, vis, set.forces);
          simActive.current = false;
        } else {
          simActive.current = tick3D(layout, vis, set.forces);
          busy = simActive.current;
        }
        const i = follow.current;
        if (i !== null && simActive.current && !tween.current) cam.current = { ...cam.current, tx: layout.x[i], ty: layout.y[i], tz: layout.z[i] };
        // Once the layout settles, frame the followed concept, or (unless the student has
        // taken over) everything.
        let to: Camera | null = null;
        if (!simActive.current && i !== null) {
          follow.current = null;
          to = frameNode(i);
        } else if (!simActive.current && !interacted.current) {
          const s = sphereOf();
          to = frameSphere(cam.current, s.x, s.y, s.z, s.r);
        }
        if (to && reduced) cam.current = to;
        else if (to) tween.current = { from: { ...cam.current }, to, start: now };
      }
      if (keys.current.size) {
        const b = basis(cam.current);
        const k = keys.current;
        const speed = cam.current.dist * 0.8 * dt * (k.has("shift") ? 3 : 1);
        const forward = (k.has("w") ? 1 : 0) - (k.has("s") ? 1 : 0);
        const right = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
        const up = (k.has("e") ? 1 : 0) - (k.has("q") ? 1 : 0);
        const turn = (k.has("arrowright") ? 1 : 0) - (k.has("arrowleft") ? 1 : 0);
        const tilt = (k.has("arrowdown") ? 1 : 0) - (k.has("arrowup") ? 1 : 0);
        let c = { ...cam.current };
        c.tx += (b.fx * forward + b.rx * right) * speed;
        c.ty += (b.fy * forward + up) * speed;
        c.tz += (b.fz * forward + b.rz * right) * speed;
        if (turn || tilt) c = orbit(c, turn * 1.6 * dt, tilt * 1.2 * dt);
        cam.current = c;
        tween.current = null;
        busy = true;
      }
      if (set.autoRotate && !reducedMotion() && !pointers.current.size) {
        cam.current = orbit(cam.current, 0.18 * dt, 0);
        busy = true;
      }
      const tw = tween.current;
      if (tw) {
        const t = Math.min(1, (now - tw.start) / 600);
        cam.current = lerpCamera(tw.from, tw.to, 1 - (1 - t) ** 3);
        if (t >= 1) tween.current = null;
        else busy = true;
      }
      const f = fade.current;
      if (f.value !== f.target) {
        const step = reducedMotion() ? 1 : (dt * 1000) / FADE_MS;
        f.value = f.target > f.value ? Math.min(f.target, f.value + step) : Math.max(f.target, f.value - step);
        busy = busy || f.value !== f.target;
      }
      draw();
      if (busy) raf.current = requestAnimationFrame(frameRef.current);
      else {
        running.current = false;
        last.current = 0;
      }
    },
    [layout, draw, sphereOf, frameNode],
  );
  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  /** Draws the next frame, and keeps the loop going for as long as anything moves. */
  const kickRef = useRef(() => {});
  useEffect(() => {
    kickRef.current = () => {
      if (running.current) return;
      running.current = true;
      raf.current = requestAnimationFrame(frameRef.current);
    };
  }, []);
  useEffect(() => () => { cancelAnimationFrame(raf.current); }, []);

  // A layout already at rest (laid out at build time) is framed as soon as the view opens.
  useEffect(() => {
    if (simActive.current || interacted.current) return;
    const s = sphereOf();
    cam.current = frameSphere(cam.current, s.x, s.y, s.z, s.r);
    kickRef.current();
    // Once, when the view opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Props that change the picture.
  useEffect(() => {
    kickRef.current();
  }, [visible, styles, selected, settings.depthEffect, settings.nodeSize, settings.linkThickness, settings.textFade, settings.autoRotate]);
  useEffect(() => {
    palette.current = null;
    sprites.current.clear();
    labelWidth.current.clear();
    kickRef.current();
  }, [paintKey]);
  useEffect(() => {
    cam.current = { ...cam.current, ortho: settings.projection === "orthographic" };
    kickRef.current();
  }, [settings.projection]);

  // Filters and forces let the layout move again.
  const firstRun = useRef(true);
  const { center, repel, link, distance } = settings.forces;
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (simActive.current) kickRef.current();
      return;
    }
    layout.alpha = Math.max(layout.alpha, 0.3);
    simActive.current = true;
    kickRef.current();
  }, [layout, visible, center, repel, link, distance]);

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (i: number) => {
        if (i < 0 || i >= layout.n) return;
        interacted.current = true;
        follow.current = simActive.current ? i : null;
        flyTo(frameNode(i));
      },
      fit: () => {
        const s = sphereOf();
        interacted.current = true;
        flyTo(frameSphere(cam.current, s.x, s.y, s.z, s.r));
      },
      zoom: (f: number) => {
        interacted.current = true;
        flyTo({ ...cam.current, dist: Math.min(9000, Math.max(40, cam.current.dist / f)) });
      },
    }),
    [layout, sphereOf, flyTo, frameNode],
  );

  // Size the canvases to their box and the screen's pixel density.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    const g = gizmo.current;
    if (!el || !c || !g) return;
    const resize = () => {
      const dpr = pixelRatio();
      size.current = { w: el.clientWidth, h: el.clientHeight };
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      g.width = Math.round(GIZMO * dpr);
      g.height = Math.round(GIZMO * dpr);
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    // The first unfolding needs the loop running.
    kickRef.current();
    return () => { ro.disconnect(); };
  }, [draw]);

  // Wheel dollies toward the target. A native listener, so the page doesn't scroll as well.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interacted.current = true;
      follow.current = null;
      tween.current = null;
      cam.current = { ...cam.current, dist: Math.min(9000, Math.max(40, cam.current.dist * Math.exp(e.deltaY * 0.0012))) };
      kickRef.current();
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => { c.removeEventListener("wheel", onWheel); };
  }, []);

  const views: Record<string, Partial<Camera>> = {
    front: { yaw: 0, pitch: 0 },
    back: { yaw: Math.PI, pitch: 0 },
    right: { yaw: Math.PI / 2, pitch: 0 },
    left: { yaw: -Math.PI / 2, pitch: 0 },
    top: { yaw: 0, pitch: Math.PI / 2 - 0.001 },
    bottom: { yaw: 0, pitch: -Math.PI / 2 + 0.001 },
  };
  const snap = (name: string) => {
    interacted.current = true;
    flyTo({ ...cam.current, ...views[name] });
  };

  const setHover = (i: number | null, at?: { x: number; y: number }) => {
    if (hover.current !== i) {
      hover.current = i;
      fade.current.target = i === null ? 0 : 1;
      kickRef.current();
    }
    const node = i === null ? undefined : graph.nodes[i];
    placeHoverCard(card.current, node && at ? { label: node.label, text: node.d, ...at } : null, size.current);
  };

  const hit = (px: number, py: number): number | null => {
    const P = projected.current;
    const { visible: vis } = state.current;
    let best: number | null = null;
    let bestDepth = Infinity;
    for (let i = 0; i < layout.n; i++) {
      if (!vis[i] || (!cam.current.ortho && P.d[i] <= NEAR)) continue;
      const reach = radius(i, P.s[i]) + 6;
      const dx = P.x[i] - px;
      const dy = P.y[i] - py;
      // The nearest concept under the pointer wins, as you'd expect in 3D.
      if (dx * dx + dy * dy < reach * reach && P.d[i] < bestDepth) {
        best = i;
        bestDepth = P.d[i];
      }
    }
    return best;
  };

  // Pointer: drag to orbit, right-drag (or Shift, or two fingers) to pan, drag a concept to
  // move it in space, pinch to dolly, tap to open.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const mode = useRef<"orbit" | "pan" | "node">("orbit");
  const moved = useRef(0);
  const pinch = useRef<{ span: number; dist: number; mid: { x: number; y: number } } | null>(null);
  const dragging = useRef<{ i: number; depth: number } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : { x: e.clientX, y: e.clientY };
  };

  const release = () => {
    const d = dragging.current;
    if (!d) return;
    layout.fx[d.i] = Number.NaN;
    layout.fy[d.i] = Number.NaN;
    layout.fz[d.i] = Number.NaN;
    layout.alphaTarget = 0;
    dragging.current = null;
  };

  const viewName = settings.projection === "orthographic" ? "Orthographic" : "Perspective";

  return (
    <div className="map-canvas-wrap is-3d" ref={wrap}>
      <canvas
        ref={canvas}
        className="map-canvas"
        tabIndex={0}
        role="img"
        aria-label="Knowledge map in 3D. Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom, W A S D Q E to fly. Use the concept list or search to explore with a keyboard or screen reader."
        onContextMenu={(e) => { e.preventDefault(); }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus({ preventScroll: true });
          interacted.current = true;
          follow.current = null;
          tween.current = null;
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          moved.current = 0;
          if (pointers.current.size === 2) {
            release();
            const [a, b] = [...pointers.current.values()];
            pinch.current = { span: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.current.dist, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
            return;
          }
          const i = e.button === 0 && !e.shiftKey ? hit(p.x, p.y) : null;
          if (i !== null) {
            mode.current = "node";
            dragging.current = { i, depth: projected.current.d[i] };
          } else mode.current = e.button === 2 || e.button === 1 || e.shiftKey ? "pan" : "orbit";
          kickRef.current();
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
          const { h, w } = size.current;
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const c = pan(cam.current, basis(cam.current), h, mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y);
            cam.current = { ...c, dist: Math.min(9000, Math.max(40, pinch.current.dist * (pinch.current.span / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))))) };
            pinch.current.mid = mid;
            moved.current += 10;
            kickRef.current();
            return;
          }
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          moved.current += Math.abs(dx) + Math.abs(dy);
          if (mode.current === "node" && dragging.current) {
            if (moved.current < 4) return;
            const d = dragging.current;
            const at = unproject(cam.current, basis(cam.current), w, h, p.x, p.y, d.depth);
            layout.fx[d.i] = at.x;
            layout.fy[d.i] = at.y;
            layout.fz[d.i] = at.z;
            layout.alphaTarget = 0.3;
            layout.alpha = Math.max(layout.alpha, 0.3);
            simActive.current = true;
            setHover(d.i);
            e.currentTarget.style.cursor = "grabbing";
          } else if (mode.current === "pan") {
            cam.current = pan(cam.current, basis(cam.current), h, dx, dy);
          } else {
            cam.current = orbit(cam.current, -dx * 0.006, dy * 0.006);
            setHover(null);
          }
          kickRef.current();
        }}
        onPointerUp={(e) => {
          const p = local(e);
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          release();
          if (moved.current < 6 && pointers.current.size === 0 && e.button === 0) {
            const i = hit(p.x, p.y);
            if (i !== null) onSelect(i);
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          release();
        }}
        onPointerLeave={() => { setHover(null); }}
        onDoubleClick={(e) => {
          const p = local(e);
          const i = hit(p.x, p.y);
          if (i === null) return;
          const s = sphereOf([i, ...(neighbours[i] ?? [])]);
          flyTo(frameSphere(cam.current, layout.x[i], layout.y[i], layout.z[i], Math.min(s.r, 260)));
        }}
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if (["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
            e.preventDefault();
            interacted.current = true;
            follow.current = null;
            keys.current.add(k);
            kickRef.current();
            return;
          }
          const numpad = e.code.startsWith("Numpad");
          const digit = numpad ? e.code.slice(6) : e.key;
          if (digit === "1") snap(e.ctrlKey ? "back" : "front");
          else if (digit === "3") snap(e.ctrlKey ? "left" : "right");
          else if (digit === "7") snap(e.ctrlKey ? "bottom" : "top");
          else if (digit === "5") onSettings({ projection: settings.projection === "orthographic" ? "perspective" : "orthographic" });
          else if (k === "f") {
            const sel = state.current.selected;
            const s = sphereOf(sel === null ? undefined : [sel, ...(neighbours[sel] ?? [])]);
            const at = sel === null ? s : { x: layout.x[sel], y: layout.y[sel], z: layout.z[sel], r: Math.min(s.r, 260) };
            flyTo(frameSphere(cam.current, at.x, at.y, at.z, at.r));
          } else if (k === "h" || k === "home") {
            const s = sphereOf();
            flyTo(frameSphere(cam.current, s.x, s.y, s.z, s.r));
          } else if (k === "r") onSettings({ autoRotate: !settings.autoRotate });
          else return;
          e.preventDefault();
        }}
        onKeyUp={(e) => {
          keys.current.delete(e.key.toLowerCase());
          if (e.key === "Shift") keys.current.delete("shift");
        }}
        onBlur={() => { keys.current.clear(); }}
      />
      <div className="map-3d-tools">
        <canvas
          ref={gizmo}
          className="map-gizmo"
          style={{ width: GIZMO, height: GIZMO }}
          role="img"
          aria-label="Axis gizmo: click an axis to look along it"
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - box.left;
            const py = e.clientY - box.top;
            const b = basis(cam.current);
            const c = GIZMO / 2;
            let best: string | null = null;
            let bestD = 14;
            for (const [name, v] of [["right", [1, 0, 0]], ["left", [-1, 0, 0]], ["top", [0, 1, 0]], ["bottom", [0, -1, 0]], ["front", [0, 0, 1]], ["back", [0, 0, -1]]] as const) {
              const sx = c + (v[0] * b.rx + v[1] * b.ry + v[2] * b.rz) * 28;
              const sy = c - (v[0] * b.ux + v[1] * b.uy + v[2] * b.uz) * 28;
              const d = Math.hypot(sx - px, sy - py);
              if (d < bestD) {
                best = name;
                bestD = d;
              }
            }
            if (best) snap(best);
          }}
        />
        <div className="map-3d-buttons" role="group" aria-label="3D view">
          <button type="button" className="obs-chip" onClick={() => { onSettings({ projection: settings.projection === "orthographic" ? "perspective" : "orthographic" }); }} title="Perspective or orthographic (5)">
            {viewName}
          </button>
          <button type="button" className={settings.autoRotate ? "obs-chip is-on" : "obs-chip"} aria-pressed={settings.autoRotate} onClick={() => { onSettings({ autoRotate: !settings.autoRotate }); }} title="Turn slowly around the graph (R)">
            Auto-rotate
          </button>
          <div className="map-3d-views">
            {(["front", "right", "top"] as const).map((v) => (
              <button key={v} type="button" className="obs-chip" onClick={() => { snap(v); }} title={`${v[0].toUpperCase()}${v.slice(1)} view (${v === "front" ? 1 : v === "right" ? 3 : 7})`}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className="obs-chip" onClick={() => { const s = sphereOf(); flyTo(frameSphere(cam.current, s.x, s.y, s.z, s.r)); }} title="Frame everything (H)">
            <FitIcon />
            Frame all
          </button>
          <button type="button" className={help ? "obs-chip is-on" : "obs-chip"} aria-expanded={help} onClick={() => { setHelp((v) => !v); }}>
            Controls
          </button>
        </div>
        {help && (
          <dl className="map-3d-help">
            <dt>Drag</dt>
            <dd>Orbit around the target</dd>
            <dt>Right- or Shift-drag</dt>
            <dd>Pan (two fingers on a touch screen)</dd>
            <dt>Scroll, pinch</dt>
            <dd>Zoom in and out</dd>
            <dt>W A S D</dt>
            <dd>Fly forward, left, back, right</dd>
            <dt>Q E</dt>
            <dd>Fly down, up (hold Shift to go faster)</dd>
            <dt>Arrow keys</dt>
            <dd>Orbit</dd>
            <dt>Drag a dot</dt>
            <dd>Move that concept in space</dd>
            <dt>Click</dt>
            <dd>Open a concept (double-click flies to it)</dd>
            <dt>F, H</dt>
            <dd>Frame the open concept, frame everything</dd>
            <dt>1 3 7</dt>
            <dd>Front, right, top view (Ctrl: the opposite side)</dd>
            <dt>5, R</dt>
            <dd>Perspective or orthographic, auto-rotate</dd>
          </dl>
        )}
      </div>
      <div className="map-hover-card" ref={card} hidden aria-hidden="true">
        <strong />
        <span />
      </div>
    </div>
  );
});
