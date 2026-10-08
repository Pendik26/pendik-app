import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { MemoryLeaderboardStore } from "./leaderboard.js";
import { MemoryProgressStore } from "./progressStore.js";

const ORIGIN = "http://localhost:5173";

function setup() {
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    onDeleteUser: async () => {},
    rateLimit: false,
  });
  const app = createApp({ auth, store: new MemoryProgressStore(), leaderboard: new MemoryLeaderboardStore(), googleEnabled: false });
  const req = (method: string, path: string, body?: unknown, cookie?: string) => {
    const headers = new Headers({ origin: ORIGIN, "content-type": "application/json" });
    if (cookie) headers.set("cookie", cookie);
    return app(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  };
  const signUp = async (n: number) => {
    const res = await req("POST", "/api/auth/sign-up/email", { email: `s${n}@example.com`, password: "correct-horse-1", name: `S${n}` });
    return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  };
  return { req, signUp };
}

describe("/api/readiness", () => {
  it("needs a session and a valid block and value", async () => {
    const { req, signUp } = setup();
    expect((await req("GET", "/api/readiness?block=1.2")).status).toBe(401);
    const me = await signUp(1);
    expect((await req("GET", "/api/readiness?block=../x", undefined, me)).status).toBe(400);
    expect((await req("PUT", "/api/readiness", { block: "1.2", value: 140 }, me)).status).toBe(400);
    expect((await req("PUT", "/api/readiness", { block: "1.2", value: "50" }, me)).status).toBe(400);
  });

  it("shows the class average only once three students have one", async () => {
    const { req, signUp } = setup();
    const students = [await signUp(1), await signUp(2), await signUp(3)];
    expect((await req("PUT", "/api/readiness", { block: "1.2", value: 40 }, students[0])).status).toBe(200);
    await req("PUT", "/api/readiness", { block: "1.2", value: 60 }, students[1]);
    let res = await (await req("GET", "/api/readiness?block=1.2", undefined, students[0])).json();
    expect(res).toEqual({ cohort: null, count: 2, average: null });
    await req("PUT", "/api/readiness", { block: "1.2", value: 80 }, students[2]);
    // A block is kept apart from the others, and a student's later number replaces their earlier one.
    await req("PUT", "/api/readiness", { block: "1.1", value: 10 }, students[2]);
    await req("PUT", "/api/readiness", { block: "1.2", value: 50 }, students[0]);
    res = await (await req("GET", "/api/readiness?block=1.2", undefined, students[1])).json();
    expect(res).toEqual({ cohort: null, count: 3, average: 63 });
  });
});
