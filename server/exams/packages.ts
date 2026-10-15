import {
  audit,
  bool,
  int,
  isAdmin,
  isInt,
  refuse,
  requireAdmin,
  text,
  track,
  trackVisible,
  type Args,
  type Ctx,
} from "../context.js";
import type { PackageDoc } from "../db.js";
import { BLOCK_RE, adminQuestionRow, formId, liveQuestions, isDuplicateKey, paperYear } from "./questions.js";

// Packages: a fixed, ordered set of questions taken as an exam (timed, keys hidden until the end,
// best score kept) or as practice (instant feedback). A package with a track is only for that
// class; null means both. Admins make them from imports, publish, edit and delete them.

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

/**
 * A package's questions in order, for Admin → Packages. Deleted ones are listed too (marked), so an
 * admin sees what students no longer get and can bring a question back.
 */
export async function adminPackageQuestions(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  const pkg = await ctx.c.packages.findOne({ _id: text(args, "p_package_id") ?? "" });
  if (!pkg) return [];
  const docs = await ctx.c.questions.find({ _id: { $in: pkg.questionIds } }).toArray();
  const questions = new Map(docs.map((d) => [d._id, d]));
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
    year: paperYear(args.p_year),
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

/** Changes a package's settings. p_patch: any of { title, time_limit_minutes, track_best, track, block, source, year }. */
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
  if (Object.hasOwn(patch, "block")) {
    const block = typeof patch.block === "string" ? patch.block.trim() : null;
    if (!block || !BLOCK_RE.test(block)) throw refuse("bad_block");
    set.block = block;
  }
  if (Object.hasOwn(patch, "source")) {
    const source = typeof patch.source === "string" ? patch.source.trim() : "";
    if (source.length > 40) throw refuse("bad_source");
    set.source = source || null;
  }
  if (Object.hasOwn(patch, "year")) set.year = paperYear(patch.year);
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
