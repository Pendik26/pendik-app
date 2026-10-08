import { isSyncableKey, mergeEntry, type SyncEntry } from "../src/lib/syncMerge.js";
import type { Auth } from "./auth.js";
import {
  affectsLeaderboard,
  cleanDisplayName,
  MIN_CLASS_SIZE,
  newDoc,
  partsFor,
  POINTS,
  rankBoard,
  scoreFor,
  scoreUpdate,
  summarize,
  type LeaderboardDoc,
  type LeaderboardStore,
} from "./leaderboard.js";
import type { ProgressStore, StoredEntry } from "./progressStore.js";
import { parseChatRequest, parseExplainRequest, streamChat, streamExplanation, utcDay, type AiConfig, type AiUsageStore } from "./ai.js";
import { publicTree, type DriveIndex } from "./drive.js";

const MAX_BODY_BYTES = 2_000_000;
const MAX_CHANGES = 1000;
// Changes written by another device while this request ran could get a slightly earlier rev
// than our "since"; re-sending the last few seconds costs little (merging is idempotent).
const OVERLAP_MS = 5000;
const BOARD_SIZE = 100;
const MAX_AI_BODY_BYTES = 20_000;
const BLOCK_RE = /^[0-9A-Za-z.-]{1,20}$/;
// A chat carries its recent turns and the page on screen.
const MAX_AI_CHAT_BYTES = 64_000;

export interface AppDeps {
  auth: Auth;
  store: ProgressStore;
  leaderboard: LeaderboardStore;
  googleEnabled: boolean;
  /** "Explain this" through an AI gateway; absent when the AI settings aren't configured. */
  ai?: { config: AiConfig; usage: AiUsageStore; fetch?: typeof fetch };
  /** The class's shared Google Drive folder; absent when it isn't connected. */
  drive?: DriveIndex;
}

interface SessionUser {
  id: string;
  name: string;
  cohort: string | null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const error = (status: number, message: string) => json({ error: message }, status);

function isChange(c: unknown, now: number): c is SyncEntry {
  if (typeof c !== "object" || c === null) return false;
  const { key, updatedAt, value } = c as Record<string, unknown>;
  return (
    typeof key === "string" &&
    isSyncableKey(key) &&
    typeof updatedAt === "number" &&
    Number.isFinite(updatedAt) &&
    updatedAt >= 0 &&
    updatedAt <= now + 86_400_000 &&
    value !== undefined
  );
}

/** The whole API as one fetch-style handler: auth, config, sync and account export. */
export function createApp({ auth, store, leaderboard, googleEnabled, ai, drive }: AppDeps) {
  /** Cookies to send back with a request's response (a renewed session cache). */
  const renewed = new WeakMap<Request, string[]>();

  /**
   * The signed-in student. `cached`: the route only reads, so the session cookie cache may answer
   * (see auth.ts). Everything that can save something checks the database, so nothing is written
   * for an account that was just signed out or deleted elsewhere.
   */
  async function sessionUser(request: Request, { cached = false } = {}): Promise<SessionUser | null> {
    const { headers, response: session } = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: !cached },
      returnHeaders: true,
    });
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) renewed.set(request, cookies);
    if (!session) return null;
    const user = session.user as { id: string; name?: string; cohort?: string | null };
    return { id: user.id, name: user.name ?? "", cohort: user.cohort?.trim() || null };
  }

  /**
   * The student's leaderboard record. All of their synced progress is read only to create it,
   * or once to repair a record saved before per-key score parts existed.
   */
  async function scoreRecord(user: SessionUser): Promise<LeaderboardDoc> {
    const existing = await leaderboard.get(user.id);
    if (existing?.parts) return existing;
    const entries = await store.all(user.id);
    if (existing) {
      await leaderboard.replaceParts(user.id, partsFor(entries), Date.now());
    } else {
      const displayName = cleanDisplayName(user.name) ?? "Student";
      await leaderboard.create(newDoc({ userId: user.id, displayName, cohort: user.cohort }, entries));
    }
    const updated = await leaderboard.get(user.id);
    if (!updated) throw new Error("Leaderboard record was not created");
    return updated;
  }

  /** Rescores just the keys a sync wrote (store.put has already saved them). */
  async function rescore(user: SessionUser, written: StoredEntry[]): Promise<void> {
    const prev = await leaderboard.get(user.id);
    if (prev?.parts) await leaderboard.applyScore(user.id, scoreUpdate(prev, written));
    else await scoreRecord(user);
  }

  async function board(request: Request, user: SessionUser): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const period = (["week", "all", "streak"] as const).find((p) => p === params.get("period")) ?? "week";
    const scope = params.get("scope") === "cohort" && user.cohort ? "cohort" : "everyone";
    const cohort = scope === "cohort" ? user.cohort : null;
    const me = await scoreRecord(user);
    if (me.cohort !== user.cohort) {
      // The cohort was changed on the Account page.
      await leaderboard.setProfile(user.id, { cohort: user.cohort });
      me.cohort = user.cohort;
    }
    const rows = rankBoard(await leaderboard.joined(period, cohort), { period, cohort, userId: user.id });
    const myRow = rows.find((r) => r.me);
    return json({
      period,
      scope,
      cohort: user.cohort,
      points: POINTS,
      rows: rows.slice(0, BOARD_SIZE),
      total: rows.length,
      me: {
        joined: me.joined,
        displayName: me.displayName,
        rank: myRow?.rank ?? null,
        value: scoreFor(me, period),
        stats: summarize(me.parts).stats,
        streak: scoreFor(me, "streak"),
        week: scoreFor(me, "week"),
      },
    });
  }

  async function updateMe(request: Request, user: SessionUser): Promise<Response> {
    let body: { joined?: unknown; displayName?: unknown };
    try {
      body = (await request.json()) ?? {};
    } catch {
      return error(400, "Invalid JSON.");
    }
    const patch: { joined?: boolean; displayName?: string } = {};
    if (body.displayName !== undefined) {
      const name = cleanDisplayName(body.displayName);
      if (!name) return error(400, "Display names are 2 to 32 characters.");
      patch.displayName = name;
    }
    if (body.joined !== undefined) {
      if (typeof body.joined !== "boolean") return error(400, "Invalid 'joined'.");
      patch.joined = body.joined;
    }
    const doc = await scoreRecord(user);
    await leaderboard.setProfile(user.id, patch);
    return json({ joined: patch.joined ?? doc.joined, displayName: patch.displayName ?? doc.displayName });
  }

  /**
   * Exam readiness against the class: PUT records the student's own number for a block, GET
   * answers the class average (their cohort, or everyone without one) once enough have one.
   */
  async function readiness(request: Request, user: SessionUser): Promise<Response> {
    if (request.method === "PUT") {
      let body: { block?: unknown; value?: unknown };
      try {
        body = (await request.json()) ?? {};
      } catch {
        return error(400, "Invalid JSON.");
      }
      if (typeof body.block !== "string" || !BLOCK_RE.test(body.block)) return error(400, "Invalid 'block'.");
      if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0 || body.value > 100) return error(400, "Invalid 'value'.");
      await scoreRecord(user);
      await leaderboard.setReadiness(user.id, body.block, Math.round(body.value * 10) / 10);
      return json({ ok: true });
    }
    const block = new URL(request.url).searchParams.get("block") ?? "";
    if (!BLOCK_RE.test(block)) return error(400, "Invalid 'block'.");
    const { average, count } = await leaderboard.classReadiness(block, user.cohort ?? null);
    return json({ cohort: user.cohort ?? null, count, average: count >= MIN_CLASS_SIZE && average !== null ? Math.round(average) : null });
  }

  async function sync(request: Request, user: SessionUser): Promise<Response> {
    const uid = user.id;
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "Too much data in one sync.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return error(400, "Invalid JSON.");
    }
    const { since, changes } = (body ?? {}) as { since?: unknown; changes?: unknown };
    if (typeof since !== "number" || !Number.isFinite(since) || since < 0) return error(400, "Invalid 'since'.");
    if (!Array.isArray(changes) || changes.length > MAX_CHANGES) return error(400, "Invalid 'changes'.");

    const start = Date.now();
    const valid = changes.filter((c) => isChange(c, start));
    if (valid.length !== changes.length) return error(400, "Some changes were invalid.");

    const existing = await store.get(uid, [...new Set(valid.map((c) => c.key))]);
    const writes = new Map<string, StoredEntry>();
    for (const change of valid) {
      const current = writes.get(change.key) ?? existing.get(change.key);
      const merged = current ? mergeEntry(current, change) : change;
      writes.set(change.key, { key: change.key, value: merged.value, updatedAt: merged.updatedAt, rev: start });
    }
    await store.put(uid, [...writes.values()]);
    const scored = [...writes.values()].filter((e) => affectsLeaderboard(e.key));
    if (scored.length) await rescore(user, scored);

    const entries = await store.changedSince(uid, since > 0 ? since - OVERLAP_MS : 0);
    return json({
      serverTime: start,
      entries: entries.map(({ key, value, updatedAt }) => ({ key, value, updatedAt })),
    });
  }

  /** "Explain this" and Alfond's chat: checked, counted against the daily allowance, streamed. */
  async function askAi(request: Request, user: SessionUser, kind: "explain" | "chat"): Promise<Response> {
    if (!ai) return error(503, "AI isn't switched on for this site.");
    const text = await request.text();
    if (text.length > (kind === "chat" ? MAX_AI_CHAT_BYTES : MAX_AI_BODY_BYTES)) {
      return error(413, kind === "chat" ? "That message is too long." : "That question is too long to explain.");
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return error(400, "Invalid JSON.");
    }
    const explainRequest = kind === "explain" ? parseExplainRequest(body) : null;
    const chatRequest = kind === "chat" ? parseChatRequest(body) : null;
    if (!explainRequest && !chatRequest) return error(400, kind === "chat" ? "A message is needed." : "A question and its answer are needed.");
    const limit = ai.config.dailyLimit;
    const day = utcDay(Date.now());
    const { ok, used } = await ai.usage.take(user.id, day, limit);
    if (!ok) return error(429, `You've used today's ${limit} AI answers. They reset at 07:00 WIB (midnight UTC).`);
    const response = explainRequest
      ? await streamExplanation(ai.config, explainRequest, ai.fetch)
      : chatRequest
        ? await streamChat(ai.config, chatRequest, ai.fetch)
        : error(400, "A message is needed.");
    // A failed answer doesn't use up one of the student's daily allowance.
    if (!response.ok) {
      await ai.usage.refund(user.id, day);
      return response;
    }
    response.headers.set("x-ai-remaining", String(Math.max(0, limit - used)));
    return response;
  }

  async function exportAccount(request: Request, uid: string): Promise<Response> {
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user as Record<string, unknown> | undefined;
    const progress = await store.all(uid);
    return json({
      exportedAt: new Date().toISOString(),
      user: user && {
        id: user.id,
        name: user.name,
        email: user.email,
        cohort: user.cohort ?? null,
        createdAt: user.createdAt,
      },
      progress: progress.map(({ key, value, updatedAt }) => ({ key, value, updatedAt: new Date(updatedAt).toISOString() })),
    });
  }

  async function handle(request: Request): Promise<Response> {
    const response = await route(request);
    for (const cookie of renewed.get(request) ?? []) response.headers.append("set-cookie", cookie);
    return response;
  }

  async function route(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/auth/")) return await auth.handler(request);
      if (pathname === "/api/config" && request.method === "GET") {
        return json({ accounts: true, google: googleEnabled, ai: Boolean(ai), drive: Boolean(drive) });
      }
      if (pathname === "/api/drive" || pathname === "/api/drive/folder") {
        if (request.method !== "GET") return error(405, "Method not allowed.");
        const user = await sessionUser(request, { cached: true });
        if (!user) return error(401, "Sign in to see the class Drive.");
        if (!drive) return error(503, "The class Drive isn't connected.");
        const params = new URL(request.url).searchParams;
        const refresh = params.get("refresh") === "1";
        const key = params.get("key") ?? "";
        if (pathname === "/api/drive/folder" && !/^[A-Za-z0-9_-]{16}$/.test(key)) return error(400, "Which folder?");
        try {
          const tree = pathname === "/api/drive" ? await drive.tree({ refresh }) : await drive.folder(key, { refresh });
          if (!tree) return error(404, "That folder isn't in the class Drive any more.");
          // The listing changes only when Drive is read again: a browser that has this one
          // gets a 304 instead of the whole tree.
          const etag = `"drive-${key || "tree"}-${tree.updatedAt}-${tree.complete ? 1 : 0}"`;
          const headers = { etag, "cache-control": "private, no-cache" };
          if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
          return new Response(JSON.stringify(publicTree(tree)), { headers: { ...headers, "content-type": "application/json" } });
        } catch {
          return error(502, "Couldn't reach Google Drive. Try again in a minute.");
        }
      }
      if (pathname === "/api/ai/explain" || pathname === "/api/ai/chat") {
        if (request.method !== "POST") return error(405, "Method not allowed.");
        const user = await sessionUser(request);
        if (!user) return error(401, "Sign in to ask the AI.");
        return await askAi(request, user, pathname === "/api/ai/chat" ? "chat" : "explain");
      }
      if (pathname === "/api/readiness") {
        if (request.method !== "GET" && request.method !== "PUT") return error(405, "Method not allowed.");
        const user = await sessionUser(request, { cached: request.method === "GET" });
        if (!user) return error(401, "Sign in to compare with your class.");
        return await readiness(request, user);
      }
      if (["/api/sync", "/api/account/export", "/api/leaderboard", "/api/leaderboard/me"].includes(pathname)) {
        const user = await sessionUser(request);
        if (!user) return error(401, pathname.startsWith("/api/leaderboard") ? "Sign in to see the leaderboard." : "Sign in to sync.");
        if (pathname === "/api/sync" && request.method === "POST") return await sync(request, user);
        if (pathname === "/api/account/export" && request.method === "GET") return await exportAccount(request, user.id);
        if (pathname === "/api/leaderboard" && request.method === "GET") return await board(request, user);
        if (pathname === "/api/leaderboard/me" && request.method === "PUT") return await updateMe(request, user);
        return error(405, "Method not allowed.");
      }
      return error(404, "Not found.");
    } catch (err) {
      console.error(err);
      return error(500, "Something went wrong on the server.");
    }
  }

  return handle;
}

export type App = ReturnType<typeof createApp>;
