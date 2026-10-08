import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type App } from "./app.js";
import { createAuth } from "./auth.js";
import { DriveIndex } from "./drive.js";
import { MemoryLeaderboardStore } from "./leaderboard.js";
import { MemoryProgressStore } from "./progressStore.js";

const ORIGIN = "http://localhost:5173";

let app: App;
let store: MemoryProgressStore;
let leaderboard: MemoryLeaderboardStore;

beforeEach(() => {
  store = new MemoryProgressStore();
  leaderboard = new MemoryLeaderboardStore();
  const auth = createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: "test-secret-test-secret-test-secret-1234",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    onDeleteUser: async (id) => {
      await Promise.all([store.deleteAll(id), leaderboard.delete(id)]);
    },
    rateLimit: false,
  });
  app = createApp({ auth, store, leaderboard, googleEnabled: false });
});

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ origin: ORIGIN });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  return app(
    new Request(ORIGIN + path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
  );
}

async function signUp(email = "student@example.com", name = "Student", cohort?: string) {
  const res = await req("/api/auth/sign-up/email", { body: { email, password: "correct-horse-1", name, cohort } });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");
  return cookie;
}

const card = (reps: number) => ({ interval: 1, easeFactor: 2.5, dueDate: "2026-10-01", reps, lapses: 0 });

describe("API", () => {
  it("reports that accounts are available", async () => {
    expect(await (await req("/api/config")).json()).toEqual({ accounts: true, google: false, ai: false, drive: false });
  });

  it("refuses to sync without a session", async () => {
    expect((await req("/api/sync", { body: { since: 0, changes: [] } })).status).toBe(401);
  });

  it("stores changes and merges progress from two devices", async () => {
    const cookie = await signUp();
    const key = "medicine:flashcards:1.2/anatomy";

    const first = await (
      await req("/api/sync", { cookie, body: { since: 0, changes: [{ key, value: { a: card(3) }, updatedAt: 100 }] } })
    ).json();
    expect(first.entries).toEqual([{ key, value: { a: card(3) }, updatedAt: 100 }]);

    // A second device that studied a different card, and an older copy of the first one.
    const second = await (
      await req("/api/sync", {
        cookie,
        body: { since: 0, changes: [{ key, value: { a: card(1), b: card(2) }, updatedAt: 200 }] },
      })
    ).json();
    expect(second.entries).toEqual([{ key, value: { a: card(3), b: card(2) }, updatedAt: 200 }]);
  });

  it("returns only entries changed since the last sync (plus a small overlap)", async () => {
    const cookie = await signUp();
    const a = await (
      await req("/api/sync", { cookie, body: { since: 0, changes: [{ key: "medicine:activity", value: ["2026-09-01"], updatedAt: 1 }] } })
    ).json();
    const later = a.serverTime + 60_000;
    const b = await (await req("/api/sync", { cookie, body: { since: later, changes: [] } })).json();
    expect(b.entries).toEqual([]);
  });

  it("rejects keys that are not synced and malformed bodies", async () => {
    const cookie = await signUp();
    const bad = await req("/api/sync", { cookie, body: { since: 0, changes: [{ key: "medicine:theme", value: "dark", updatedAt: 1 }] } });
    expect(bad.status).toBe(400);
    expect((await req("/api/sync", { cookie, body: { since: -1, changes: [] } })).status).toBe(400);
  });

  it("keeps each user's progress separate", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    await req("/api/sync", { cookie: alice, body: { since: 0, changes: [{ key: "medicine:activity", value: ["2026-09-01"], updatedAt: 1 }] } });
    const res = await (await req("/api/sync", { cookie: bob, body: { since: 0, changes: [] } })).json();
    expect(res.entries).toEqual([]);
  });

  it("exports the account and deletes all progress with the account", async () => {
    const cookie = await signUp();
    await req("/api/sync", { cookie, body: { since: 0, changes: [{ key: "medicine:activity", value: ["2026-09-01"], updatedAt: 1 }] } });
    const exported = await (await req("/api/account/export", { cookie })).json();
    expect(exported.user.email).toBe("student@example.com");
    expect(exported.progress).toHaveLength(1);

    const del = await req("/api/auth/delete-user", { cookie, body: { password: "correct-horse-1" } });
    expect(del.status).toBe(200);
    expect(await store.all(exported.user.id)).toEqual([]);
    expect(await leaderboard.get(exported.user.id)).toBeNull();
    expect((await req("/api/sync", { cookie, body: { since: 0, changes: [] } })).status).toBe(401);
  });
});

describe("leaderboard", () => {
  const today = new Date().toISOString().slice(0, 10);
  const attempt = (score: number) => ({ score, total: 10, date: new Date().toISOString(), missedIds: [] });
  const sync = (cookie: string, changes: { key: string; value: unknown }[]) =>
    req("/api/sync", { cookie, body: { since: 0, changes: changes.map((c) => ({ ...c, updatedAt: Date.now() })) } });
  const board = async (cookie: string, query = "") => (await req(`/api/leaderboard${query}`, { cookie })).json();

  it("needs a session", async () => {
    expect((await req("/api/leaderboard")).status).toBe(401);
    expect((await req("/api/leaderboard/me", { method: "PUT", body: { joined: true } })).status).toBe(401);
  });

  it("lists only students who joined, ranked by points from their synced progress", async () => {
    const alice = await signUp("alice@example.com", "Alice", "2025");
    const bob = await signUp("bob@example.com", "Bob", "2024");
    const carol = await signUp("carol@example.com", "Carol", "2025");
    await sync(alice, [{ key: "medicine:activity", value: [today] }]);
    await sync(bob, [{ key: "medicine:activity", value: [today] }]);
    await sync(carol, [{ key: "medicine:activity", value: [today] }]);

    await req("/api/leaderboard/me", { cookie: alice, method: "PUT", body: { joined: true } });
    await req("/api/leaderboard/me", { cookie: bob, method: "PUT", body: { joined: true, displayName: "  Bobby  " } });
    // Carol studies but never joins, so she is never listed.
    await sync(carol, [{ key: "medicine:quiz:1.2/anatomy", value: [attempt(10)] }]);
    await sync(alice, [{ key: "medicine:quiz:1.2/anatomy", value: [attempt(8)] }]);
    await sync(bob, [{ key: "medicine:flashcards:1.2/anatomy", value: { a: card(1), b: card(0) } }]);

    // All time: 5 per study day, 1 per correct answer, 2 per learned card.
    const all = await board(alice, "?period=all");
    expect(all.rows.map((r: { name: string; value: number }) => [r.name, r.value])).toEqual([
      ["Alice", 13],
      ["Bobby", 7],
    ]);
    expect(all.me).toMatchObject({ joined: true, rank: 1, value: 13, streak: 1 });

    // This week counts only what was gained after joining the board's baseline.
    const week = await board(alice);
    expect(week.rows.map((r: { name: string; value: number }) => [r.name, r.value])).toEqual([
      ["Alice", 8],
      ["Bobby", 2],
    ]);

    const cohort = await board(alice, "?period=all&scope=cohort");
    expect(cohort.scope).toBe("cohort");
    expect(cohort.rows.map((r: { name: string }) => r.name)).toEqual(["Alice"]);

    const carolView = await board(carol, "?period=all");
    expect(carolView.me).toMatchObject({ joined: false, rank: null, value: 15 });
  });

  it("validates display names and can leave the board", async () => {
    const cookie = await signUp();
    expect((await req("/api/leaderboard/me", { cookie, method: "PUT", body: { displayName: "x" } })).status).toBe(400);
    await req("/api/leaderboard/me", { cookie, method: "PUT", body: { joined: true } });
    await sync(cookie, [{ key: "medicine:activity", value: [today] }]);
    expect((await board(cookie, "?period=all")).rows).toHaveLength(1);
    await req("/api/leaderboard/me", { cookie, method: "PUT", body: { joined: false } });
    expect((await board(cookie, "?period=all")).rows).toHaveLength(0);
  });
});

describe("leaderboard records from before per-key parts", () => {
  it("are rebuilt from synced progress when next read", async () => {
    const cookie = await signUp("old@example.com", "Old Timer");
    const today = new Date().toISOString().slice(0, 10);
    await req("/api/sync", { cookie, body: { since: 0, changes: [{ key: "medicine:activity", value: [today], updatedAt: 1 }] } });
    await req("/api/leaderboard/me", { cookie, method: "PUT", body: { joined: true } });
    const [doc] = await leaderboard.joined();
    // Simulate the first version's shape: totals, no parts.
    const legacy = { ...doc, stats: { points: 5 } } as Partial<typeof doc>;
    delete legacy.parts;
    await leaderboard.delete(doc.userId);
    await leaderboard.create(legacy as typeof doc);

    const board = await (await req("/api/leaderboard?period=all", { cookie })).json();
    expect(board.rows).toEqual([expect.objectContaining({ name: "Old Timer", value: 5 })]);
  });
});

describe("Google sign-in", () => {
  function googleApp() {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
      secret: "test-secret-test-secret-test-secret-1234",
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      google: { clientId: "test-client.apps.googleusercontent.com", clientSecret: "test-secret" },
      onDeleteUser: async () => {},
      rateLimit: false,
    });
    return createApp({ auth, store: new MemoryProgressStore(), leaderboard: new MemoryLeaderboardStore(), googleEnabled: true });
  }

  it("is reported by /api/config when configured", async () => {
    const res = await googleApp()(new Request(ORIGIN + "/api/config"));
    expect(await res.json()).toEqual({ accounts: true, google: true, ai: false, drive: false });
  });

  it("sends the student to Google with this site's callback and the account chooser", async () => {
    const res = await googleApp()(
      new Request(ORIGIN + "/api/auth/sign-in/social", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account" }),
      }),
    );
    expect(res.status).toBe(200);
    const url = new URL((await res.json()).url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  it("sends a failed return from Google back to the Account page, not an error page", async () => {
    const res = await googleApp()(new Request(ORIGIN + "/api/auth/callback/google?error=access_denied"));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!, ORIGIN);
    expect(location.pathname).toBe("/account");
    expect(location.searchParams.get("error")).toBeTruthy();
  });
});

describe("class Drive", () => {
  const files = [{ id: "file000000001", name: "L1.pptx", mimeType: "application/vnd.ms-powerpoint" }];
  const fakeFetch = (async () => Response.json({ files })) as unknown as typeof fetch;

  function withDrive() {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
      secret: "test-secret-test-secret-test-secret-1234",
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      rateLimit: false,
    });
    const drive = new DriveIndex({ apiKey: "k", folderId: "rootFolder0001", apiBase: "https://drive.test/v3", ttlMs: 60_000 }, undefined, fakeFetch);
    app = createApp({ auth, store, leaderboard, googleEnabled: false, drive });
  }

  it("is only for signed-in students", async () => {
    withDrive();
    expect((await req("/api/config")).status).toBe(200);
    expect(await (await req("/api/config")).json()).toMatchObject({ drive: true });
    const res = await req("/api/drive");
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("L1.pptx");
  });

  it("lists the folder for a signed-in student, privately, and says when it hasn't changed", async () => {
    withDrive();
    const cookie = await signUp();
    const res = await req("/api/drive", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    const tree = (await res.json()) as { root: { files: { name: string; kind: string }[] } };
    expect(tree.root.files).toEqual([expect.objectContaining({ name: "L1.pptx", kind: "slides" })]);

    // Asking again with the same listing's tag: nothing to send.
    const etag = res.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"drive-tree-\d+-1"$/);
    const again = await app(new Request(ORIGIN + "/api/drive", { headers: { origin: ORIGIN, cookie, "if-none-match": etag } }));
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("asks for an archive folder by key, and says when there's no such folder", async () => {
    withDrive();
    const cookie = await signUp();
    expect((await req("/api/drive/folder?key=bad", { cookie })).status).toBe(400);
    expect((await req("/api/drive/folder?key=unknownKey000000", { cookie })).status).toBe(404);
    expect((await req("/api/drive/folder?key=unknownKey000000")).status).toBe(401);
  });

  it("says so when the Drive isn't connected", async () => {
    const cookie = await signUp();
    expect((await req("/api/drive", { cookie })).status).toBe(503);
  });
});
