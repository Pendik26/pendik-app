import { describe, expect, it } from "vitest";
import { basis, frameSphere, lerpCamera, orbit, pan, project, unproject, MAX_PITCH, type Camera } from "./camera3d";

const cam: Camera = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 500, fov: Math.PI / 3, ortho: false };

describe("orbit camera", () => {
  it("looks from +Z at the target, with +X to the right and +Y up", () => {
    const b = basis(cam);
    expect([b.cx, b.cy, b.cz].map((v) => Math.round(v))).toEqual([0, 0, 500]);
    const centre = project(cam, b, 800, 600, 0, 0, 0);
    expect(centre.x).toBeCloseTo(400);
    expect(centre.y).toBeCloseTo(300);
    expect(centre.depth).toBeCloseTo(500);
    expect(project(cam, b, 800, 600, 100, 0, 0).x).toBeGreaterThan(400);
    expect(project(cam, b, 800, 600, 0, 100, 0).y).toBeLessThan(300);
  });

  it("shrinks with distance in perspective but not in orthographic", () => {
    const b = basis(cam);
    const near = project(cam, b, 800, 600, 0, 0, 100).scale;
    const far = project(cam, b, 800, 600, 0, 0, -100).scale;
    expect(near).toBeGreaterThan(far);
    const o = { ...cam, ortho: true };
    const ob = basis(o);
    expect(project(o, ob, 800, 600, 0, 0, 100).scale).toBeCloseTo(project(o, ob, 800, 600, 0, 0, -100).scale);
  });

  it("orbits from the right at yaw 90° and clamps the pitch short of straight down", () => {
    const right = basis({ ...cam, yaw: Math.PI / 2 });
    expect(right.cx).toBeCloseTo(500);
    expect(right.cz).toBeCloseTo(0);
    expect(orbit(cam, 0, 10).pitch).toBe(MAX_PITCH);
    const top = basis({ ...cam, pitch: MAX_PITCH });
    expect(top.cy).toBeGreaterThan(499);
    expect(Number.isFinite(top.rx + top.ux + top.uz)).toBe(true);
  });

  it("pans the target with the screen and unprojects back to the same point", () => {
    const b = basis(cam);
    const moved = pan(cam, b, 600, 50, 0);
    expect(moved.tx).toBeLessThan(0);
    const p = project(cam, b, 800, 600, 30, -20, 40);
    const back = unproject(cam, b, 800, 600, p.x, p.y, p.depth);
    expect(back.x).toBeCloseTo(30);
    expect(back.y).toBeCloseTo(-20);
    expect(back.z).toBeCloseTo(40);
  });

  it("frames a sphere and eases the short way round", () => {
    expect(frameSphere(cam, 10, 20, 30, 300).dist).toBeGreaterThan(600);
    const half = lerpCamera({ ...cam, yaw: 3 }, { ...cam, yaw: -3 }, 0.5);
    expect(Math.abs(half.yaw)).toBeGreaterThan(3);
  });
});
