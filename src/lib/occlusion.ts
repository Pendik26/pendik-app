import type { CardState, Flashcard, OcclusionMask, OcclusionNote } from "../types/content";
import { isDue } from "./sm2";

/** One card per hidden label: "{noteId}:{maskId}". */
export function occlusionCardId(note: OcclusionNote, mask: OcclusionMask): string {
  return `${note.id}:${mask.id}`;
}

export interface OcclusionCard extends Flashcard {
  note: OcclusionNote;
  mask: OcclusionMask;
  /** Position in the whole deck, and of its figure among the figures: navigation follows these. */
  order: number;
  noteIndex: number;
}

/**
 * The deck's cards, figure by figure, so consecutive cards usually share an image. Each is also a
 * Flashcard (front = figure and label, tags = region) so the spaced-repetition hook, sync and
 * "hardest cards" work on it unchanged.
 */
export function occlusionCards(notes: readonly OcclusionNote[]): OcclusionCard[] {
  let order = 0;
  return notes.flatMap((note, noteIndex) =>
    note.masks.map((mask) => ({
      id: occlusionCardId(note, mask),
      front: `${note.title}: ${mask.label}`,
      back: mask.label,
      tags: [note.region],
      note,
      mask,
      order: order++,
      noteIndex,
    })),
  );
}

type Positioned = Pick<OcclusionCard, "order" | "noteIndex">;

/**
 * The label after (dir 1) or before (dir -1) `current` in `queue`, by deck order, wrapping round.
 * `current` need not be in the queue (a label just graded, or one opened from another figure).
 */
export function stepLabel<T extends Positioned>(queue: readonly T[], current: Positioned, dir: 1 | -1): T | undefined {
  if (queue.length === 0) return undefined;
  if (dir === 1) return queue.find((c) => c.order > current.order) ?? queue[0];
  return queue.findLast((c) => c.order < current.order) ?? queue[queue.length - 1];
}

/** The first queued label of the next (dir 1) or previous (dir -1) figure that has any, wrapping round. */
export function stepFigure<T extends Positioned>(queue: readonly T[], current: Positioned, dir: 1 | -1): T | undefined {
  if (queue.length === 0) return undefined;
  if (dir === 1) return queue.find((c) => c.noteIndex > current.noteIndex) ?? queue[0];
  const prev = queue.findLast((c) => c.noteIndex < current.noteIndex) ?? queue[queue.length - 1];
  return queue.find((c) => c.noteIndex === prev.noteIndex);
}

export type LabelStatus = "new" | "due" | "learning" | "mastered";

/** Where a label stands: never seen, due now, scheduled, or on an interval of three weeks or more. */
export function labelStatus(state: CardState | undefined, at = new Date()): LabelStatus {
  if (!state) return "new";
  if (isDue(state, at)) return "due";
  return state.interval >= 21 ? "mastered" : "learning";
}

/** A review interval in days as a short label: "1d", "6d", "3w", "4mo". */
export function formatInterval(days: number): string {
  if (days < 14) return `${Math.max(1, Math.round(days))}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")}y`;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A window around one mask, `scale` times the image's smaller side, kept inside the image, so a
 * small label on a big atlas figure is readable on a phone. The whole figure when it's smaller.
 */
export function zoomBox(note: Pick<OcclusionNote, "width" | "height">, mask: OcclusionMask, scale = 0.6): ViewBox {
  const side = Math.min(note.width, note.height) * scale;
  const w = Math.min(note.width, Math.max(side, mask.w * 2.2));
  const h = Math.min(note.height, Math.max(side * 0.75, mask.h * 4));
  const cx = mask.x + mask.w / 2;
  const cy = mask.y + mask.h / 2;
  const x = Math.min(Math.max(0, cx - w / 2), note.width - w);
  const y = Math.min(Math.max(0, cy - h / 2), note.height - h);
  return { x, y, w, h };
}

/** Human names for the region tags. */
export const REGION_LABELS: Record<string, string> = {
  basic: "Basic anatomy",
  embryology: "Embryology",
  trunk: "Trunk",
  cranium: "Cranium",
  "face-neck": "Face & neck",
  "upper-limb": "Upper limb",
  "lower-limb": "Lower limb",
};
