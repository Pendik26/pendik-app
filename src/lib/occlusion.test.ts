import { describe, expect, it } from "vitest";
import { formatInterval, labelStatus, occlusionCards, stepFigure, stepLabel, zoomBox } from "./occlusion";
import type { OcclusionNote } from "../types/content";

const note: OcclusionNote = {
  id: "c1-p1",
  image: "/x.webp",
  width: 1000,
  height: 800,
  title: "Figure",
  region: "trunk",
  chapter: "/ebooks/1.2/anatomy/chapter-03",
  masks: [
    { id: "m1", x: 10, y: 10, w: 100, h: 20, label: "Caput" },
    { id: "m2", x: 900, y: 760, w: 90, h: 20, label: "Collum" },
  ],
};

describe("occlusionCards", () => {
  it("makes one card per mask with a stable id and the region as its tag", () => {
    const cards = occlusionCards([note]);
    expect(cards.map((c) => c.id)).toEqual(["c1-p1:m1", "c1-p1:m2"]);
    expect(cards[0].tags).toEqual(["trunk"]);
    expect(cards[1].mask.label).toBe("Collum");
  });
});

describe("zoomBox", () => {
  it("frames the mask and stays inside the image", () => {
    for (const mask of note.masks) {
      const b = zoomBox(note, mask);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(note.width + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(note.height + 1e-9);
      expect(mask.x).toBeGreaterThanOrEqual(b.x);
      expect(mask.x + mask.w).toBeLessThanOrEqual(b.x + b.w + 1e-9);
      expect(mask.y + mask.h).toBeLessThanOrEqual(b.y + b.h + 1e-9);
    }
  });
});

describe("navigation", () => {
  const notes: OcclusionNote[] = [
    { ...note, id: "a" },
    { ...note, id: "b" },
    { ...note, id: "c" },
  ];
  const deck = occlusionCards(notes); // a:m1 a:m2 b:m1 b:m2 c:m1 c:m2
  const ids = (c?: { id: string }) => c?.id;

  it("steps through labels in deck order and wraps round", () => {
    expect(ids(stepLabel(deck, deck[1], 1))).toBe("b:m1");
    expect(ids(stepLabel(deck, deck[5], 1))).toBe("a:m1");
    expect(ids(stepLabel(deck, deck[0], -1))).toBe("c:m2");
  });

  it("finds the neighbour of a label that has left the queue", () => {
    const due = [deck[0], deck[4]];
    expect(ids(stepLabel(due, deck[2], 1))).toBe("c:m1");
    expect(ids(stepLabel(due, deck[2], -1))).toBe("a:m1");
  });

  it("jumps to the first queued label of the neighbouring figure", () => {
    expect(ids(stepFigure(deck, deck[1], 1))).toBe("b:m1");
    expect(ids(stepFigure(deck, deck[3], -1))).toBe("a:m1");
    expect(ids(stepFigure(deck, deck[0], -1))).toBe("c:m1");
    expect(ids(stepFigure([deck[1], deck[5]], deck[1], 1))).toBe("c:m2");
  });
});

describe("labelStatus and formatInterval", () => {
  const at = new Date("2026-01-10T00:00:00Z");
  const state = (interval: number, due: string) => ({ interval, easeFactor: 2.5, dueDate: due, reps: 1, lapses: 0 });

  it("sorts labels into new, due, learning and mastered", () => {
    expect(labelStatus(undefined, at)).toBe("new");
    expect(labelStatus(state(6, "2026-01-09T00:00:00Z"), at)).toBe("due");
    expect(labelStatus(state(6, "2026-01-15T00:00:00Z"), at)).toBe("learning");
    expect(labelStatus(state(30, "2026-02-09T00:00:00Z"), at)).toBe("mastered");
  });

  it("shortens intervals", () => {
    expect(formatInterval(1)).toBe("1d");
    expect(formatInterval(6)).toBe("6d");
    expect(formatInterval(21)).toBe("3w");
    expect(formatInterval(120)).toBe("4mo");
    expect(formatInterval(730)).toBe("2y");
  });
});
