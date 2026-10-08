import { describe, expect, it } from "vitest";
import {
  affectsLeaderboard,
  cleanDisplayName,
  computeStats,
  MemoryLeaderboardStore,
  newDoc,
  partField,
  rankBoard,
  scoreFor,
  scoreUpdate,
  type LeaderboardDoc,
} from "./leaderboard.js";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const card = (reps: number) => ({ interval: 1, easeFactor: 2.5, dueDate: "2026-10-01", reps, lapses: 0 });
const base = { userId: "u1", displayName: "Alice", cohort: "2025" };
const quizKey = "medicine:quiz:1.2/anatomy";
const attempts = (...scores: number[]) => scores.map((score) => ({ score, total: 10 }));

describe("computeStats", () => {
  it("counts correct answers, learned cards, finished chapters and study days", () => {
    const { stats, runEnd, runLength } = computeStats(
      [
        { key: "medicine:flashcards:1.2/anatomy", value: { a: card(2), b: card(0), c: card(1) } },
        { key: "medicine:occlusion:1.2/anatomy", value: { "fig:m0": card(1), "fig:m1": card(0) } },
        { key: quizKey, value: attempts(7, 9) },
        { key: "medicine:examhistory:1.1", value: [{ score: 60, total: 100 }] },
        { key: "medicine:ebookdone:1.2/anatomy", value: ["chapter-01", "chapter-02", "chapter-01"] },
        { key: "medicine:activity", value: ["2026-09-20", "2026-09-24", "2026-09-25", "2026-09-26"] },
        { key: "medicine:quizdue:1.2/anatomy", value: ["q1"] },
      ],
      NOW,
    );
    expect(stats).toEqual({ correctAnswers: 76, cardsLearned: 3, chaptersFinished: 2, studyDays: 4, points: 76 + 6 + 20 + 20 });
    expect([runEnd, runLength]).toEqual(["2026-09-26", 3]);
  });

  it("ignores impossible values", () => {
    const { stats } = computeStats(
      [
        { key: "medicine:quiz:1.1/biochem", value: [{ score: 11, total: 10 }, { score: 1e9, total: 1e9 }, "junk"] },
        { key: "medicine:activity", value: ["2099-01-01", "not a date", "2026-09-26"] },
        { key: "medicine:flashcards:1.1/biochem", value: { a: { reps: -3 }, b: { reps: 1.5 } } },
      ],
      NOW,
    );
    expect(stats).toMatchObject({ correctAnswers: 0, studyDays: 1, cardsLearned: 0 });
  });

  it("scores only the progress types that earn points", () => {
    expect(affectsLeaderboard(quizKey)).toBe(true);
    expect(affectsLeaderboard("medicine:activity")).toBe(true);
    expect(affectsLeaderboard("medicine:quizdue:1.2/anatomy")).toBe(false);
    expect(affectsLeaderboard("medicine:quiz")).toBe(false);
  });

  it("stores parts under field names MongoDB won't read as paths", () => {
    expect(partField(quizKey)).toBe("medicine:quiz:1%2E2/anatomy");
  });
});

describe("incremental scoring", () => {
  it("counts a new record's history without crediting it to this week", () => {
    const doc = newDoc(base, [{ key: quizKey, value: attempts(8) }], NOW);
    expect(scoreFor(doc, "all", NOW)).toBe(8);
    expect(scoreFor(doc, "week", NOW)).toBe(0);
  });

  it("rescores only the keys a sync wrote and credits the gain to today", async () => {
    const store = new MemoryLeaderboardStore();
    await store.create(newDoc(base, [{ key: quizKey, value: attempts(8) }, { key: "medicine:activity", value: ["2026-09-26"] }], NOW));
    const prev = (await store.get("u1"))!;
    await store.applyScore("u1", scoreUpdate(prev, [{ key: quizKey, value: attempts(8, 10) }], NOW));
    const doc = (await store.get("u1"))!;
    expect(scoreFor(doc, "all", NOW)).toBe(18 + 5);
    expect(doc.daily).toEqual({ "2026-09-26": 10 });
  });

  it("never subtracts from the week, and drops days older than two weeks", () => {
    const prev: LeaderboardDoc = {
      ...newDoc(base, [{ key: quizKey, value: attempts(8) }], NOW),
      daily: { "2026-09-01": 4, "2026-09-25": 3 },
    };
    const u = scoreUpdate(prev, [{ key: quizKey, value: attempts(2) }], NOW);
    expect(u.gained).toBe(0);
    expect(u.dropDays).toEqual(["2026-09-01"]);
  });

  it("keeps both of two syncs that ran at once on different keys", async () => {
    const store = new MemoryLeaderboardStore();
    await store.create(newDoc(base, [], NOW));
    const seenByBoth = (await store.get("u1"))!;
    await store.applyScore("u1", scoreUpdate(seenByBoth, [{ key: quizKey, value: attempts(5) }], NOW));
    await store.applyScore("u1", scoreUpdate(seenByBoth, [{ key: "medicine:ebookdone:1.2/anatomy", value: ["chapter-01"] }], NOW));
    const doc = (await store.get("u1"))!;
    expect(scoreFor(doc, "all", NOW)).toBe(15);
    expect(scoreFor(doc, "week", NOW)).toBe(15);
  });

  it("never lets a score update undo a join", async () => {
    const store = new MemoryLeaderboardStore();
    await store.create(newDoc(base, [], NOW));
    const stale = (await store.get("u1"))!;
    await store.setProfile("u1", { joined: true, displayName: "Ali" });
    await store.applyScore("u1", scoreUpdate(stale, [{ key: quizKey, value: attempts(5) }], NOW));
    // A second create (a race on the first sync) keeps the existing record.
    await store.create(newDoc(base, [], NOW));
    expect(await store.get("u1")).toMatchObject({ joined: true, displayName: "Ali" });
  });
});

describe("board", () => {
  const doc = (userId: string, displayName: string, correct: number, joined = true, cohort = "2025"): LeaderboardDoc => ({
    ...newDoc({ userId, displayName, cohort }, [{ key: quizKey, value: [{ score: correct, total: 500 }] }], NOW),
    joined,
  });

  it("shares ranks on ties, hides zero scores and students who didn't join", () => {
    const rows = rankBoard(
      [doc("a", "Ana", 50), doc("b", "Budi", 80), doc("c", "Cici", 50), doc("d", "Dewi", 0), doc("e", "Eka", 99, false)],
      { period: "all", userId: "c", now: NOW },
    );
    expect(rows.map((r) => [r.rank, r.name, r.me])).toEqual([
      [1, "Budi", false],
      [2, "Ana", false],
      [2, "Cici", true],
    ]);
  });

  it("filters by cohort", () => {
    const rows = rankBoard([doc("a", "Ana", 5, true, "2024"), doc("b", "Budi", 8)], { period: "all", cohort: "2024", userId: "a", now: NOW });
    expect(rows.map((r) => r.name)).toEqual(["Ana"]);
  });

  it("adds up the last seven days and drops a streak that has lapsed", () => {
    const d: LeaderboardDoc = {
      ...newDoc(base, [{ key: "medicine:activity", value: ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"] }], NOW),
      daily: { "2026-09-26": 5, "2026-09-20": 7, "2026-09-19": 100 },
    };
    expect(scoreFor(d, "week", NOW)).toBe(12);
    expect(scoreFor(d, "streak", NOW)).toBe(4);
    expect(scoreFor(d, "streak", NOW + 2 * 86_400_000)).toBe(0);
  });
});

describe("cleanDisplayName", () => {
  it("trims, collapses spaces and enforces a length", () => {
    expect(cleanDisplayName("  Siti \n Aminah ")).toBe("Siti Aminah");
    expect(cleanDisplayName("A")).toBeNull();
    expect(cleanDisplayName("x".repeat(33))).toBeNull();
    expect(cleanDisplayName(42)).toBeNull();
  });
});
