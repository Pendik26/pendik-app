import { afterEach, describe, expect, it, vi } from "vitest";
import { alfondState, clearAlfond, retryAlfond, sendToAlfond } from "./alfond";

// A signed-in student, so the AI request goes out with their token.
vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

let snapshot: ReturnType<typeof alfondState>;
const read = () => (snapshot = alfondState());

const page = { title: "Bones by shape", path: "/ebooks/1.2/anatomy/ch1", text: "Sesamoid bones sit inside tendons." };

function answer(...responses: (() => Response)[]) {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return responses.shift()!();
  });
  return bodies;
}

afterEach(() => {
  clearAlfond();
  vi.unstubAllGlobals();
});

describe("Alfond's conversation", () => {
  it("sends the conversation with the page, and keeps the answer", async () => {
    const bodies = answer(() => new Response("A bone in a tendon.", { headers: { "x-ai-remaining": "7" } }));
    await sendToAlfond("  What's a sesamoid bone? ", page);
    read();
    expect(snapshot.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "What's a sesamoid bone?"],
      ["assistant", "A bone in a tendon."],
    ]);
    expect(snapshot.messages[0].page).toEqual({ title: page.title, path: page.path });
    expect(snapshot.remaining).toBe(7);
    expect(snapshot.busy).toBe(false);
    expect(bodies[0]).toEqual({ messages: [{ role: "user", content: "What's a sesamoid bone?" }], page });
  });

  it("keeps a failed answer's message and asks again on retry, with the history", async () => {
    const bodies = answer(
      () => new Response("First.", {}),
      () => new Response(JSON.stringify({ error: "The AI took too long to answer." }), { status: 504 }),
      () => new Response("Second.", {}),
    );
    await sendToAlfond("One", null);
    await sendToAlfond("Two", null);
    read();
    expect(snapshot.messages.at(-1)).toMatchObject({ role: "assistant", content: "", error: "The AI took too long to answer." });
    await retryAlfond(null);
    read();
    expect(snapshot.messages.map((m) => m.content)).toEqual(["One", "First.", "Two", "Second."]);
    expect(snapshot.messages.some((m) => m.error)).toBe(false);
    expect((bodies[2] as { messages: unknown[] }).messages).toEqual([
      { role: "user", content: "One" },
      { role: "assistant", content: "First." },
      { role: "user", content: "Two" },
    ]);
  });

  it("ignores empty messages and starts over on clear", async () => {
    answer();
    await sendToAlfond("   ", page);
    read();
    expect(snapshot.messages).toEqual([]);
  });
});
