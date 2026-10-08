// The browser sync engine (src/lib/sync.ts) against the real API handler, with two simulated
// devices sharing one account.
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { MemoryLeaderboardStore } from "./leaderboard.js";
import { MemoryProgressStore } from "./progressStore.js";
import { syncNow, pendingChangeCount } from "../src/lib/sync.js";
import { writeDirty, readDirty } from "../src/lib/syncDirty.js";

const ORIGIN = "http://localhost:5173";

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()].at(i) ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

async function setup() {
  const store = new MemoryProgressStore();
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    onDeleteUser: (id) => store.deleteAll(id),
    rateLimit: false,
  });
  const app = createApp({ auth, store, leaderboard: new MemoryLeaderboardStore(), googleEnabled: false });
  const res = await app(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: "s@example.com", password: "correct-horse-1", name: "S" }),
    }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const fetchWithCookie = ((input: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("origin", ORIGIN);
    return app(new Request(ORIGIN + input, { ...init, headers }));
  }) as typeof fetch;
  let clock = 1_000;
  const device = (storage: Storage) => ({ storage, fetch: fetchWithCookie, now: () => (clock += 10) });
  return { userId: user.id, device };
}

const card = (reps: number) => ({ interval: 1, easeFactor: 2.5, dueDate: "2026-10-01", reps, lapses: 0 });
const set = (s: Storage, k: string, v: unknown) => s.setItem(k, JSON.stringify(v));
const get = (s: Storage, k: string) => JSON.parse(s.getItem(k) ?? "null");

describe("sync engine", () => {
  it("merges guest progress from two devices into one account and keeps them in step", async () => {
    const { userId, device } = await setup();
    const phone = new MemStorage();
    const laptop = new MemStorage();

    // Guest progress on each device before signing in.
    set(phone, "medicine:flashcards:1.2/anatomy", { a: card(2) });
    set(phone, "medicine:activity", ["2026-09-01"]);
    set(phone, "medicine:theme", "dark"); // device-only, never uploaded
    set(laptop, "medicine:flashcards:1.2/anatomy", { b: card(1) });
    set(laptop, "medicine:activity", ["2026-09-02"]);

    expect((await syncNow(userId, {}, device(phone))).status).toBe("ok");
    const laptopResult = await syncNow(userId, {}, device(laptop));
    expect(laptopResult.status).toBe("ok");
    expect(get(laptop, "medicine:flashcards:1.2/anatomy")).toEqual({ a: card(2), b: card(1) });
    expect(get(laptop, "medicine:activity")).toEqual(["2026-09-01", "2026-09-02"]);

    // The phone picks up the laptop's guest progress on its next sync.
    await syncNow(userId, {}, device(phone));
    expect(get(phone, "medicine:flashcards:1.2/anatomy")).toEqual({ a: card(2), b: card(1) });

    // A later edit on the laptop reaches the phone, and only dirty keys are uploaded.
    set(laptop, "medicine:flashcards:1.2/anatomy", { a: card(2), b: card(4) });
    const laptopDevice = device(laptop);
    writeDirty({ "medicine:flashcards:1.2/anatomy": laptopDevice.now() }, laptop);
    expect(pendingChangeCount(laptop)).toBe(1);
    const up = await syncNow(userId, {}, laptopDevice);
    expect(up.status === "ok" && up.uploaded).toBe(1);
    expect(readDirty(laptop)).toEqual({});
    await syncNow(userId, {}, device(phone));
    expect(get(phone, "medicine:flashcards:1.2/anatomy")).toEqual({ a: card(2), b: card(4) });
    expect(phone.getItem("medicine:theme")).toBe('"dark"');
  });

  it("reports a signed-out session", async () => {
    const { device } = await setup();
    const storage = new MemStorage();
    const d = device(storage);
    const signedOut = { ...d, fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch };
    expect(await syncNow("someone", {}, signedOut)).toEqual({ status: "signed-out" });
  });
});
