import type { Filter } from "mongodb";
import {
  bool,
  int,
  isInt,
  isString,
  list,
  refuse,
  text,
  trackVisible,
  type Args,
  type Ctx,
} from "../context.js";
import { type QuestionDoc } from "../db.js";
import { liveQuestions, correctIndex, acceptedAnswers, optionsJson } from "./questions.js";
import { createAttempt, beginStart, shuffled, holderArg } from "./attempts.js";

// Practice drawn from the bank, and bookmarks.
// Only questions in a published practice package the student can see are in the practice bank,
// so drilling never reveals a key an exam-only package keeps hidden.

/** Questions the caller may practise: live, in a published practice package of their class. */
async function bankQuestionIds(ctx: Ctx): Promise<string[]> {
  const packages = await ctx.c.packages.find({ mode: "practice", status: "published", deletedAt: null }, { projection: { questionIds: 1, track: 1 } }).toArray();
  const ids = [...new Set(packages.filter((p) => trackVisible(ctx, p.track)).flatMap((p) => p.questionIds))];
  return [...(await liveQuestions(ctx, ids)).keys()];
}

/** What the bank holds for the caller: how many questions per block, source, year and subject, and how many are bookmarked. */
export async function bankOptions(ctx: Ctx) {
  const ids = await bankQuestionIds(ctx);
  const [questions, bookmarks] = await Promise.all([
    ctx.c.questions.find({ _id: { $in: ids } }, { projection: { block: 1, source: 1, year: 1, subject: 1 } }).toArray(),
    ctx.c.bookmarks.find({ userId: ctx.caller.userId, questionId: { $in: ids } }, { projection: { questionId: 1 } }).toArray(),
  ]);
  const marked = new Set(bookmarks.map((b) => b.questionId));
  const groups = new Map<string, { block: string; source: string | null; year: number | null; subject: string | null; questions: number; bookmarked: number }>();
  for (const q of questions) {
    const key = JSON.stringify([q.block, q.source, q.year, q.subject]);
    const g = groups.get(key) ?? { block: q.block, source: q.source, year: q.year, subject: q.subject, questions: 0, bookmarked: 0 };
    g.questions++;
    if (marked.has(q._id)) g.bookmarked++;
    groups.set(key, g);
  }
  const cmp = (a: string | number | null, b: string | number | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : String(a).localeCompare(String(b), undefined, { numeric: true });
  return [...groups.values()].sort((a, b) => cmp(a.block, b.block) || cmp(a.source, b.source) || cmp(a.year, b.year) || cmp(a.subject, b.subject));
}

/** Starts a practice drawn at random from the bank, or returns the attempt already running. Empty filters mean "any". */
export async function startBankPractice(ctx: Ctx, args: Args) {
  const count = int(args, "p_count") ?? 20;
  if (count < 1 || count > 200) throw refuse("bad_count");
  const minutes = int(args, "p_time_limit_minutes");
  if (minutes !== null && (minutes < 1 || minutes > 300)) throw refuse("bad_time_limit");
  const running = await beginStart(ctx);
  if (running) return { attempt_id: running, resumed: true };
  const block = text(args, "p_block");
  const sources = list(args, "p_sources", isString);
  const years = list(args, "p_years", isInt);
  const subjects = list(args, "p_subjects", isString);
  const filter: Filter<QuestionDoc> = { _id: { $in: await bankQuestionIds(ctx) } };
  if (block) filter.block = block;
  if (sources.length) filter.source = { $in: sources };
  if (years.length) filter.year = { $in: years };
  if (subjects.length) filter.subject = { $in: subjects };
  let questions = await ctx.c.questions.find(filter).toArray();
  if (bool(args, "p_bookmarked_only")) {
    const marked = new Set((await ctx.c.bookmarks.find({ userId: ctx.caller.userId }).toArray()).map((b) => b.questionId));
    questions = questions.filter((q) => marked.has(q._id));
  }
  const picked = shuffled(questions).slice(0, count);
  if (!picked.length) throw refuse("no_questions_match");
  const title = (text(args, "p_title")?.trim() || "Practice").slice(0, 160);
  return createAttempt(ctx, { packageId: null, title, mode: "practice", timeLimitMinutes: minutes, holder: holderArg(args) }, picked);
}

/** The ids of the caller's bookmarked questions. */
export async function bookmarkIds(ctx: Ctx): Promise<string[]> {
  return (await ctx.c.bookmarks.find({ userId: ctx.caller.userId }, { projection: { questionId: 1 } }).toArray()).map((b) => b.questionId);
}

export async function setBookmark(ctx: Ctx, args: Args): Promise<null> {
  const questionId = text(args, "p_question_id") ?? "";
  if (bool(args, "p_on")) {
    if (!(await ctx.c.questions.countDocuments({ _id: questionId }))) throw refuse("question_not_found");
    await ctx.c.bookmarks.updateOne(
      { userId: ctx.caller.userId, questionId },
      { $setOnInsert: { userId: ctx.caller.userId, questionId, createdAt: ctx.now } },
      { upsert: true },
    );
  } else {
    await ctx.c.bookmarks.deleteOne({ userId: ctx.caller.userId, questionId });
  }
  return null;
}

/** The caller's bookmarks with the question, its key and explanation, newest first (bank questions only). */
export async function myBookmarks(ctx: Ctx) {
  const bank = new Set(await bankQuestionIds(ctx));
  const bookmarks = (await ctx.c.bookmarks.find({ userId: ctx.caller.userId }).sort({ createdAt: -1 }).toArray()).filter((b) => bank.has(b.questionId));
  const questions = await liveQuestions(ctx, bookmarks.map((b) => b.questionId));
  return bookmarks.flatMap((b) => {
    const q = questions.get(b.questionId);
    if (!q) return [];
    return [{
      id: q._id,
      block: q.block,
      source: q.source,
      year: q.year,
      subject: q.subject,
      type: q.kind,
      stem: q.stem,
      stem_image: q.stemImage,
      stem_image_alt: q.stemImageAlt,
      options: optionsJson(q),
      correct: correctIndex(q),
      accepted_answers: acceptedAnswers(q),
      explanation: q.explanation,
      bookmarked_at: b.createdAt.toISOString(),
    }];
  });
}
