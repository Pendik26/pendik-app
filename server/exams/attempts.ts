import { randomUUID } from "node:crypto";
import {
  int,
  isAdmin,
  isInt,
  isString,
  list,
  refuse,
  text,
  trackVisible,
  type Args,
  type Ctx,
} from "../context.js";
import { isDuplicate, today, type AttemptDoc, type AttemptItem, type Mode, type QuestionDoc } from "../db.js";
import { addPoints, markStudyDay, POINTS } from "../study.js";
import { liveQuestions, correctIndex, acceptedAnswers } from "./questions.js";

// Attempts at a package, as an exam or as practice. Rules kept here, never trusted to the browser:
// - One attempt in progress per student, across all packages and bank practice.
// - An attempt freezes its questions, their order, each question's option order and revision
//   when it starts, so editing a package or a question later never rewrites someone's attempt.
// - The deadline is startedAt + time limit, on the server's clock. Answers saved more than GRACE
//   seconds after it are refused; a late submit is graded on the answers saved before it. An
//   expired attempt is graded the next time its owner touches it.
// - One browser tab holds an attempt at a time (`holder`, a random id per tab). Another tab can
//   take it over, but a tab that isn't the holder can't save or submit.
// - Exam attempts never send answer keys before they're finished; practice sends them with the
//   questions for instant feedback.
// - Short answers are graded by the student's own mark in practice and not graded in exams.

const GRACE_SECONDS = 5;

const deadline = (a: AttemptDoc) => (a.timeLimitMinutes === null ? null : a.startedAt.getTime() + a.timeLimitMinutes * 60_000);
const expired = (a: AttemptDoc, now: Date) => {
  const d = deadline(a);
  return d !== null && now.getTime() > d + GRACE_SECONDS * 1000;
};

export function shuffled<T>(xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Writes a tab's answers into an attempt's items. */
function applyAnswers(items: AttemptItem[], answers: unknown, flagged: readonly string[]): AttemptItem[] {
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) throw refuse("bad_answers");
  const given = answers as Record<string, unknown>;
  return items.map((item) => {
    const a = (Object.hasOwn(given, item.questionId) ? given[item.questionId] : null) as Record<string, unknown> | null;
    const choice = a?.choice;
    return {
      ...item,
      choice: isInt(choice) && choice >= 0 && choice < (item.optionOrder?.length ?? 0) ? choice : null,
      answerText: typeof a?.text === "string" ? a.text.slice(0, 2000) : null,
      selfMark: typeof a?.self_mark === "boolean" ? a.self_mark : null,
      flagged: flagged.includes(item.questionId),
    };
  });
}

/** An attempt's answers in the shape the app sends them. */
function attemptAnswers(a: AttemptDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const i of a.items) {
    if (i.choice === null && i.answerText === null && i.selfMark === null) continue;
    out[i.questionId] = {
      ...(i.choice !== null ? { choice: i.choice } : {}),
      ...(i.answerText !== null ? { text: i.answerText } : {}),
      ...(i.selfMark !== null ? { self_mark: i.selfMark } : {}),
    };
  }
  return out;
}

/** Grades an in-progress attempt and freezes it; its right answers earn points. Callers check ownership. */
async function finishAttempt(ctx: Ctx, a: AttemptDoc, answers: unknown | null): Promise<void> {
  if (a.status !== "in_progress") return;
  let items = a.items;
  // Late: grade what was saved before the deadline, not what the browser sends now.
  if (answers !== null && answers !== undefined && !expired(a, ctx.now)) {
    items = applyAnswers(items, answers, items.filter((i) => i.flagged).map((i) => i.questionId));
  }
  const questions = await ctx.c.questions.find({ _id: { $in: items.map((i) => i.questionId) } }).toArray();
  const byId = new Map(questions.map((q) => [q._id, q]));
  items = items.map((i) => {
    const q = byId.get(i.questionId);
    const right = q ? correctIndex(q) : null;
    const correctChoice = i.optionOrder && right !== null ? i.optionOrder.indexOf(right) : null;
    const graded = !(q?.kind === "short_answer" && a.mode === "exam");
    const isCorrect = q?.kind === "single_choice"
      ? i.choice === null ? null : i.choice === correctChoice
      : a.mode === "practice" ? i.selfMark : null;
    return { ...i, correctChoice: correctChoice !== null && correctChoice >= 0 ? correctChoice : null, graded, isCorrect };
  });
  const gradedItems = items.filter((i) => i.graded);
  const c = gradedItems.filter((i) => i.isCorrect === true).length;
  const w = gradedItems.filter((i) => i.isCorrect === false).length;
  const b = gradedItems.filter((i) => i.isCorrect === null).length;
  const { modifiedCount } = await ctx.c.attempts.updateOne(
    { _id: a._id, status: "in_progress" },
    {
      $set: {
        items,
        status: "finished",
        holder: null,
        correctCount: c,
        wrongCount: w,
        blankCount: b,
        score: c + w + b === 0 ? null : Math.round((1000 * c) / (c + w + b)) / 10,
        finishedAt: ctx.now,
      },
    },
  );
  if (!modifiedCount) return;
  // Its right single-choice answers count (a self-marked short answer doesn't), once a day each.
  const day = today(ctx.now);
  for (const i of items) {
    if (!i.isCorrect || !i.optionOrder) continue;
    try {
      await ctx.c.examCorrect.insertOne({ userId: a.userId, questionId: i.questionId, day });
      await addPoints(ctx.c, a.userId, "exam", POINTS.exam, day);
    } catch (e) {
      if (!isDuplicate(e)) throw e;
    }
  }
  await markStudyDay(ctx.c, a.userId);
}

/** Questions as the student sees them in this attempt: options in the attempt's order, keys only when `withKeys`. */
async function attemptQuestions(ctx: Ctx, a: AttemptDoc, withKeys: boolean) {
  const questions = await ctx.c.questions.find({ _id: { $in: a.items.map((i) => i.questionId) } }).toArray();
  const byId = new Map(questions.map((q) => [q._id, q]));
  return [...a.items].sort((x, y) => x.position - y.position).flatMap((i) => {
    const q = byId.get(i.questionId);
    if (!q) return [];
    const options = i.optionOrder ? i.optionOrder.flatMap((p) => (q.options[p] ? [{ text: q.options[p].text, image: q.options[p].image }] : [])) : null;
    const right = correctIndex(q);
    return [{
      id: q._id,
      type: q.kind,
      subject: q.subject,
      stem: q.stem,
      stem_image: q.stemImage,
      stem_image_alt: q.stemImageAlt,
      revision: q.revision,
      options: options?.length ? options : null,
      ...(withKeys
        ? {
            correct: i.optionOrder && right !== null ? i.optionOrder.indexOf(right) : null,
            accepted_answers: acceptedAnswers(q),
            explanation: q.explanation,
          }
        : {}),
    }];
  });
}

/** Signed in with an account; finishes the caller's attempts that ran out of time; the one still running, if any. */
export async function beginStart(ctx: Ctx): Promise<string | null> {
  const running = await ctx.c.attempts.find({ userId: ctx.caller.userId, status: "in_progress" }).toArray();
  for (const r of running) if (expired(r, ctx.now)) await finishAttempt(ctx, r, null);
  return (await ctx.c.attempts.findOne({ userId: ctx.caller.userId, status: "in_progress" }, { projection: { _id: 1 } }))?._id ?? null;
}

/** Freezes a list of questions into a new attempt; another start that got there first wins. */
export async function createAttempt(
  ctx: Ctx,
  fields: { packageId: string | null; title: string | null; mode: Mode; timeLimitMinutes: number | null; holder: string | null },
  questions: QuestionDoc[],
): Promise<{ attempt_id: string; resumed: boolean }> {
  const doc: AttemptDoc = {
    _id: randomUUID(),
    userId: ctx.caller.userId,
    ...fields,
    tabLeaves: 0,
    status: "in_progress",
    score: null,
    correctCount: null,
    wrongCount: null,
    blankCount: null,
    startedAt: ctx.now,
    finishedAt: null,
    items: questions.map((q, i) => ({
      position: i + 1,
      questionId: q._id,
      revision: q.revision,
      optionOrder: q.kind === "single_choice" ? shuffled(q.options.map((_, p) => p)) : null,
      choice: null,
      answerText: null,
      selfMark: null,
      flagged: false,
      correctChoice: null,
      isCorrect: null,
      graded: null,
    })),
  };
  try {
    await ctx.c.attempts.insertOne(doc);
    return { attempt_id: doc._id, resumed: false };
  } catch (e) {
    // Two clicks at once: one attempt per student, so the other start made it.
    if (!isDuplicate(e)) throw e;
    const running = await ctx.c.attempts.findOne({ userId: ctx.caller.userId, status: "in_progress" }, { projection: { _id: 1 } });
    if (!running) throw e;
    return { attempt_id: running._id, resumed: true };
  }
}

export const holderArg = (args: Args) => {
  const h = text(args, "p_holder");
  if (h !== null && !/^[0-9A-Za-z-]{8,64}$/.test(h)) throw refuse("bad_holder");
  return h;
};

/** Starts an attempt on a published package of the student's class, or returns the attempt already running. */
export async function startAttempt(ctx: Ctx, args: Args) {
  const running = await beginStart(ctx);
  if (running) return { attempt_id: running, resumed: true };
  const pkg = await ctx.c.packages.findOne({ _id: text(args, "p_package_id") ?? "", status: "published", deletedAt: null });
  if (!pkg || !trackVisible(ctx, pkg.track)) throw refuse("package_not_found");
  const questions = await liveQuestions(ctx, pkg.questionIds);
  // Question order is shuffled for each attempt (and option order, in createAttempt).
  const all = shuffled(pkg.questionIds.flatMap((id) => (questions.has(id) ? [questions.get(id) as QuestionDoc] : [])));
  if (!all.length) throw refuse("package_empty");
  // A practice can be shortened and timed by the student; an exam always runs as the package says.
  let picked = all;
  let minutes = pkg.timeLimitMinutes;
  if (pkg.mode === "practice") {
    const count = int(args, "p_count");
    if (count !== null && count < 1) throw refuse("bad_count");
    if (count !== null) picked = all.slice(0, count);
    const own = int(args, "p_time_limit_minutes");
    if (own !== null && (own < 1 || own > 300)) throw refuse("bad_time_limit");
    if (args.p_time_limit_minutes !== undefined) minutes = own;
  }
  return createAttempt(ctx, { packageId: pkg._id, title: null, mode: pkg.mode, timeLimitMinutes: minutes, holder: holderArg(args) }, picked);
}

async function ownAttempt(ctx: Ctx, args: Args): Promise<AttemptDoc> {
  const a = await ctx.c.attempts.findOne({ _id: text(args, "p_attempt_id") ?? "", userId: ctx.caller.userId });
  if (!a) throw refuse("attempt_not_found");
  return a;
}

/** Everything a tab needs to show an in-progress attempt; a finished one returns only its status. */
export async function getAttempt(ctx: Ctx, args: Args) {
  let a = await ownAttempt(ctx, args);
  const holder = holderArg(args);
  if (a.status === "in_progress" && expired(a, ctx.now)) {
    await finishAttempt(ctx, a, null);
    a = (await ctx.c.attempts.findOne({ _id: a._id })) as AttemptDoc;
  }
  if (a.status !== "in_progress") return { id: a._id, status: a.status };
  if (a.holder === null && holder !== null) {
    await ctx.c.attempts.updateOne({ _id: a._id, holder: null }, { $set: { holder } });
    a.holder = holder;
  }
  const holderState = a.holder === null ? "free" : a.holder === holder ? "you" : "other";
  const end = deadline(a);
  const title = a.title ?? (a.packageId ? (await ctx.c.packages.findOne({ _id: a.packageId }, { projection: { title: 1 } }))?.title : null) ?? "";
  return {
    id: a._id,
    status: a.status,
    mode: a.mode,
    package_id: a.packageId,
    title,
    holder_state: holderState,
    seconds_left: end === null ? null : Math.max(0, Math.floor((end - ctx.now.getTime()) / 1000)),
    answers: attemptAnswers(a),
    flagged: [...a.items].sort((x, y) => x.position - y.position).filter((i) => i.flagged).map((i) => i.questionId),
    tab_leaves: a.tabLeaves,
    // Only the holding tab gets the questions; another tab shows "continue here" instead.
    questions: holderState === "other" ? null : await attemptQuestions(ctx, a, a.mode === "practice"),
  };
}

export async function saveAttempt(ctx: Ctx, args: Args): Promise<null> {
  const a = await ownAttempt(ctx, args).catch(() => null);
  if (!a || a.status !== "in_progress") throw refuse("attempt_not_running");
  if (expired(a, ctx.now)) throw refuse("time_up");
  const holder = holderArg(args);
  if (a.holder !== null && a.holder !== holder) throw refuse("held_elsewhere");
  const items = applyAnswers(a.items, args.p_answers, list(args, "p_flagged", isString));
  const leaves = int(args, "p_tab_leaves") ?? 0;
  const { matchedCount } = await ctx.c.attempts.updateOne(
    { _id: a._id, status: "in_progress", holder: a.holder },
    // Leaving the tab only counts up.
    { $set: { items, holder: a.holder ?? holder, tabLeaves: Math.max(a.tabLeaves, leaves) } },
  );
  if (!matchedCount) throw refuse("held_elsewhere");
  return null;
}

/** "Continue here": always allowed for the attempt's owner, so a dead laptop can't lock them out. */
export async function takeOverAttempt(ctx: Ctx, args: Args): Promise<null> {
  const holder = holderArg(args);
  if (!holder) throw refuse("holder_required");
  await ctx.c.attempts.updateOne({ _id: text(args, "p_attempt_id") ?? "", userId: ctx.caller.userId, status: "in_progress" }, { $set: { holder } });
  return null;
}

export async function submitAttempt(ctx: Ctx, args: Args): Promise<null> {
  const a = await ownAttempt(ctx, args);
  if (a.status !== "in_progress") return null;
  const holder = holderArg(args);
  if (a.holder !== null && a.holder !== holder) throw refuse("held_elsewhere");
  await finishAttempt(ctx, a, args.p_answers ?? null);
  return null;
}

/** Practice attempts can be thrown away; exams can only be submitted. */
export async function abandonAttempt(ctx: Ctx, args: Args): Promise<null> {
  const { modifiedCount } = await ctx.c.attempts.updateOne(
    { _id: text(args, "p_attempt_id") ?? "", userId: ctx.caller.userId, status: "in_progress", mode: "practice" },
    { $set: { status: "abandoned", holder: null, finishedAt: ctx.now } },
  );
  if (!modifiedCount) throw refuse("cannot_abandon");
  return null;
}

/** A finished attempt with its questions and keys, for the result page (owner or admin). */
export async function getAttemptResult(ctx: Ctx, args: Args) {
  const id = text(args, "p_attempt_id") ?? "";
  const a = await ctx.c.attempts.findOne(isAdmin(ctx) ? { _id: id } : { _id: id, userId: ctx.caller.userId });
  if (!a) throw refuse("attempt_not_found");
  if (a.status !== "finished") throw refuse("attempt_not_finished");
  const items = [...a.items].sort((x, y) => x.position - y.position);
  const title = a.title ?? (a.packageId ? (await ctx.c.packages.findOne({ _id: a.packageId }, { projection: { title: 1 } }))?.title : null) ?? "";
  return {
    id: a._id,
    mode: a.mode,
    package_id: a.packageId,
    title,
    score: a.score,
    correct_count: a.correctCount,
    wrong_count: a.wrongCount,
    blank_count: a.blankCount,
    tab_leaves: a.tabLeaves,
    started_at: a.startedAt.toISOString(),
    finished_at: a.finishedAt?.toISOString() ?? null,
    items: items.map((i) => ({
      question_id: i.questionId,
      chosen: i.choice,
      text: i.answerText,
      correct: i.correctChoice,
      is_correct: i.isCorrect,
      graded: i.graded,
    })),
    question_revisions: Object.fromEntries(items.map((i) => [i.questionId, i.revision])),
    questions: await attemptQuestions(ctx, a, true),
  };
}

/** The caller's attempts, newest first. */
export async function myAttempts(ctx: Ctx) {
  const rows = await ctx.c.attempts
    .find({ userId: ctx.caller.userId }, { projection: { items: 0 } })
    .sort({ startedAt: -1 })
    .limit(500)
    .toArray();
  return rows.map((a) => ({
    id: a._id,
    package_id: a.packageId,
    title: a.title,
    mode: a.mode,
    status: a.status,
    score: a.score,
    correct_count: a.correctCount,
    wrong_count: a.wrongCount,
    blank_count: a.blankCount,
    time_limit_minutes: a.timeLimitMinutes,
    started_at: a.startedAt.toISOString(),
    finished_at: a.finishedAt?.toISOString() ?? null,
  }));
}
