import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureFirstAdmin } from "./people.js";
import { takeRate } from "./rateLimit.js";
import { testApp } from "./testApp.js";

// Runs when MONGODB_TEST_URI is set (CI starts one); skipped otherwise.
const uri = process.env.MONGODB_TEST_URI;
const run = uri ? describe : describe.skip;

run("rate limits", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  let cookie = "";
  beforeAll(async () => {
    t = await testApp(uri as string, { standard: 3, perFunction: { leaderboard: 1 } });
    await ensureFirstAdmin(t.c, t.auth, { nim: "A100", fullName: "Ada Admin" });
    const res = await t.app(new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "a100@pendik26.internal", password: "pendik26A100" }),
    }));
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  });
  afterAll(async () => { await t.close(); });

  const call = async (fn: string) =>
    (await t.app(new Request(`http://localhost/api/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: "{}" }))).status;

  it("refuses a student's calls past the minute's limit, with a code the app can explain", async () => {
    expect([await call("my_account"), await call("my_account"), await call("my_account")]).toEqual([200, 200, 200]);
    const res = await t.app(new Request("http://localhost/api/rpc/my_account", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: "{}" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_requests" });
  });

  it("counts each function on its own, and starts again in the next minute", async () => {
    expect(await call("package_summaries")).toBe(200);
    const limits = { standard: 2, perFunction: {} };
    const now = new Date("2026-01-01T10:00:10Z");
    await takeRate(t.c, limits, "u1", "x", now);
    await takeRate(t.c, limits, "u1", "x", now);
    await expect(takeRate(t.c, limits, "u1", "x", now)).rejects.toMatchObject({ status: 429 });
    await takeRate(t.c, limits, "u2", "x", now);
    await takeRate(t.c, limits, "u1", "x", new Date("2026-01-01T10:01:05Z"));
  });

  it("does nothing when limits are off", async () => {
    for (let i = 0; i < 5; i++) await takeRate(t.c, false, "u3", "x");
  });
});
