// Drawing helpers shared by the knowledge map's 2D and 3D views: the theme's colors read once,
// shaded-sphere sprites for the 3D effect, and a grid that keeps labels from overlapping
// without comparing every label with every other.

export interface Palette {
  line: string;
  accent: string;
  text: string;
  muted: string;
  bg: string;
  weak: string;
  grid: string;
  font: string;
}

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    line: v("--obs-graph-line", "#2d4038"),
    accent: v("--obs-accent", "#2dd4a7"),
    text: v("--obs-text", "#eef4f1"),
    muted: v("--obs-text-muted", "#9cb3ab"),
    bg: v("--obs-bg", "#101613"),
    weak: v("--obs-weak", "#ff6b5e"),
    grid: v("--obs-graph-grid", "#1c2823"),
    font: v("--obs-font", "system-ui, sans-serif"),
  };
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Device pixels per CSS pixel, capped: beyond 2 the extra sharpness isn't worth the fill cost. */
export const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

const SPRITE = 64;

/**
 * Pre-drawn shaded spheres, one per color: a lit highlight up and to the left, a darker rim
 * and a soft contact shadow. Drawing one is a single drawImage, far cheaper than a gradient
 * per dot per frame.
 */
export class SphereSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  get(color: string): HTMLCanvasElement {
    const hit = this.cache.get(color);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = SPRITE;
    c.height = SPRITE;
    const ctx = c.getContext("2d");
    if (ctx) {
      const r = SPRITE * 0.36;
      const cx = SPRITE / 2;
      const cy = SPRITE / 2;
      // Contact shadow, offset down and right.
      const shadow = ctx.createRadialGradient(cx + r * 0.25, cy + r * 0.4, r * 0.3, cx + r * 0.25, cy + r * 0.4, r * 1.35);
      shadow.addColorStop(0, "rgb(0 0 0 / 0.35)");
      shadow.addColorStop(1, "rgb(0 0 0 / 0)");
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, SPRITE, SPRITE);
      // The ball: base color, lit from the upper left.
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      const light = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy, r);
      light.addColorStop(0, "rgb(255 255 255 / 0.75)");
      light.addColorStop(0.35, "rgb(255 255 255 / 0.12)");
      light.addColorStop(0.75, "rgb(0 0 0 / 0)");
      light.addColorStop(1, "rgb(0 0 0 / 0.38)");
      ctx.fillStyle = light;
      ctx.fill();
    }
    this.cache.set(color, c);
    return c;
  }

  /** Draws a sphere of radius r centred on (x, y). */
  draw(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number) {
    const size = r / 0.36;
    ctx.drawImage(this.get(color), x - size / 2, y - size / 2, size, size);
  }

  clear() {
    this.cache.clear();
  }
}

/** Places labels on a coarse grid of cells, so each check only looks at nearby labels. */
export class LabelGrid {
  private cells = new Map<number, { x: number; y: number; w: number }[]>();
  private readonly cw = 96;
  private readonly ch = 18;

  clear() {
    this.cells.clear();
  }

  private key(cx: number, cy: number) {
    return cx * 100003 + cy;
  }

  /** Claims the box if nothing nearby overlaps it; false if it would collide. */
  claim(x: number, y: number, w: number, h: number, force = false): boolean {
    const x0 = Math.floor((x - w / 2) / this.cw);
    const x1 = Math.floor((x + w / 2) / this.cw);
    const y0 = Math.floor(y / this.ch);
    const y1 = Math.floor((y + h) / this.ch);
    if (!force) {
      for (let cx = x0 - 1; cx <= x1 + 1; cx++) {
        for (let cy = y0 - 1; cy <= y1 + 1; cy++) {
          for (const t of this.cells.get(this.key(cx, cy)) ?? []) {
            if (Math.abs(t.x - x) < (t.w + w) / 2 + 6 && Math.abs(t.y - y) < h + 3) return false;
          }
        }
      }
    }
    const box = { x, y, w };
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(box);
        else this.cells.set(k, [box]);
      }
    }
    return true;
  }
}

/** Shows a concept's name and description next to the pointer, without re-rendering React. */
export function placeHoverCard(card: HTMLElement | null, info: { label: string; text?: string; x: number; y: number } | null, bounds: { w: number; h: number }) {
  if (!card) return;
  if (!info) {
    card.hidden = true;
    return;
  }
  const title = card.firstElementChild as HTMLElement | null;
  const body = card.lastElementChild as HTMLElement | null;
  if (title) title.textContent = info.label;
  if (body) {
    body.textContent = info.text ?? "";
    body.hidden = !info.text;
  }
  card.hidden = false;
  // Keep it on screen: flip to the left or upward near the edges.
  const cw = card.offsetWidth;
  const chh = card.offsetHeight;
  const left = info.x + 16 + cw > bounds.w ? info.x - 16 - cw : info.x + 16;
  const top = Math.min(Math.max(8, info.y - chh / 2), bounds.h - chh - 8);
  card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
