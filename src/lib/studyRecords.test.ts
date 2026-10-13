import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quizBanks } from "./content";
import { buildSessionBank } from "./quizShuffle";

// The tests run in Node: a Map stands in for the browser's localStorage.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

const calls: { fn: string; args: unknown }[] = [];
let failWith: { code: string; message: string } | null = null;
vi.mock("./db/client", () => ({
  rpc: async (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    return { data: null, error: failWith };
  },
}));

const { quizRecords, recordReview, recordStudyDay, sendRecords, startRecords, stopRecords } = await import("./studyRecords");

describe("quizRecords", () => {
  it("maps each shuffled choice back to the option's place in the bank", () => {
    const deck = "1.2/anatomy";
    const bank = quizBanks.get(deck)?.slice(0, 5) ?? [];
    expect(bank.length).toBe(5);
    const shown = buildSessionBank(bank);
    // Pick the right answer on the first two, a wrong one on the third, skip the rest.
    const wrong = (shown[2].answer + 1) % shown[2].options.length;
    const records = quizRecords(shown, { [shown[0].id]: shown[0].answer, [shown[1].id]: shown[1].answer, [shown[2].id]: wrong }, { deck });
    const original = (id: string) => bank.find((q) => q.id === id);
    expect(records).toHaveLength(5);
    expect(records[0]).toEqual({ deck, item: shown[0].id, choice: original(shown[0].id)?.answer });
    expect(records[1].choice).toBe(original(shown[1].id)?.answer);
    expect(records[2].choice).not.toBe(original(shown[2].id)?.answer);
    expect(records[2].choice).not.toBeNull();
    expect(records.slice(3).every((r) => r.choice === null)).toBe(true);
  });

  it("finds each question's subject in a block exam", () => {
    const anatomy = quizBanks.get("1.2/anatomy")?.[0];
    const histology = quizBanks.get("1.2/histology")?.[0];
    if (!anatomy || !histology) throw new Error("fixture banks missing");
    const records = quizRecords([anatomy, histology], {}, { blockId: "1.2" });
    expect(records.map((r) => r.deck)).toEqual(["1.2/anatomy", "1.2/histology"]);
  });
});

describe("the outbox", () => {
  beforeEach(() => {
    calls.length = 0;
    failWith = null;
    localStorage.clear();
    startRecords("u1");
  });
  afterEach(() => { stopRecords(); });

  it("sends reviews together and a study day once a day", async () => {
    recordReview("flashcard", "1.1/biochem", "bio-001");
    recordReview("occlusion", "1.2/anatomy", "n:m0");
    recordStudyDay(new Date("2026-10-13T08:00:00Z"));
    recordStudyDay(new Date("2026-10-13T20:00:00Z"));
    await sendRecords();
    expect(calls).toEqual([
      { fn: "record_reviews", args: { p_items: [{ kind: "flashcard", deck: "1.1/biochem", item: "bio-001" }, { kind: "occlusion", deck: "1.2/anatomy", item: "n:m0" }] } },
      { fn: "record_study_day", args: undefined },
    ]);
  });

  it("keeps records while offline, on this device, and sends them later", async () => {
    failWith = { code: "", message: "TypeError: Failed to fetch" };
    recordReview("flashcard", "1.1/biochem", "bio-001");
    await sendRecords();
    expect(localStorage.getItem("pendik-outbox:u1")).toContain("bio-001");
    stopRecords();
    startRecords("u1");
    failWith = null;
    calls.length = 0;
    await sendRecords();
    expect(calls).toHaveLength(1);
    expect(localStorage.getItem("pendik-outbox:u1")).toBeNull();
  });

  it("drops a record the server refuses, so it can't block the rest", async () => {
    failWith = { code: "P0001", message: "no_such_chapter" };
    recordReview("flashcard", "1.1/biochem", "bio-001");
    await sendRecords();
    expect(localStorage.getItem("pendik-outbox:u1")).toBeNull();
  });
});
