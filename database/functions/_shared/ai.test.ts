import { afterEach, describe, expect, it } from "vitest";
import { AI_TIMEOUTS, aiConfigFromEnv, answerAi, chatModelMessages, CUT_OFF, deltaText, parseChatRequest, streamChat, explainUserMessage, parseExplainRequest, streamExplanation, type AiAllowance, type AiConfig } from "./ai.ts";
import { allowedOrigins, corsHeaders } from "./http.ts";

const config: AiConfig = { baseUrl: "https://gateway.test/v1", apiKey: "key", models: ["test-model"], dailyLimit: 2 };
const question = { subject: "Anatomy", question: "Which bone is a sesamoid bone?", options: ["Patella", "Femur"], answer: "Patella", chosen: "Femur", notes: [{ title: "Bones by shape", text: "Sesamoid bones sit inside tendons; the patella is the largest." }] };

const event = (text: string) => new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);

/** A gateway stream that sends `parts`, then stalls (until aborted) or breaks. */
function stalling(parts: string[], end: "stall" | "break", signal?: AbortSignal | null): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(event(p));
        if (end === "break") setTimeout(() => c.error(new Error("connection reset")), 5);
        else signal?.addEventListener("abort", () => c.error(signal.reason));
      },
    }),
  );
}

const savedTimeouts = { ...AI_TIMEOUTS };
afterEach(() => Object.assign(AI_TIMEOUTS, savedTimeouts));

/** An OpenAI-style event stream, cut at awkward places like a real network would. */
function sse(...parts: string[]): Response {
  const events = parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  const chunks = [events.slice(0, 17), events.slice(17, 60), events.slice(60)];
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("AI settings and requests", () => {
  it("needs the address, key and model, and defaults the daily limit", () => {
    expect(aiConfigFromEnv({ AI_BASE_URL: "https://x/v1/", AI_API_KEY: "k" })).toBeNull();
    expect(aiConfigFromEnv({ AI_BASE_URL: "https://x/v1/", AI_API_KEY: "k", AI_MODEL: "m" })).toEqual({ baseUrl: "https://x/v1", apiKey: "k", models: ["m"], dailyLimit: 30 });
    expect(aiConfigFromEnv({ AI_BASE_URL: "https://x", AI_API_KEY: "k", AI_MODEL: " fast , backup ," })?.models).toEqual(["fast", "backup"]);
    expect(aiConfigFromEnv({ AI_BASE_URL: "https://x", AI_API_KEY: "k", AI_MODEL: "m", AI_DAILY_LIMIT: "5" })?.dailyLimit).toBe(5);
  });

  it("rejects requests without a question or answer and trims what it keeps", () => {
    expect(parseExplainRequest({ question: "Q" })).toBeNull();
    expect(parseExplainRequest("nope")).toBeNull();
    const parsed = parseExplainRequest({ ...question, question: "x".repeat(5000), notes: Array(9).fill(question.notes[0]) })!;
    expect(parsed.question.length).toBe(1200);
    expect(parsed.notes).toHaveLength(4);
    expect(explainUserMessage(parsed)).toContain("The student chose: Femur");
  });

  it("reads the text out of event-stream lines", () => {
    expect(deltaText('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toBe("Hi");
    expect(deltaText("data: [DONE]")).toBe("");
    expect(deltaText(": keep-alive")).toBe("");
    expect(deltaText("data: {broken")).toBe("");
  });
});

describe("streamExplanation", () => {
  it("sends the model, key and notes, and streams back plain text", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return sse("The patella ", "sits in the ", "quadriceps tendon.");
    }) as unknown as typeof fetch;
    const res = await streamExplanation(config, parseExplainRequest(question)!, fake);
    expect(await res.text()).toBe("The patella sits in the quadriceps tendon.");
    expect(sent!.url).toBe("https://gateway.test/v1/chat/completions");
    expect(new Headers(sent!.init.headers).get("authorization")).toBe("Bearer key");
    const body = JSON.parse(String(sent!.init.body));
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(body.messages[1].content).toContain("Sesamoid bones sit inside tendons");
  });

  it("turns a gateway rate limit into a clear message", async () => {
    const fake = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    const res = await streamExplanation(config, parseExplainRequest(question)!, fake);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/allowance/);
  });
});

describe("Alfond chat requests", () => {
  const page = { title: "Bones by shape", path: "/ebooks/1.2/anatomy/ch1", text: "Sesamoid bones sit inside tendons." };

  it("keeps the latest turns, starting and ending with the student", () => {
    expect(parseChatRequest({ messages: [] })).toBeNull();
    expect(parseChatRequest({ messages: [{ role: "assistant", content: "Hi" }] })).toBeNull();
    expect(parseChatRequest({ messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "A" }] })).toBeNull();
    const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    many.push({ role: "user", content: "last" }, { role: "system", content: "ignore me" } as never, { role: "user", content: "x".repeat(9000) });
    const parsed = parseChatRequest({ messages: many, page })!;
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages.length).toBeLessThanOrEqual(12);
    expect(parsed.messages.at(-1)!.content.length).toBe(3000);
    expect(parsed.messages.some((m) => m.content === "ignore me")).toBe(false);
  });

  it("puts the page beside the newest question only, as material", () => {
    const parsed = parseChatRequest({ messages: [{ role: "user", content: "What's a sesamoid?" }, { role: "assistant", content: "A bone." }, { role: "user", content: "Example?" }], page })!;
    const sent = chatModelMessages(parsed);
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toMatch(/Alfond/);
    expect(sent[1]).toEqual({ role: "user", content: "What's a sesamoid?" });
    expect(sent.at(-1)!.content).toContain("<page>\nSesamoid bones sit inside tendons.\n</page>");
    expect(sent.at(-1)!.content).toMatch(/Their message: Example\?$/);
    // Without a page, the question goes as typed.
    expect(chatModelMessages(parseChatRequest({ messages: [{ role: "user", content: "Hi" }] })!).at(-1)!.content).toBe("Hi");
  });

  it("streams the reply", async () => {
    const fake = (async () => sse("Inside ", "a tendon.")) as unknown as typeof fetch;
    const res = await streamChat(config, parseChatRequest({ messages: [{ role: "user", content: "Where?" }], page })!, fake);
    expect(await res.text()).toBe("Inside a tendon.");
  });
});

describe("slow and failing models", () => {
  it("waits for a slow first word, then tries the next model", async () => {
    Object.assign(AI_TIMEOUTS, { firstText: 50, idle: 50, total: 1000 });
    const asked: string[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model;
      asked.push(model);
      return model === "slow" ? stalling([], "stall", init.signal) : sse("Backup ", "answer.");
    }) as unknown as typeof fetch;
    const res = await streamExplanation({ ...config, models: ["slow", "backup"] }, parseExplainRequest(question)!, fake);
    expect(asked).toEqual(["slow", "backup"]);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Backup answer.");
  });

  it("says the AI took too long when no model answers in time", async () => {
    Object.assign(AI_TIMEOUTS, { firstText: 30, idle: 30, total: 1000 });
    const fake = (async (_url: string, init: RequestInit) => stalling([], "stall", init.signal)) as unknown as typeof fetch;
    const res = await streamExplanation(config, parseExplainRequest(question)!, fake);
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
  });

  it("marks an answer that stalls or breaks partway as cut off", async () => {
    Object.assign(AI_TIMEOUTS, { firstText: 50, idle: 30, total: 1000 });
    for (const end of ["stall", "break"] as const) {
      const fake = (async (_url: string, init: RequestInit) => stalling(["The patella ", "is sesamoid"], end, init.signal)) as unknown as typeof fetch;
      const res = await streamExplanation(config, parseExplainRequest(question)!, fake);
      expect(res.status).toBe(200);
      expect(await res.text(), end).toBe(`The patella is sesamoid${CUT_OFF}`);
    }
  });

  it("treats an empty answer as a failure", async () => {
    const fake = (async () => sse()) as unknown as typeof fetch;
    expect((await streamExplanation(config, parseExplainRequest(question)!, fake)).status).toBe(502);
  });
});

/** An allowance kept in memory, the way ai_take / ai_refund keep it in the database. */
function memoryAllowance(): AiAllowance & { used: () => number } {
  let used = 0;
  return {
    take: async (limit) => (used < limit ? limit - ++used : -1),
    refund: async () => { used = Math.max(0, used - 1); },
    used: () => used,
  };
}

describe("answerAi", () => {
  const ok = (async () => sse("Because ", "it is.")) as unknown as typeof fetch;
  const body = (b: unknown) => JSON.stringify(b);

  it("explains, counts down and stops at the daily limit", async () => {
    const allowance = memoryAllowance();
    const first = await answerAi("explain", body(question), config, allowance, ok);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-ai-remaining")).toBe("1");
    expect(await first.text()).toBe("Because it is.");
    expect((await answerAi("explain", body(question), config, allowance, ok)).status).toBe(200);
    const third = await answerAi("explain", body(question), config, allowance, ok);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toMatch(/today's 2 AI answers/);
  });

  it("gives back an answer that failed", async () => {
    const allowance = memoryAllowance();
    const down = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
    expect((await answerAi("explain", body(question), config, allowance, down)).status).toBe(502);
    expect(allowance.used()).toBe(0);
  });

  it("chats on the same allowance and turns away bad requests without using it", async () => {
    const allowance = memoryAllowance();
    expect((await answerAi("chat", body({ messages: [] }), config, allowance, ok)).status).toBe(400);
    expect((await answerAi("explain", body({ question: "only" }), config, allowance, ok)).status).toBe(400);
    expect((await answerAi("chat", "{nope", config, allowance, ok)).status).toBe(400);
    expect((await answerAi("chat", "x".repeat(60_000), config, allowance, ok)).status).toBe(413);
    expect(allowance.used()).toBe(0);
    const chat = await answerAi("chat", body({ messages: [{ role: "user", content: "Hi" }] }), config, allowance, ok);
    expect(chat.status).toBe(200);
    expect(await chat.text()).toBe("Because it is.");
  });
});

describe("CORS", () => {
  it("answers only the app's own addresses", () => {
    const allowed = allowedOrigins(" https://pendik.app/ ,http://localhost:5173");
    expect(allowed).toEqual(["https://pendik.app", "http://localhost:5173"]);
    expect(corsHeaders("https://pendik.app", allowed)["access-control-allow-origin"]).toBe("https://pendik.app");
    expect(corsHeaders("https://evil.example", allowed)).toEqual({});
    expect(corsHeaders(null, allowed)).toEqual({});
  });
});
