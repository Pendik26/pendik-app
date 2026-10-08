import { describe, expect, it } from "vitest";
import {
  ebookChapterKeys,
  ebookSubjects,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  loadEbookChapter,
  loadOcclusionNotes,
  moduleSubjects,
  quizBanks,
  quizSubjects,
  summaries,
  summarySubjects,
} from "./content";
import { studyBlocks } from "./blocks";

describe("content folders", () => {
  it("only use configured block ids", () => {
    const known = new Set(studyBlocks.map((b) => b.id));
    const all = [...flashcardSubjects, ...quizSubjects, ...ebookSubjects, ...summarySubjects, ...moduleSubjects];
    expect(all.filter((s) => !known.has(s.blockId))).toEqual([]);
  });

  it("keys every content map by block and subject", () => {
    const keys = [
      ...[...flashcardDecks.keys()],
      ...[...quizBanks.keys()],
      ...[...summaries.keys()],
      ...ebookChapterKeys.map((k) => k.split("/").slice(0, 2).join("/")),
    ];
    expect(keys.filter((k) => !/^[^/]+\/[^/]+$/.test(k))).toEqual([]);
    for (const s of flashcardSubjects) expect(flashcardDecks.get(keyOf(s))?.length).toBeGreaterThan(0);
  });

  it("uses unique flashcard and quiz ids across all decks", () => {
    // Card state and missed-question lists are stored by id, so an id reused across decks
    // would share progress.
    const cardIds = [...flashcardDecks.values()].flatMap((deck) => deck.map((c) => c.id));
    const questionIds = [...quizBanks.values()].flatMap((bank = []) => bank.map((q) => q.id));
    expect(cardIds.filter((id, i) => cardIds.indexOf(id) !== i)).toEqual([]);
    expect(questionIds.filter((id, i) => questionIds.indexOf(id) !== i)).toEqual([]);
  });

  it("returns undefined for non-owned dynamic loader keys", async () => {
    await expect(loadEbookChapter("__proto__")).resolves.toBeUndefined();
    await expect(loadOcclusionNotes("toString")).resolves.toBeUndefined();
  });
});

describe("image-occlusion decks", () => {
  it("cover existing figures with in-bounds, uniquely named masks", async () => {
    const figures = new Set(Object.keys(import.meta.glob("../../public/ebook-figures/**/*.webp")).map((p) => p.replace("../../public", "")));
    const { loadOcclusionNotes, occlusionKeys } = await import("./content");
    const { REGION_LABELS } = await import("./occlusion");
    expect(occlusionKeys.length).toBeGreaterThan(0);
    for (const key of occlusionKeys) {
      expect(flashcardSubjects.some((s) => keyOf(s) === key)).toBe(true);
      const notes = (await loadOcclusionNotes(key)) ?? [];
      const noteIds = notes.map((n) => n.id);
      expect(noteIds.filter((id, i) => noteIds.indexOf(id) !== i)).toEqual([]);
      for (const n of notes) {
        expect(figures.has(n.image), n.image).toBe(true);
        expect(REGION_LABELS[n.region], n.id).toBeDefined();
        expect(n.title.trim()).not.toBe("");
        const maskIds = n.masks.map((m) => m.id);
        expect(maskIds.filter((id, i) => maskIds.indexOf(id) !== i), n.id).toEqual([]);
        for (const m of n.masks) {
          expect(m.label.trim(), `${n.id}:${m.id}`).not.toBe("");
          expect(m.x >= 0 && m.y >= 0 && m.w > 0 && m.h > 0 && m.x + m.w <= n.width + 1 && m.y + m.h <= n.height + 1, `${n.id}:${m.id}`).toBe(true);
        }
      }
    }
  });
});

describe("subject covers", () => {
  it("point at existing images for real subjects", async () => {
    const { coveredSubjects, subjectCover } = await import("./subjectCovers");
    const files = new Set(Object.keys(import.meta.glob("../../public/covers/*.webp")).map((p) => p.replace("../../public", "")));
    const subjects = new Set([...flashcardSubjects, ...quizSubjects, ...ebookSubjects, ...summarySubjects, ...moduleSubjects].map(keyOf));
    for (const key of coveredSubjects) {
      expect(subjects.has(key), key).toBe(true);
      expect(files.has(subjectCover(key)!.src), key).toBe(true);
    }
    expect(subjectCover("9.9/nothing")).toBeUndefined();
  });
});

describe("exam packages", () => {
  it("state their real question count in meta.json", async () => {
    const { examPackagesByBlock } = await import("./content");
    const packages = [...examPackagesByBlock.values()].flat();
    expect(packages.length).toBeGreaterThan(0);
    for (const p of packages) expect((await p.load()).length, p.id).toBe(p.questionCount);
  });
});

describe("knowledge map glossary", () => {
  it("has one short, finished sentence or two per concept id", () => {
    const files = import.meta.glob<Record<string, string>>("../../content/graph/glossary.json", { eager: true, import: "default" });
    const glossary = Object.values(files).at(0) ?? {};
    const entries = Object.entries(glossary);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, text] of entries) {
      expect(id, id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(text.trim().length, id).toBeGreaterThan(20);
      expect(text.length, id).toBeLessThanOrEqual(260);
      expect(text, id).toMatch(/[.)]$/);
    }
  });
});
