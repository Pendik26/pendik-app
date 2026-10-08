// An orbit camera for the knowledge map's 3D view, the way 3D editors (Blender, Unity) do it:
// it circles a target point at a distance, turned by yaw (around the vertical axis) and pitch
// (up and down). Y is up. Projection is perspective or orthographic.

export interface Camera {
  /** The point the camera looks at and orbits around. */
  tx: number;
  ty: number;
  tz: number;
  /** Radians: 0 looks from +Z toward -Z (front); π/2 looks from +X (right). */
  yaw: number;
  /** Radians, up to just under ±90°: positive looks down from above. */
  pitch: number;
  dist: number;
  /** Vertical field of view, in radians. */
  fov: number;
  ortho: boolean;
}

export interface Basis {
  /** Camera position. */
  cx: number;
  cy: number;
  cz: number;
  /** Right, up and forward unit vectors. */
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  fx: number;
  fy: number;
  fz: number;
}

export const MAX_PITCH = Math.PI / 2 - 0.001;
export const NEAR = 1;

export function basis(cam: Camera): Basis {
  const cp = Math.cos(cam.pitch);
  // From the target to the camera.
  const ox = cp * Math.sin(cam.yaw);
  const oy = Math.sin(cam.pitch);
  const oz = cp * Math.cos(cam.yaw);
  const fx = -ox;
  const fy = -oy;
  const fz = -oz;
  // right = forward × worldUp(0, 1, 0), normalised.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up = right × forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  return { cx: cam.tx + ox * cam.dist, cy: cam.ty + oy * cam.dist, cz: cam.tz + oz * cam.dist, rx, ry: 0, rz, ux, uy, uz, fx, fy, fz };
}

/** Pixels per world unit at depth 1 (perspective) or everywhere (orthographic). */
export function focal(cam: Camera, height: number): number {
  return height / 2 / Math.tan(cam.fov / 2);
}

export interface Projected {
  x: number;
  y: number;
  /** Distance in front of the camera; <= NEAR means behind it (not drawn). */
  depth: number;
  /** Pixels per world unit at this point. */
  scale: number;
}

/** A world point on screen, for a w × h viewport. */
export function project(cam: Camera, b: Basis, w: number, h: number, x: number, y: number, z: number): Projected {
  const dx = x - b.cx;
  const dy = y - b.cy;
  const dz = z - b.cz;
  const depth = dx * b.fx + dy * b.fy + dz * b.fz;
  const f = focal(cam, h);
  const scale = cam.ortho ? f / cam.dist : f / Math.max(depth, NEAR);
  return {
    x: w / 2 + (dx * b.rx + dy * b.ry + dz * b.rz) * scale,
    y: h / 2 - (dx * b.ux + dy * b.uy + dz * b.uz) * scale,
    depth,
    scale,
  };
}

/** Moves the target across the screen: dx, dy in pixels. */
export function pan(cam: Camera, b: Basis, h: number, dx: number, dy: number): Camera {
  const perPixel = cam.dist / focal(cam, h);
  return { ...cam, tx: cam.tx - (b.rx * dx - b.ux * dy) * perPixel, ty: cam.ty - (b.ry * dx - b.uy * dy) * perPixel, tz: cam.tz - (b.rz * dx - b.uz * dy) * perPixel };
}

export function orbit(cam: Camera, dYaw: number, dPitch: number): Camera {
  return { ...cam, yaw: cam.yaw + dYaw, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cam.pitch + dPitch)) };
}

/** A camera looking at a sphere (centre and radius) so it fills the view. */
export function frameSphere(cam: Camera, cx: number, cy: number, cz: number, radius: number): Camera {
  const dist = Math.max(60, (radius * 1.15) / Math.sin(cam.fov / 2));
  return { ...cam, tx: cx, ty: cy, tz: cz, dist };
}

/** The point where a screen pixel's ray meets the plane through (px, py, pz) facing the camera. */
export function unproject(cam: Camera, b: Basis, w: number, h: number, sx: number, sy: number, depth: number): { x: number; y: number; z: number } {
  const f = focal(cam, h);
  const scale = cam.ortho ? f / cam.dist : f / Math.max(depth, NEAR);
  const rx = (sx - w / 2) / scale;
  const uy = (h / 2 - sy) / scale;
  return {
    x: b.cx + b.fx * depth + b.rx * rx + b.ux * uy,
    y: b.cy + b.fy * depth + b.ry * rx + b.uy * uy,
    z: b.cz + b.fz * depth + b.rz * rx + b.uz * uy,
  };
}

/** Eases one camera toward another (t from 0 to 1); yaw takes the short way round. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  let dyaw = (b.yaw - a.yaw) % (Math.PI * 2);
  if (dyaw > Math.PI) dyaw -= Math.PI * 2;
  if (dyaw < -Math.PI) dyaw += Math.PI * 2;
  return {
    ...b,
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
    tz: a.tz + (b.tz - a.tz) * t,
    yaw: a.yaw + dyaw * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    dist: a.dist * (b.dist / a.dist) ** t,
  };
}
