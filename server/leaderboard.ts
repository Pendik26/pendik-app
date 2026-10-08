import type { Collection, Db, UpdateFilter } from "mongodb";
import { deleteOwn, own, setOwn } from "../src/lib/records.js";
import { parseKey, type KeyTypeName } from "../src/lib/storageSchema.js";

// The leaderboard ranks students who opted in, by points worked out on the server from their
// synced progress (never a score the browser reports). Progress lives in the browser first,
// so this is honour-based; the caps below keep a malformed or hand-edited value from
// producing an absurd score.
//
// Scoring is incremental. Each scoring key ("medicine:quiz:1.2/anatomy", "medicine:activity", ...)
// has a small score part in the student's leaderboard document, and a sync recomputes the parts
// for just the keys it wrote. Parts are written as separate fields, so two syncs at once can't
// overwrite each other's, and totals are summed when the board is read.

/** How points are earned. The Leaderboard page shows the same table. */
export const POINTS = {
  correctAnswer: 1,
  cardLearned: 2,
  chapterFinished: 10,
  studyDay: 5,
} as const;

/** The progress types that score, from the key registry. */
const SCORED_TYPES: ReadonlySet<string> = new Set<KeyTypeName>(["flashcards", "occlusion", "quiz", "examhistory", "ebookdone", "activity"]);

/** What one progress key contributes. Only the fields that key's type produces are set. */
export interface ScorePart {
  /** Correct answers across the key's quiz or exam attempts. */
  correctAnswers?: number;
  /** Flashcards reviewed successfully at least once (SM-2 reps ≥ 1). */
  cardsLearned?: number;
  chaptersFinished?: number;
  studyDays?: number;
  /** The latest run of consecutive study days: its last day (UTC date) and length. */
  runEnd?: string | null;
  runLength?: number;
}

export interface LeaderboardStats {
  points: number;
  correctAnswers: number;
  cardsLearned: number;
  chaptersFinished: number;
  studyDays: number;
}

export interface LeaderboardDoc {
  userId: string;
  joined: boolean;
  displayName: string;
  cohort: string | null;
  /** Score part per scoring key, stored under partField(key). Missing on records from before parts existed. */
  parts?: Record<string, ScorePart>;
  /** Points gained per UTC day over the last two weeks, for the weekly board. Missing on old records. */
  daily?: Record<string, number>;
  /** Exam readiness (0–100) per block, under readinessField(blockId), for the class average. */
  readiness?: Record<string, number>;
  updatedAt: number;
}

/** Block ids contain dots, which MongoDB reads as nesting: "1.2" is stored as "1_2". */
export const readinessField = (blockId: string) => blockId.replace(/\./g, "_");

/** A class average is only shown once this many students have one, so no one's number shows through. */
export const MIN_CLASS_SIZE = 3;

export type Period = "week" | "all" | "streak";

const DAY_MS = 86_400_000;
const DAILY_KEEP_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

/** Keys whose changes can move a student's score. */
export function affectsLeaderboard(key: string): boolean {
  const parsed = parseKey(key);
  if (!parsed || !SCORED_TYPES.has(parsed.type)) return false;
  // Study days are one per-device list; the rest are per subject, block or package.
  return parsed.type === "activity" ? parsed.id === null : parsed.id !== null;
}

/**
 * The document field a key's part is stored under. MongoDB reads "." in a field name as a path,
 * and block ids contain dots ("1.2"); "%" never appears in a key, so this is reversible.
 */
export function partField(key: string): string {
  return key.replaceAll(".", "%2E");
}

/** What one progress key's value contributes to the score. */
export function partFor(key: string, value: unknown, now = Date.now()): ScorePart {
  const type = parseKey(key)?.type;
  if (type === "flashcards" || type === "occlusion") {
    const cards = isRecord(value) ? Object.values(value).slice(0, 5000) : [];
    return { cardsLearned: cards.filter((c) => isRecord(c) && isInt(c.reps, 10_000) && c.reps >= 1).length };
  }
  if (type === "quiz" || type === "examhistory") {
    let correctAnswers = 0;
    for (const a of Array.isArray(value) ? value.slice(0, 1000) : []) {
      if (isRecord(a) && isInt(a.total, 500) && isInt(a.score, a.total)) correctAnswers += a.score;
    }
    return { correctAnswers };
  }
  if (type === "ebookdone") {
    const ids = Array.isArray(value) ? value.filter((id) => typeof id === "string" && id.length <= 60) : [];
    return { chaptersFinished: new Set(ids).size };
  }
  if (type === "activity") {
    const latestDay = utcDay(now + DAY_MS);
    const days = Array.isArray(value)
      ? value.filter((d): d is string => typeof d === "string" && DATE_RE.test(d) && d >= "2020-01-01" && d <= latestDay)
      : [];
    const sorted = [...new Set(days)].sort();
    let runLength = 0;
    const last = sorted.at(-1);
    // Count back from the last day while each earlier day is the one before.
    if (last) {
      for (const day of [...sorted].reverse()) {
        if (day !== utcDay(Date.parse(last) - runLength * DAY_MS)) break;
        runLength += 1;
      }
    }
    return { studyDays: sorted.length, runEnd: last ?? null, runLength };
  }
  return {};
}

function partPoints(p: ScorePart | undefined): number {
  if (!p) return 0;
  return (
    (p.correctAnswers ?? 0) * POINTS.correctAnswer +
    (p.cardsLearned ?? 0) * POINTS.cardLearned +
    (p.chaptersFinished ?? 0) * POINTS.chapterFinished +
    (p.studyDays ?? 0) * POINTS.studyDay
  );
}

/** Totals and the latest study run, summed from a student's parts. */
export function summarize(parts: Record<string, ScorePart> | undefined): {
  stats: LeaderboardStats;
  runEnd: string | null;
  runLength: number;
} {
  const stats: LeaderboardStats = { points: 0, correctAnswers: 0, cardsLearned: 0, chaptersFinished: 0, studyDays: 0 };
  let runEnd: string | null = null;
  let runLength = 0;
  for (const p of Object.values(parts ?? {})) {
    stats.points += partPoints(p);
    stats.correctAnswers += p.correctAnswers ?? 0;
    stats.cardsLearned += p.cardsLearned ?? 0;
    stats.chaptersFinished += p.chaptersFinished ?? 0;
    stats.studyDays += p.studyDays ?? 0;
    if (p.runEnd) ({ runEnd, runLength } = { runEnd: p.runEnd, runLength: p.runLength ?? 0 });
  }
  return { stats, runEnd, runLength };
}

/** Score parts for a set of progress entries (all of a student's, for a fresh record). */
export function partsFor(entries: { key: string; value: unknown }[], now = Date.now()): Record<string, ScorePart> {
  const parts: Record<string, ScorePart> = {};
  for (const e of entries) if (affectsLeaderboard(e.key)) parts[partField(e.key)] = partFor(e.key, e.value, now);
  return parts;
}

/** Totals for a set of progress entries. */
export function computeStats(entries: { key: string; value: unknown }[], now = Date.now()) {
  return summarize(partsFor(entries, now));
}

/**
 * A new student's record. Its parts count everything synced so far, but none of it is credited
 * to this week: progress from before the record existed (or from guest mode) would otherwise
 * all land on one day.
 */
export function newDoc(
  base: { userId: string; displayName: string; cohort: string | null },
  entries: { key: string; value: unknown }[],
  now = Date.now(),
): LeaderboardDoc {
  return { ...base, joined: false, parts: partsFor(entries, now), daily: {}, updatedAt: now };
}

export interface ScoreUpdate {
  /** New parts for the keys that changed, by partField. */
  parts: Record<string, ScorePart>;
  /** Points gained by those changes, credited to `day` (never negative: a reset card doesn't subtract). */
  gained: number;
  day: string;
  /** Days in `daily` old enough to drop. */
  dropDays: string[];
  now: number;
}

/** The change to a student's record after a sync wrote these entries. */
export function scoreUpdate(prev: LeaderboardDoc, entries: { key: string; value: unknown }[], now = Date.now()): ScoreUpdate {
  const parts: Record<string, ScorePart> = {};
  let delta = 0;
  for (const e of entries) {
    if (!affectsLeaderboard(e.key)) continue;
    const field = partField(e.key);
    const part = partFor(e.key, e.value, now);
    setOwn(parts, field, part);
    delta += partPoints(part) - partPoints(prev.parts && own(prev.parts, field));
  }
  const oldest = utcDay(now - (DAILY_KEEP_DAYS - 1) * DAY_MS);
  return {
    parts,
    gained: Math.max(0, delta),
    day: utcDay(now),
    dropDays: Object.keys(prev.daily ?? {}).filter((d) => d < oldest),
    now,
  };
}

/** A student's score on one board. */
export function scoreFor(doc: LeaderboardDoc, period: Period, now = Date.now()): number {
  if (period === "all") return summarize(doc.parts).stats.points;
  if (period === "streak") {
    // A run still counts if its last day was today or yesterday (UTC), or "tomorrow" for
    // students east of UTC whose local date is ahead.
    const { runEnd, runLength } = summarize(doc.parts);
    return runEnd !== null && runEnd >= utcDay(now - DAY_MS) ? runLength : 0;
  }
  const since = utcDay(now - 6 * DAY_MS);
  return Object.entries(doc.daily ?? {}).reduce((sum, [day, pts]) => (day >= since ? sum + pts : sum), 0);
}

export interface BoardRow {
  rank: number;
  name: string;
  cohort: string | null;
  value: number;
  me: boolean;
}

/** Ranks joined students with a score above zero; ties share a rank (1, 2, 2, 4). */
export function rankBoard(
  docs: LeaderboardDoc[],
  { period, cohort, userId, now = Date.now() }: { period: Period; cohort?: string | null; userId: string; now?: number },
): BoardRow[] {
  const rows = docs
    .filter((d) => d.joined && (!cohort || d.cohort === cohort))
    .map((d) => ({ name: d.displayName, cohort: d.cohort, value: scoreFor(d, period, now), me: d.userId === userId }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.value !== rows[i - 1].value) rank = i + 1;
    return { rank, ...r };
  });
}

/** Trims and checks a display name; returns null when it isn't acceptable. */
export function cleanDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const printable = [...input].filter((ch) => ch >= " " && ch !== "\u007f").join("");
  const name = printable.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 32 ? name : null;
}

export type Profile = Pick<LeaderboardDoc, "joined" | "displayName" | "cohort">;

export interface LeaderboardStore {
  get(userId: string): Promise<LeaderboardDoc | null>;
  /** Inserts a new record. If one appeared in the meantime, that one is kept. */
  create(doc: LeaderboardDoc): Promise<void>;
  /** Writes the parts that changed, credits the gain to its day and drops old days. */
  applyScore(userId: string, update: ScoreUpdate): Promise<void>;
  /** Replaces every part at once (repairing a record from before parts existed). */
  replaceParts(userId: string, parts: Record<string, ScorePart>, now: number): Promise<void>;
  setProfile(userId: string, patch: Partial<Profile>): Promise<void>;
  /**
   * The students who joined the board (in one cohort, if given), with what ranking them by
   * `period` needs: the weekly board reads only the per-day points, the others the parts.
   */
  joined(period?: Period, cohort?: string | null): Promise<LeaderboardDoc[]>;
  delete(userId: string): Promise<void>;
  setReadiness(userId: string, blockId: string, value: number): Promise<void>;
  /** The average readiness for a block, among one cohort (or everyone), and how many it covers. */
  classReadiness(blockId: string, cohort: string | null): Promise<{ average: number | null; count: number }>;
}

const MAX_BOARD = 5000;

export class MongoLeaderboardStore implements LeaderboardStore {
  // Indexes are declared in schema.ts.
  private readonly col: Collection<LeaderboardDoc>;

  constructor(db: Db) {
    this.col = db.collection<LeaderboardDoc>("leaderboard");
  }

  async get(userId: string) {
    return this.col.findOne({ userId }, { projection: { _id: 0 } });
  }

  async create(doc: LeaderboardDoc) {
    await this.col.updateOne({ userId: doc.userId }, { $setOnInsert: doc }, { upsert: true });
  }

  async applyScore(userId: string, u: ScoreUpdate) {
    const $set: Record<string, unknown> = { updatedAt: u.now };
    for (const [field, part] of Object.entries(u.parts)) $set[`parts.${field}`] = part;
    const update: Record<string, Record<string, unknown>> = { $set };
    if (u.gained > 0) update.$inc = { [`daily.${u.day}`]: u.gained };
    if (u.dropDays.length) update.$unset = Object.fromEntries(u.dropDays.map((d) => [`daily.${d}`, ""]));
    await this.col.updateOne({ userId }, update as UpdateFilter<LeaderboardDoc>);
  }

  async replaceParts(userId: string, parts: Record<string, ScorePart>, now: number) {
    // Also clears the totals fields the first version of the leaderboard stored.
    await this.col.updateOne({ userId }, { $set: { parts, updatedAt: now }, $unset: { stats: "", runEnd: "", runLength: "" } });
  }

  async setProfile(userId: string, patch: Partial<Profile>) {
    await this.col.updateOne({ userId }, { $set: patch });
  }

  async joined(period?: Period, cohort?: string | null) {
    const scoring = period === "week" ? { daily: 1 } : period ? { parts: 1 } : { parts: 1, daily: 1 };
    return this.col
      .find<LeaderboardDoc>(
        { joined: true, ...(cohort ? { cohort } : {}) },
        { projection: { _id: 0, userId: 1, joined: 1, displayName: 1, cohort: 1, updatedAt: 1, ...scoring } },
      )
      .limit(MAX_BOARD)
      .toArray();
  }

  async delete(userId: string) {
    await this.col.deleteOne({ userId });
  }

  async setReadiness(userId: string, blockId: string, value: number) {
    await this.col.updateOne({ userId }, { $set: { [`readiness.${readinessField(blockId)}`]: value } });
  }

  async classReadiness(blockId: string, cohort: string | null) {
    const field = `readiness.${readinessField(blockId)}`;
    const row = (await this.col
      .aggregate<{ average: number; count: number }>([
        { $match: { [field]: { $type: "number" }, ...(cohort ? { cohort } : {}) } },
        { $group: { _id: null, average: { $avg: `$${field}` }, count: { $sum: 1 } } },
      ])
      .toArray()).at(0);
    return { average: row?.average ?? null, count: row?.count ?? 0 };
  }
}

/** In-memory store for tests and the local dev server, with the same update semantics. */
export class MemoryLeaderboardStore implements LeaderboardStore {
  private readonly docs = new Map<string, LeaderboardDoc>();

  async get(userId: string) {
    const d = this.docs.get(userId);
    return d ? structuredClone(d) : null;
  }

  async create(doc: LeaderboardDoc) {
    if (!this.docs.has(doc.userId)) this.docs.set(doc.userId, structuredClone(doc));
  }

  async applyScore(userId: string, u: ScoreUpdate) {
    const d = this.docs.get(userId);
    if (!d) return;
    d.parts = { ...d.parts, ...structuredClone(u.parts) };
    const daily = (d.daily ??= {});
    if (u.gained > 0) setOwn(daily, u.day, (own(daily, u.day) ?? 0) + u.gained);
    for (const day of u.dropDays) deleteOwn(daily, day);
    d.updatedAt = u.now;
  }

  async replaceParts(userId: string, parts: Record<string, ScorePart>, now: number) {
    const d = this.docs.get(userId);
    if (d) Object.assign(d, { parts: structuredClone(parts), updatedAt: now });
  }

  async setProfile(userId: string, patch: Partial<Profile>) {
    const d = this.docs.get(userId);
    if (d) Object.assign(d, patch);
  }

  async joined(_period?: Period, cohort?: string | null) {
    return [...this.docs.values()].filter((d) => d.joined && (!cohort || d.cohort === cohort)).map((d) => structuredClone(d));
  }

  async delete(userId: string) {
    this.docs.delete(userId);
  }

  async setReadiness(userId: string, blockId: string, value: number) {
    const d = this.docs.get(userId);
    if (d) d.readiness = { ...d.readiness, [readinessField(blockId)]: value };
  }

  async classReadiness(blockId: string, cohort: string | null) {
    const values = [...this.docs.values()]
      .filter((d) => !cohort || d.cohort === cohort)
      .map((d) => d.readiness?.[readinessField(blockId)])
      .filter((v): v is number => typeof v === "number");
    return { average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, count: values.length };
  }
}
