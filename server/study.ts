import { catalogItem } from "./catalog.js";
import { refuse, text, type Args, type Ctx } from "./context.js";
import { daysBefore, isDuplicate, today, type CardReviewDoc, type Collections, type PointSource } from "./db.js";

// Studying: the records that earn points, and the student's own saved state.
//
// Flashcards, image-occlusion figures, quizzes and ebooks live in the repo (content/); the
// catalog (server/catalog.json, built from content/) lists what exists, so a record of a card
// that isn't in a deck, or of a quiz answer to a question that doesn't exist, is refused.
//
// What earns points is written only here, on the server's clock:
//   1 per question answered right (a quiz question or a single-choice bank question, once a day each)
//   2 per card or occlusion label learned (reviewed on two different days)
//  10 per finished ebook chapter
//   5 per study day
// Each record adds its points to `points` (per student, day and source) when it's made, so the
// leaderboard is a sum over a small collection. Points never go down.
//
// `userState` is everything else the app keeps per student (review schedules, quiz history,
// reading positions, plans, settings): the student writes it freely, and nothing reads it for points.

export const POINTS = { quiz: 1, exam: 1, cards: 2, chapters: 10, days: 5 } as const satisfies Record<PointSource, number>;

export async function addPoints(c: Collections, userId: string, source: PointSource, points: number, day = today()): Promise<void> {
  if (points <= 0) return;
  await c.points.updateOne({ userId, day, source }, { $inc: { points } }, { upsert: true });
}

/** Marks today as a study day (5 points the first time each day). */
export async function markStudyDay(c: Collections, userId: string): Promise<void> {
  const day = today();
  const { upsertedCount } = await c.studyDays.updateOne({ userId, day }, { $setOnInsert: { userId, day } }, { upsert: true });
  if (upsertedCount) await addPoints(c, userId, "days", POINTS.days, day);
}

/** Inserts a document unless an equal one exists; true when it was new. */
async function insertNew(insert: () => Promise<unknown>): Promise<boolean> {
  try {
    await insert();
    return true;
  } catch (e) {
    if (isDuplicate(e)) return false;
    throw e;
  }
}

const MAX_REVIEWS_A_CALL = 200;
const MAX_REVIEWS_A_DAY = 3000;

/** Records flashcard and occlusion reviews made today. Items not in the catalog are skipped. Returns how many were new today. */
export async function recordReviews(ctx: Ctx, args: Args): Promise<number> {
  const uid = ctx.caller.userId;
  const items = args.p_items;
  if (!Array.isArray(items) || items.length > MAX_REVIEWS_A_CALL) throw refuse("bad_items");
  const day = today();
  if ((await ctx.c.cardReviews.countDocuments({ userId: uid, day })) + items.length > MAX_REVIEWS_A_DAY) {
    throw refuse("too_many_reviews");
  }
  let added = 0;
  const seen = new Set<string>();
  for (const raw of items) {
    const x = (raw ?? {}) as Record<string, unknown>;
    if ((x.kind !== "flashcard" && x.kind !== "occlusion") || typeof x.deck !== "string" || typeof x.item !== "string") continue;
    if (!catalogItem(x.kind, x.deck, x.item)) continue;
    const key = `${x.kind} ${x.deck} ${x.item}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const doc: CardReviewDoc = { userId: uid, kind: x.kind, deck: x.deck, itemId: x.item, day };
    if (!(await insertNew(() => ctx.c.cardReviews.insertOne(doc)))) continue;
    added++;
    // Learned: reviewed on a second day.
    const days = await ctx.c.cardReviews.countDocuments({ userId: uid, kind: x.kind, deck: x.deck, itemId: x.item });
    if (days === 2) await addPoints(ctx.c, uid, "cards", POINTS.cards, day);
  }
  await markStudyDay(ctx.c, uid);
  return added;
}

/** Grades a finished quiz against the catalog's keys. p_answers: [{ deck, item, choice }], at most 300. */
export async function recordQuiz(ctx: Ctx, args: Args): Promise<{ correct: number; total: number }> {
  const uid = ctx.caller.userId;
  const answers = args.p_answers;
  if (!Array.isArray(answers) || answers.length > 300) throw refuse("bad_answers");
  const day = today();
  const graded = new Map<string, { deck: string; itemId: string; correct: boolean }>();
  for (const raw of answers) {
    const x = (raw ?? {}) as Record<string, unknown>;
    if (typeof x.deck !== "string" || typeof x.item !== "string") continue;
    const item = catalogItem("quiz", x.deck, x.item);
    if (!item) continue;
    const key = `${x.deck} ${x.item}`;
    if (graded.has(key)) continue;
    graded.set(key, { deck: x.deck, itemId: x.item, correct: typeof x.choice === "number" && x.choice === item.answer });
  }
  for (const g of graded.values()) {
    // A question counts once a day: answered right at least once that day.
    const where = { userId: uid, deck: g.deck, itemId: g.itemId, day };
    const before = await ctx.c.quizAnswers.findOneAndUpdate(
      where,
      g.correct ? { $setOnInsert: where, $set: { correct: true } } : { $setOnInsert: { ...where, correct: false } },
      { upsert: true, returnDocument: "before" },
    );
    if (g.correct && !before?.correct) await addPoints(ctx.c, uid, "quiz", POINTS.quiz, day);
  }
  await markStudyDay(ctx.c, uid);
  const list = [...graded.values()];
  return { correct: list.filter((g) => g.correct).length, total: list.length };
}

/** Records a finished ebook chapter (once; un-ticking it in the app keeps the record). */
export async function finishChapter(ctx: Ctx, args: Args): Promise<null> {
  const uid = ctx.caller.userId;
  const deck = text(args, "p_deck") ?? "";
  const chapter = text(args, "p_chapter") ?? "";
  if (!catalogItem("chapter", deck, chapter)) throw refuse("no_such_chapter");
  const day = today();
  if (await insertNew(() => ctx.c.chaptersDone.insertOne({ userId: uid, deck, itemId: chapter, day }))) {
    await addPoints(ctx.c, uid, "chapters", POINTS.chapters, day);
  }
  await markStudyDay(ctx.c, uid);
  return null;
}

/** Marks today as a study day (reading, the lab, the atlas: studying that isn't a record above). */
export async function recordStudyDay(ctx: Ctx): Promise<null> {
  await markStudyDay(ctx.c, ctx.caller.userId);
  return null;
}

/** A student's current run of study days, ending today or yesterday (0 when broken). */
export function streak(days: readonly string[], now = today()): number {
  const set = new Set(days);
  let day = set.has(now) ? now : daysBefore(now, 1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = daysBefore(day, 1);
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// The student's saved state (src/lib/progressSync.ts).

const KEY_RE = /^[a-z]+(:[A-Za-z0-9._/-]{1,120})?$/;
const MAX_KEYS = 3000;
const MAX_VALUE_BYTES = 512 * 1024;

/** The caller's saved state, or only what changed at or after `p_since` (an ISO time). */
export async function userStateList(ctx: Ctx, args: Args): Promise<{ key: string; value: unknown; updated_at: string }[]> {
  const since = text(args, "p_since");
  const filter: Record<string, unknown> = { userId: ctx.caller.userId };
  if (since) {
    const at = new Date(since);
    if (Number.isNaN(at.getTime())) throw refuse("bad_since");
    filter.updatedAt = { $gte: at };
  }
  const rows = await ctx.c.userState.find(filter, { projection: { _id: 0, key: 1, value: 1, updatedAt: 1 } }).sort({ key: 1 }).toArray();
  return rows.map((r) => ({ key: r.key, value: r.value, updated_at: r.updatedAt.toISOString() }));
}

/** Saves changed keys (p_rows: [{ key, value }]) and removes cleared ones (p_cleared: keys). */
export async function userStateSave(ctx: Ctx, args: Args): Promise<null> {
  const uid = ctx.caller.userId;
  const rows = args.p_rows ?? [];
  const cleared = args.p_cleared ?? [];
  if (!Array.isArray(rows) || rows.length > 500 || !Array.isArray(cleared) || cleared.length > 500) throw refuse("bad_rows");
  for (const r of rows) {
    const row = (r ?? {}) as { key?: unknown; value?: unknown };
    if (typeof row.key !== "string" || !KEY_RE.test(row.key) || row.value === undefined || row.value === null) throw refuse("bad_rows");
    if (JSON.stringify(row.value).length > MAX_VALUE_BYTES) throw refuse("value_too_big");
  }
  if (!cleared.every((k) => typeof k === "string" && KEY_RE.test(k))) throw refuse("bad_rows");

  const typed = rows as { key: string; value: unknown }[];
  if (typed.length) {
    const existing = await ctx.c.userState.find({ userId: uid, key: { $in: typed.map((r) => r.key) } }, { projection: { key: 1, value: 1 } }).toArray();
    const before = new Map(existing.map((e) => [e.key, JSON.stringify(e.value)]));
    const added = typed.filter((r) => !before.has(r.key)).length;
    if (added && (await ctx.c.userState.countDocuments({ userId: uid })) + added > MAX_KEYS) throw refuse("progress_full");
    const now = new Date();
    // Saving a value that didn't change writes nothing (and doesn't move updatedAt).
    const changed = typed.filter((r) => before.get(r.key) !== JSON.stringify(r.value));
    if (changed.length) {
      await ctx.c.userState.bulkWrite(
        changed.map((r) => ({
          updateOne: { filter: { userId: uid, key: r.key }, update: { $set: { value: r.value, updatedAt: now } }, upsert: true },
        })),
        { ordered: false },
      );
    }
  }
  if (cleared.length) await ctx.c.userState.deleteMany({ userId: uid, key: { $in: cleared as string[] } });
  return null;
}
