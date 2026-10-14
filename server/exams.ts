import { randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import {
  audit,
  blankToNull,
  bool,
  int,
  isAdmin,
  isInt,
  isString,
  list,
  refuse,
  requireAdmin,
  text,
  track,
  trackVisible,
  type Args,
  type Ctx,
} from "./context.js";
import { isDuplicate, today, type AttemptDoc, type AttemptItem, type Mode, type PackageDoc, type QuestionDoc, type QuestionKind, type QuestionOption } from "./db.js";
import { addPoints, markStudyDay, POINTS } from "./study.js";

// The question bank, packages and attempts: taking a past paper as a timed exam or as practice,
// practice drawn from the bank, and bookmarks.
//
// A package is a fixed, ordered set of questions taken as an exam (timed, keys hidden until the
// end, best score kept) or as practice (instant feedback). A package with a track is only for
// that class; null means both. Rules kept here, never trusted to the browser:
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
// - Only questions in a published practice package the student can see are in the practice bank,
//   so drilling never reveals a key an exam-only package keeps hidden.

const GRACE_SECONDS = 5;

// ---------------------------------------------------------------------------------------------
// Questions

const optionsJson = (q: QuestionDoc) => (q.options.length ? q.options.map((o) => ({ text: o.text, image: o.image })) : null);
const correctIndex = (q: QuestionDoc) => {
  const i = q.options.findIndex((o) => o.isCorrect);
  return i < 0 ? null : i;
};
const acceptedAnswers = (q: QuestionDoc) => (q.accepted.length ? q.accepted : null);

/** Checks a question's content in the import/edit shape and returns it as stored. */
function questionContent(kind: QuestionKind, options: unknown, correct: unknown, accepted: unknown): { options: QuestionOption[]; accepted: string[] } {
  if (kind === "single_choice") {
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) throw refuse("bad_options");
    if (!isInt(correct) || correct < 0 || correct >= options.length) throw refuse("bad_correct_index");
    return {
      options: options.map((o, i) => {
        const v = (o ?? {}) as { text?: unknown; image?: unknown };
        return { text: typeof v.text === "string" ? v.text : "", image: typeof v.image === "string" && v.image ? v.image : null, isCorrect: i === correct };
      }),
      accepted: [],
    };
  }
  const list = Array.isArray(accepted) ? accepted.filter(isString).map((a) => a.trim()).filter(Boolean) : [];
  if (!list.length) throw refuse("bad_accepted_answers");
  return { options: [], accepted: list };
}

async function liveQuestions(ctx: Ctx, ids: readonly string[]): Promise<Map<string, QuestionDoc>> {
  const docs = await ctx.c.questions.find({ _id: { $in: [...ids] }, deletedAt: null }).toArray();
  return new Map(docs.map((d) => [d._id, d]));
}

/** Changes a question's content. The revision goes up when anything a student sees changes. */
export async function adminUpdateQuestion(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_question_id") ?? "";
  const patch = (args.p_patch ?? {}) as Record<string, unknown>;
  const q = await ctx.c.questions.findOne({ _id: id, deletedAt: null });
  if (!q) throw refuse("question_not_found");
  const has = (k: string) => Object.hasOwn(patch, k);
  const str = (k: string) => (typeof patch[k] === "string" ? (patch[k] as string) : null);
  const next: Partial<QuestionDoc> = {};
  if (has("subject")) next.subject = blankToNull(str("subject"));
  if (has("stem")) {
    const stem = str("stem");
    if (!stem?.trim()) throw refuse("bad_stem");
    next.stem = stem;
  }
  if (has("stem_image")) next.stemImage = str("stem_image") || null;
  if (has("stem_image_alt")) next.stemImageAlt = str("stem_image_alt") || null;
  if (has("explanation")) next.explanation = str("explanation") || null;
  if (has("options") || has("correct_index") || has("accepted_answers")) {
    Object.assign(next, questionContent(
      q.kind,
      has("options") ? patch.options : optionsJson(q),
      has("correct_index") ? patch.correct_index : correctIndex(q),
      has("accepted_answers") ? patch.accepted_answers : q.accepted,
    ));
  }
  const after = { ...q, ...next };
  const seen = (d: QuestionDoc) => JSON.stringify([d.stem, d.stemImage, d.stemImageAlt, d.explanation, d.options, d.accepted]);
  const changed = seen(after) !== seen(q);
  await ctx.c.questions.updateOne({ _id: id }, { $set: { ...next, updatedAt: ctx.now }, ...(changed ? { $inc: { revision: 1 } } : {}) });
  if (changed) await audit(ctx, "question.edit", id);
  return null;
}

/** Takes a question out of every package; attempts that already used it keep it. */
export async function adminDeleteQuestion(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_question_id") ?? "";
  const { modifiedCount } = await ctx.c.questions.updateOne({ _id: id, deletedAt: null }, { $set: { deletedAt: ctx.now } });
  if (!modifiedCount) throw refuse("question_not_found");
  await audit(ctx, "question.delete", id);
  return null;
}

/** Brings a deleted question back (as it was; it is in the packages that still list it). */
export async function adminRestoreQuestion(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_question_id") ?? "";
  const { modifiedCount } = await ctx.c.questions.updateOne({ _id: id, deletedAt: { $ne: null } }, { $set: { deletedAt: null, updatedAt: ctx.now } });
  if (!modifiedCount) throw refuse("question_not_found");
  await audit(ctx, "question.restore", id);
  return null;
}

const BLOCK_RE = /^[0-9]+\.[0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id the admin page made once for its form, so a retry (a lost answer, a double click) is
 * recognised and refused instead of saving twice. Without one, the server makes a new id.
 */
function formId(args: Args, name: string): string {
  const given = text(args, name);
  if (given === null) return randomUUID();
  if (!UUID_RE.test(given)) throw refuse("bad_id");
  return given.toLowerCase();
}

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

/** Saves an imported Markdown file and its questions (as drafts) in one step. Returns the import id. */
export async function adminImportQuestions(ctx: Ctx, args: Args): Promise<string> {
  requireAdmin(ctx);
  const title = text(args, "p_title")?.trim() ?? "";
  const sourceText = text(args, "p_source_text") ?? "";
  const questions = args.p_questions;
  if (!title || title.length > 200) throw refuse("bad_title");
  if (!Array.isArray(questions) || questions.length === 0) throw refuse("no_questions");
  const importId = formId(args, "p_import_id");
  if (await ctx.c.imports.findOne({ _id: importId }, { projection: { _id: 1 } })) throw refuse("already_saved", 409);
  const docs: QuestionDoc[] = questions.map((raw, i) => {
    const x = (raw ?? {}) as Record<string, unknown>;
    const kind = x.type === "single_choice" || x.type === "short_answer" ? x.type : null;
    if (!kind) throw refuse("bad_type");
    if (typeof x.block !== "string" || !BLOCK_RE.test(x.block)) throw refuse("bad_block");
    if (typeof x.stem !== "string" || !x.stem.trim()) throw refuse("bad_stem");
    const year = x.year === null || x.year === undefined ? null : Number(x.year);
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) throw refuse("bad_year");
    const s = (k: string) => (typeof x[k] === "string" && x[k] ? (x[k] as string) : null);
    return {
      _id: randomUUID(),
      block: x.block,
      source: s("source"),
      year,
      subject: s("subject"),
      kind,
      stem: x.stem,
      stemImage: s("stem_image"),
      stemImageAlt: s("stem_image_alt"),
      explanation: s("explanation"),
      revision: 1,
      status: "draft",
      ...questionContent(kind, x.options, x.correct_index, x.accepted_answers),
      importId,
      importPosition: i + 1,
      createdBy: ctx.caller.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
    };
  });
  try {
    await ctx.c.imports.insertOne({ _id: importId, title, sourceText, createdBy: ctx.caller.userId, createdAt: ctx.now });
  } catch (e) {
    if (isDuplicateKey(e)) throw refuse("already_saved", 409);
    throw e;
  }
  await ctx.c.questions.insertMany(docs);
  await audit(ctx, "questions.import", importId, { title, questions: docs.length });
  return importId;
}

/** The blocks, sources, years and subjects in the bank, for the filters on Admin → Questions. */
export async function adminQuestionFacets(ctx: Ctx): Promise<{ blocks: string[]; sources: string[]; years: number[]; subjects: string[] }> {
  requireAdmin(ctx);
  const live = { deletedAt: null };
  const [blocks, sources, years, subjects] = await Promise.all([
    ctx.c.questions.distinct("block", live),
    ctx.c.questions.distinct("source", live),
    ctx.c.questions.distinct("year", live),
    ctx.c.questions.distinct("subject", live),
  ]);
  const notNull = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
  return { blocks, sources: notNull(sources), years: notNull(years), subjects: notNull(subjects) };
}

const adminQuestionRow = (q: QuestionDoc) => ({
  id: q._id,
  type: q.kind,
  subject: q.subject,
  stem: q.stem,
  stem_image: q.stemImage,
  stem_image_alt: q.stemImageAlt,
  options: optionsJson(q),
  correct_index: correctIndex(q),
  accepted_answers: acceptedAnswers(q),
  explanation: q.explanation,
  revision: q.revision,
  status: q.status,
  deleted: q.deletedAt !== null,
});

/** Questions matching every filter given, newest import first, with the live packages using each. */
export async function adminSearchQuestions(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  // Only deleted questions when asked, otherwise only live ones.
  const filter: Filter<QuestionDoc> = bool(args, "p_deleted") ? { deletedAt: { $ne: null } } : { deletedAt: null };
  const block = text(args, "p_block");
  const source = text(args, "p_source");
  const year = int(args, "p_year");
  const subject = text(args, "p_subject");
  const search = text(args, "p_text")?.trim();
  const status = text(args, "p_status");
  if (status === "draft" || status === "published") filter.status = status;
  if (block) filter.block = block;
  if (source) filter.source = source;
  if (year) filter.year = year;
  if (subject) filter.subject = subject;
  if (search) filter.stem = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const skip = Math.max(0, Math.min(100_000, int(args, "p_skip") ?? 0));
  const rows = await ctx.c.questions.find(filter).sort({ createdAt: -1, importPosition: 1, _id: 1 }).skip(skip).limit(100).toArray();
  const packages = await ctx.c.packages
    .find({ questionIds: { $in: rows.map((q) => q._id) }, deletedAt: null }, { projection: { title: 1, questionIds: 1 } })
    .toArray();
  return rows.map((q) => ({
    ...adminQuestionRow(q),
    block: q.block,
    source: q.source,
    year: q.year,
    created_at: q.createdAt.toISOString(),
    updated_at: q.updatedAt.toISOString(),
    packages: packages.filter((p) => p.questionIds.includes(q._id)).map((p) => p.title).sort(),
  }));
}

// ---------------------------------------------------------------------------------------------
// Packages

async function questionCounts(ctx: Ctx, packages: PackageDoc[]): Promise<Map<string, number>> {
  const ids = [...new Set(packages.flatMap((p) => p.questionIds))];
  const live = new Set((await ctx.c.questions.find({ _id: { $in: ids }, deletedAt: null }, { projection: { _id: 1 } }).toArray()).map((q) => q._id));
  return new Map(packages.map((p) => [p._id, p.questionIds.filter((id) => live.has(id)).length]));
}

/**
 * Packages with how many live questions each has: the published ones of the caller's class, and
 * for admins all of them, drafts included.
 */
export async function packageSummaries(ctx: Ctx) {
  const all = await ctx.c.packages.find({ deletedAt: null }).sort({ title: 1 }).toArray();
  const visible = all.filter((p) => isAdmin(ctx) || (p.status === "published" && trackVisible(ctx, p.track)));
  const counts = await questionCounts(ctx, visible);
  return visible.map((p) => ({
    id: p._id,
    title: p.title,
    block: p.block,
    source: p.source,
    year: p.year,
    mode: p.mode,
    time_limit_minutes: p.timeLimitMinutes,
    track_best: p.trackBest,
    status: p.status,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    question_count: counts.get(p._id) ?? 0,
    track: p.track,
  }));
}

/** A package's questions in order, for Admin → Packages. */
export async function adminPackageQuestions(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  const pkg = await ctx.c.packages.findOne({ _id: text(args, "p_package_id") ?? "" });
  if (!pkg) return [];
  const questions = await liveQuestions(ctx, pkg.questionIds);
  return pkg.questionIds.flatMap((id, i) => {
    const q = questions.get(id);
    return q ? [{ package_id: pkg._id, position: i + 1, ...adminQuestionRow(q) }] : [];
  });
}

/** Makes an exam package and a practice package from one import's questions, both as drafts. */
export async function adminPackagesFromImport(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  const importId = text(args, "p_import_id") ?? "";
  const block = text(args, "p_block");
  if (block !== null && !BLOCK_RE.test(block)) throw refuse("bad_block");
  const minutes = int(args, "p_time_limit_minutes");
  if (minutes === null || minutes < 1 || minutes > 300) throw refuse("bad_time_limit");
  const questions = await ctx.c.questions.find({ importId, deletedAt: null }).sort({ importPosition: 1, _id: 1 }).toArray();
  if (!questions.length) throw refuse("import_has_no_questions");
  const base = {
    block,
    source: text(args, "p_source"),
    year: int(args, "p_year"),
    track: null,
    status: "draft" as const,
    questionIds: questions.map((q) => q._id),
    createdBy: ctx.caller.userId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };
  const title = (name: string) => {
    const t = text(args, name)?.trim() ?? "";
    if (!t || t.length > 160) throw refuse("bad_title");
    return t;
  };
  const exam: PackageDoc = { ...base, _id: formId(args, "p_exam_id"), title: title("p_exam_title"), mode: "exam", timeLimitMinutes: minutes, trackBest: bool(args, "p_track_best") ?? true };
  const practice: PackageDoc = { ...base, _id: formId(args, "p_practice_id"), title: title("p_practice_title"), mode: "practice", timeLimitMinutes: null, trackBest: false };
  if (exam._id === practice._id) throw refuse("bad_id");
  if (await ctx.c.packages.countDocuments({ _id: { $in: [exam._id, practice._id] } })) throw refuse("already_saved", 409);
  try {
    await ctx.c.packages.insertMany([exam, practice]);
  } catch (e) {
    if (isDuplicateKey(e)) throw refuse("already_saved", 409);
    throw e;
  }
  await audit(ctx, "packages.create", importId, { exam: exam._id, practice: practice._id });
  return { exam_id: exam._id, practice_id: practice._id, question_count: questions.length };
}

/**
 * Earlier imports, newest first: when, how many questions are still there, the block, type and
 * year they carry, and how many live packages use them, so packages can be made from one later.
 */
export async function adminImports(ctx: Ctx) {
  requireAdmin(ctx);
  const imports = await ctx.c.imports.find({}, { projection: { sourceText: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
  const ids = imports.map((i) => i._id);
  const questions = await ctx.c.questions
    .find({ importId: { $in: ids }, deletedAt: null }, { projection: { _id: 1, importId: 1, block: 1, source: 1, year: 1 } })
    .toArray();
  const byImport = new Map<string, typeof questions>();
  for (const q of questions) byImport.set(q.importId ?? "", [...(byImport.get(q.importId ?? "") ?? []), q]);
  const packages = await ctx.c.packages.find({ deletedAt: null, questionIds: { $in: questions.map((q) => q._id) } }, { projection: { questionIds: 1 } }).toArray();
  return imports.map((i) => {
    const qs = byImport.get(i._id) ?? [];
    const mine = new Set(qs.map((q) => q._id));
    return {
      id: i._id,
      title: i.title,
      created_at: i.createdAt.toISOString(),
      question_count: qs.length,
      block: qs[0]?.block ?? null,
      source: qs[0]?.source ?? null,
      year: qs[0]?.year ?? null,
      package_count: packages.filter((p) => p.questionIds.some((id) => mine.has(id))).length,
    };
  });
}

/** Publishing a package publishes its questions too; unpublishing leaves them (another package may use them). */
export async function adminSetPackageStatus(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_package_id") ?? "";
  const status = text(args, "p_status");
  if (status !== "draft" && status !== "published") throw refuse("bad_status");
  const pkg = await ctx.c.packages.findOne({ _id: id, deletedAt: null });
  if (!pkg) throw refuse("package_not_found");
  if (status === "published" && (await liveQuestions(ctx, pkg.questionIds)).size === 0) throw refuse("package_empty");
  await ctx.c.packages.updateOne({ _id: id }, { $set: { status, updatedAt: ctx.now } });
  if (status === "published") await ctx.c.questions.updateMany({ _id: { $in: pkg.questionIds }, status: "draft" }, { $set: { status: "published" } });
  await audit(ctx, `package.${status}`, id);
  return null;
}

/** Changes a package's settings. p_patch: any of { title, time_limit_minutes, track_best, track }. */
export async function adminUpdatePackage(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_package_id") ?? "";
  const patch = (args.p_patch ?? {}) as Record<string, unknown>;
  const pkg = await ctx.c.packages.findOne({ _id: id, deletedAt: null });
  if (!pkg) throw refuse("package_not_found");
  const set: Partial<PackageDoc> = {};
  if (Object.hasOwn(patch, "title")) {
    const title = typeof patch.title === "string" ? patch.title.trim() : "";
    if (!title || title.length > 160) throw refuse("bad_title");
    set.title = title;
  }
  if (Object.hasOwn(patch, "time_limit_minutes")) {
    const m = patch.time_limit_minutes;
    if (m !== null && (!isInt(m) || m < 1 || m > 300)) throw refuse("bad_time_limit");
    set.timeLimitMinutes = m as number | null;
  }
  if (Object.hasOwn(patch, "track_best")) set.trackBest = patch.track_best === true;
  if (Object.hasOwn(patch, "track")) set.track = track(patch.track);
  const after = { ...pkg, ...set };
  if (after.mode === "exam" && after.timeLimitMinutes === null) throw refuse("exam_needs_time_limit");
  if (after.trackBest && after.mode !== "exam") throw refuse("best_only_for_exams");
  await ctx.c.packages.updateOne({ _id: id }, { $set: { ...set, updatedAt: ctx.now } });
  await audit(ctx, "package.edit", id, patch);
  return null;
}

/** Removes a package from lists; attempts on it keep their questions and results. */
export async function adminDeletePackage(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_package_id") ?? "";
  const { modifiedCount } = await ctx.c.packages.updateOne({ _id: id, deletedAt: null }, { $set: { deletedAt: ctx.now, status: "draft" } });
  if (!modifiedCount) throw refuse("package_not_found");
  await audit(ctx, "package.delete", id);
  return null;
}

/** Deleted packages (newest change first), for Admin → Packages → Show deleted. */
export async function adminDeletedPackages(ctx: Ctx) {
  requireAdmin(ctx);
  const deleted = await ctx.c.packages.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).toArray();
  const counts = await questionCounts(ctx, deleted);
  return deleted.map((p) => ({
    id: p._id,
    title: p.title,
    block: p.block,
    source: p.source,
    year: p.year,
    mode: p.mode,
    time_limit_minutes: p.timeLimitMinutes,
    track_best: p.trackBest,
    status: p.status,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    question_count: counts.get(p._id) ?? 0,
    track: p.track,
  }));
}

/** Brings a deleted package back as a draft. */
export async function adminRestorePackage(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_package_id") ?? "";
  const { modifiedCount } = await ctx.c.packages.updateOne({ _id: id, deletedAt: { $ne: null } }, { $set: { deletedAt: null, status: "draft", updatedAt: ctx.now } });
  if (!modifiedCount) throw refuse("package_not_found");
  await audit(ctx, "package.restore", id);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Attempts

const deadline = (a: AttemptDoc) => (a.timeLimitMinutes === null ? null : a.startedAt.getTime() + a.timeLimitMinutes * 60_000);
const expired = (a: AttemptDoc, now: Date) => {
  const d = deadline(a);
  return d !== null && now.getTime() > d + GRACE_SECONDS * 1000;
};

function shuffled<T>(xs: readonly T[]): T[] {
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
async function beginStart(ctx: Ctx): Promise<string | null> {
  const running = await ctx.c.attempts.find({ userId: ctx.caller.userId, status: "in_progress" }).toArray();
  for (const r of running) if (expired(r, ctx.now)) await finishAttempt(ctx, r, null);
  return (await ctx.c.attempts.findOne({ userId: ctx.caller.userId, status: "in_progress" }, { projection: { _id: 1 } }))?._id ?? null;
}

/** Freezes a list of questions into a new attempt; another start that got there first wins. */
async function createAttempt(
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

const holderArg = (args: Args) => {
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

// ---------------------------------------------------------------------------------------------
// Practice from the bank, and bookmarks

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
