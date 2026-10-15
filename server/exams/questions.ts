import { randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import {
  audit,
  blankToNull,
  bool,
  int,
  isInt,
  isString,
  refuse,
  requireAdmin,
  text,
  type Args,
  type Ctx,
} from "../context.js";
import { type QuestionDoc, type QuestionKind, type QuestionOption } from "../db.js";

// The question bank: an admin's view of every question, editing, importing, deleting and restoring.
// A question's content is checked here, and its revision goes up whenever what a student sees changes.
// Rules for packages and attempts are in packages.ts and attempts.ts.

export const optionsJson = (q: QuestionDoc) => (q.options.length ? q.options.map((o) => ({ text: o.text, image: o.image })) : null);
export const correctIndex = (q: QuestionDoc) => {
  const i = q.options.findIndex((o) => o.isCorrect);
  return i < 0 ? null : i;
};
export const acceptedAnswers = (q: QuestionDoc) => (q.accepted.length ? q.accepted : null);

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

export async function liveQuestions(ctx: Ctx, ids: readonly string[]): Promise<Map<string, QuestionDoc>> {
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

export const BLOCK_RE = /^[0-9]+\.[0-9]+$/;

/** A paper's year: four digits, or null for none. */
export function paperYear(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!isInt(value) || value < 1900 || value > 2100) throw refuse("bad_year");
  return value;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id the admin page made once for its form, so a retry (a lost answer, a double click) is
 * recognised and refused instead of saving twice. Without one, the server makes a new id.
 */
export function formId(args: Args, name: string): string {
  const given = text(args, name);
  if (given === null) return randomUUID();
  if (!UUID_RE.test(given)) throw refuse("bad_id");
  return given.toLowerCase();
}

export const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

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

export const adminQuestionRow = (q: QuestionDoc) => ({
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
