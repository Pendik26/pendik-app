import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi, findNotes } from "./explain";

// A signed-in student, so the AI request goes out with their token.
vi.mock("./db/client", () => ({
  currentSession: async () => ({ access_token: "token" }),
  fetchFunction: (path: string, _session: unknown, init: RequestInit) => fetch(`/functions/v1/${path}`, init),
}));

describe("findNotes", () => {
  it("finds the notes passages that share a question's key terms", async () => {
    const notes = await findNotes("1.2/anatomy", "Which bone is a sesamoid bone? Patella");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => /sesamoid/i.test(n.text))).toBe(true);
    for (const n of notes) expect(n.to).toMatch(/^\/(ebooks|summaries)\/1\.2\/anatomy/);
  });

  it("returns nothing for a subject without notes or a question without words", async () => {
    expect(await findNotes("9.9/nothing", "anything here")).toEqual([]);
    expect(await findNotes("1.2/anatomy", "? ? 1 2")).toEqual([]);
  });
});

describe("askAi", () => {
  const input = { subject: "Anatomy", question: "Q?", options: [], answer: "A", notes: [] };
  const respond = (body: string) => {
    vi.stubGlobal("fetch", async () => new Response(body, { headers: { "x-ai-remaining": "4" } }));
  };
  afterEach(() => vi.unstubAllGlobals());

  it("streams the answer and the allowance left", async () => {
    respond("The answer.");
    const seen: string[] = [];
    expect(await askAi(input, (t) => seen.push(t))).toEqual({ ok: true, remaining: 4 });
    expect(seen.at(-1)).toBe("The answer.");
  });

  it("keeps a cut-off answer but reports it as unfinished", async () => {
    respond("Half an ans\u0000");
    const result = await askAi(input, () => {});
    expect(result).toMatchObject({ ok: false, partial: "Half an ans" });
  });
});
