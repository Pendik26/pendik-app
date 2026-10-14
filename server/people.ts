import type { Auth } from "./auth.js";
import { firstPassword, parseAccountAction, studentEmail } from "./accounts.js";
import { audit, blankToNull, refuse, requireAdmin, section, sectionFor, text, track, type Args, type Ctx } from "./context.js";
import { daysBefore, today, type Collections, type Role, type StudentDoc, type Track } from "./db.js";
import { POINTS, streak } from "./study.js";

// People: the roster (students), the sign-in accounts of activated students, a student's own
// settings, the leaderboard and class readiness, and the admin's tools for them.

// ---------------------------------------------------------------------------------------------
// The signed-in student

export function myAccount(ctx: Ctx) {
  const { account: a, student: s } = ctx.caller;
  return {
    id: a._id,
    student_id: a.nim,
    full_name: s.fullName,
    class_group: s.classGroup,
    class_section: sectionFor(s.track, s.classSection, s.classGroup),
    cohort: s.cohort,
    track: s.track,
    role: a.role,
    must_change_password: a.mustChangePassword,
    leaderboard_joined: a.leaderboardJoined,
  };
}

/** The student's own settings: only the leaderboard opt-in. Name, student id, class and role are not theirs to change. */
export async function updateMySettings(ctx: Ctx, args: Args): Promise<null> {
  const joined = args.p_leaderboard_joined;
  if (joined !== null && joined !== undefined && typeof joined !== "boolean") throw refuse("bad_leaderboard_joined");
  await ctx.c.accounts.updateOne(
    { _id: ctx.caller.userId },
    { $set: { ...(typeof joined === "boolean" ? { leaderboardJoined: joined } : {}), updatedAt: ctx.now } },
  );
  return null;
}

/** Called after the student has set a new password. */
export async function passwordChanged(ctx: Ctx): Promise<null> {
  await ctx.c.accounts.updateOne({ _id: ctx.caller.userId }, { $set: { mustChangePassword: false, updatedAt: ctx.now } });
  return null;
}

// ---------------------------------------------------------------------------------------------
// Leaderboard and class readiness

/**
 * The board: students who joined, ranked by this week's points, all-time points or current study
 * streak; ties share a rank. Also the caller's own numbers, joined or not.
 */
export async function leaderboard(ctx: Ctx, args: Args) {
  const period = text(args, "p_period") ?? "week";
  if (period !== "week" && period !== "all" && period !== "streak") throw refuse("bad_period");
  const cohortOnly = args.p_my_cohort_only === true;
  const me = ctx.caller;
  const day = today(ctx.now);
  const weekStart = daysBefore(day, 6);

  const accounts = await ctx.c.accounts.find({ $or: [{ leaderboardJoined: true }, { _id: me.userId }] }).toArray();
  const students = new Map((await ctx.c.students.find({ _id: { $in: accounts.map((a) => a.nim) } }).toArray()).map((s) => [s._id, s]));
  const ids = accounts.map((a) => a._id);
  const [points, days] = await Promise.all([
    ctx.c.points.find({ userId: { $in: ids } }).toArray(),
    ctx.c.studyDays.find({ userId: { $in: ids }, day: { $gte: daysBefore(day, 400) } }, { projection: { userId: 1, day: 1 } }).toArray(),
  ]);

  const rows = accounts.flatMap((a) => {
    const s = students.get(a.nim);
    if (!s) return [];
    const mine = points.filter((p) => p.userId === a._id);
    const sum = (f: (p: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((n, p) => n + p.points, 0);
    const allPoints = sum(() => true);
    const week = sum((p) => p.day >= weekStart);
    const run = streak(days.filter((d) => d.userId === a._id).map((d) => d.day), day);
    return [{
      userId: a._id,
      joined: a.leaderboardJoined,
      name: s.fullName,
      cohort: s.cohort,
      allPoints,
      week,
      streak: run,
      value: period === "week" ? week : period === "all" ? allPoints : run,
      correct: sum((p) => p.source === "quiz" || p.source === "exam"),
      cards: sum((p) => p.source === "cards") / POINTS.cards,
      chapters: sum((p) => p.source === "chapters") / POINTS.chapters,
      studyDays: sum((p) => p.source === "days") / POINTS.days,
    }];
  });

  const ranked = rows
    .filter((r) => r.joined && r.value > 0 && (!cohortOnly || r.cohort === me.student.cohort))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const rankOf = (r: { value: number }) => 1 + ranked.filter((o) => o.value > r.value).length;
  const mine = rows.find((r) => r.userId === me.userId);
  return {
    period,
    cohort: me.student.cohort,
    rows: ranked.slice(0, 100).map((r) => ({ rank: rankOf(r), name: r.name, cohort: r.cohort, value: r.value, me: r.userId === me.userId })),
    total: ranked.length,
    me: mine && {
      joined: mine.joined,
      name: mine.name,
      value: mine.value,
      week: mine.week,
      streak: mine.streak,
      points: mine.allPoints,
      stats: { correct_answers: mine.correct, cards_learned: mine.cards, chapters_finished: mine.chapters, study_days: mine.studyDays },
      rank: ranked.includes(mine) ? rankOf(mine) : null,
    },
  };
}

const BLOCK_RE = /^[0-9]+\.[0-9]+$/;
const MIN_CLASS_SIZE = 3;

/** Saves the student's own readiness for a block (worked out in the app from their study). */
export async function saveReadiness(ctx: Ctx, args: Args): Promise<null> {
  const block = text(args, "p_block") ?? "";
  const value = args.p_value;
  if (!BLOCK_RE.test(block)) throw refuse("bad_block");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw refuse("bad_value");
  await ctx.c.readiness.updateOne(
    { userId: ctx.caller.userId, block },
    { $set: { value: Math.round(value * 10) / 10, updatedAt: ctx.now } },
    { upsert: true },
  );
  return null;
}

/** The cohort's average readiness for a block, shown only once at least 3 classmates have one. */
export async function classReadiness(ctx: Ctx, args: Args) {
  const block = text(args, "p_block") ?? "";
  if (!BLOCK_RE.test(block)) throw refuse("bad_block");
  const cohort = ctx.caller.student.cohort;
  const classmates = await ctx.c.students.find({ cohort }, { projection: { _id: 1 } }).toArray();
  const accounts = await ctx.c.accounts.find({ nim: { $in: classmates.map((s) => s._id) } }, { projection: { _id: 1 } }).toArray();
  const rows = await ctx.c.readiness.find({ block, userId: { $in: accounts.map((a) => a._id) } }).toArray();
  const average = rows.reduce((n, r) => n + r.value, 0) / (rows.length || 1);
  return { cohort, count: rows.length, average: rows.length >= MIN_CLASS_SIZE ? Math.round(average) : null };
}

// ---------------------------------------------------------------------------------------------
// Admin: the roster, accounts, roles and the audit log

const STUDENT_ID = /^[0-9A-Za-z]{3,30}$/;

/** The roster with each student's account state: none (not activated), active or locked. */
export async function adminListRoster(ctx: Ctx, auth: Auth) {
  requireAdmin(ctx);
  const [students, accounts] = await Promise.all([ctx.c.students.find().toArray(), ctx.c.accounts.find().toArray()]);
  const byNim = new Map(accounts.map((a) => [a.nim, a]));
  const context = await auth.$context;
  const googleLinked = new Set<string>();
  for (const a of accounts) {
    const linked = await context.internalAdapter.findAccounts(a._id);
    if (linked.some((l) => l.providerId === "google")) googleLinked.add(a._id);
  }
  const order = (t: Track | null) => (t === null ? 2 : t === "IUP" ? 0 : 1);
  return students
    .sort((a, b) => order(a.track) - order(b.track) || (sectionFor(a.track, a.classSection, a.classGroup) ?? "￿").localeCompare(sectionFor(b.track, b.classSection, b.classGroup) ?? "￿") || (a.classGroup ?? "￿").localeCompare(b.classGroup ?? "￿") || a.fullName.localeCompare(b.fullName))
    .map((s) => {
      const a = byNim.get(s._id);
      return {
        student_id: s._id,
        full_name: s.fullName,
        class_group: s.classGroup,
        class_section: sectionFor(s.track, s.classSection, s.classGroup),
        cohort: s.cohort,
        track: s.track,
        user_id: a?._id ?? null,
        role: a?.role ?? null,
        account: !a ? "none" : a.lockedAt ? "locked" : "active",
        must_change_password: a?.mustChangePassword ?? null,
        google_linked: a ? googleLinked.has(a._id) : false,
      };
    });
}

/** Adds students to the roster; a student already on it is updated. */
export async function adminAddStudents(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const rows = args.p_rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) throw refuse("bad_rows");
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = typeof r.student_id === "string" ? r.student_id.trim() : "";
    const name = typeof r.full_name === "string" ? r.full_name.trim() : "";
    const cohort = (typeof r.cohort === "string" && r.cohort.trim()) || String(ctx.now.getUTCFullYear());
    if (!STUDENT_ID.test(id) || !name || name.length > 120 || !/^[0-9A-Za-z-]{1,10}$/.test(cohort)) throw refuse("bad_rows");
    const group = blankToNull(typeof r.class_group === "string" ? r.class_group : null);
    if (group && group.length > 40) throw refuse("bad_rows");
    const t = track(r.track);
    const existing = await ctx.c.students.findOne({ _id: id });
    if (existing) {
      const finalTrack = t ?? existing.track;
      await ctx.c.students.updateOne({ _id: id }, { $set: { fullName: name, classGroup: group, classSection: sectionFor(finalTrack, r.class_section, group), cohort, track: finalTrack, updatedAt: ctx.now } });
      await audit(ctx, "student.change", id, { cohort, track: t });
    } else {
      await ctx.c.students.insertOne({ _id: id, fullName: name, cohort, track: t, classGroup: group, classSection: sectionFor(t, r.class_section, group), createdAt: ctx.now, updatedAt: ctx.now });
      await audit(ctx, "student.add", id, { cohort, track: t });
    }
  }
  return null;
}

/**
 * Sets the class section (A or B) and tutorial group (and optionally the track) of students already on the roster, by id.
 * Needs no names, so a group list can be applied without pasting anyone's details. Unknown ids
 * are reported, not created.
 */
export async function adminSetGroups(ctx: Ctx, args: Args): Promise<{ updated: number; unknown: string[] }> {
  requireAdmin(ctx);
  const rows = args.p_rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) throw refuse("bad_rows");
  const parsed = rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = typeof r.student_id === "string" ? r.student_id.trim() : "";
    const group = blankToNull(typeof r.class_group === "string" ? r.class_group : null);
    if (!STUDENT_ID.test(id) || (group && group.length > 40)) throw refuse("bad_rows");
    return { id, group, track: r.track === undefined || r.track === null ? undefined : track(r.track), cls: section(r.class_section) };
  });
  const unknown: string[] = [];
  let updated = 0;
  for (const r of parsed) {
    const found = await ctx.c.students.findOne({ _id: r.id });
    if (!found) { unknown.push(r.id); continue; }
    const finalTrack = r.track ?? found.track;
    const set: Partial<StudentDoc> = { classGroup: r.group, classSection: sectionFor(finalTrack, r.cls, r.group), updatedAt: ctx.now };
    if (r.track) set.track = r.track;
    await ctx.c.students.updateOne({ _id: r.id }, { $set: set });
    updated++;
  }
  await audit(ctx, "student.groups", null, { updated });
  return { updated, unknown };
}

/** Moves a student to the other class (the track lives on the roster only). */
export async function adminSetTrack(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_student_id") ?? "";
  const t = track(args.p_track);
  const { matchedCount } = await ctx.c.students.updateOne({ _id: id }, { $set: { track: t, updatedAt: ctx.now } });
  if (!matchedCount) throw refuse("student_not_found");
  await audit(ctx, "student.change", id, { track: t });
  return null;
}

/** Removes a student who has no account yet. */
export async function adminRemoveStudent(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_student_id") ?? "";
  if (await ctx.c.accounts.countDocuments({ nim: id })) throw refuse("student_has_account");
  await ctx.c.students.deleteOne({ _id: id });
  await audit(ctx, "student.remove", id);
  return null;
}

/** Admins can't change their own role, and there must always be at least one admin. */
export async function adminSetRole(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const userId = text(args, "p_user_id") ?? "";
  const role = text(args, "p_role");
  if (role !== "student" && role !== "admin") throw refuse("bad_role");
  if (userId === ctx.caller.userId) throw refuse("not_on_yourself");
  const target = await ctx.c.accounts.findOne({ _id: userId });
  if (!target) throw refuse("no_such_account");
  if (role === "student" && target.role === "admin" && (await ctx.c.accounts.countDocuments({ role: "admin", _id: { $ne: userId } })) === 0) {
    throw refuse("last_admin");
  }
  await ctx.c.accounts.updateOne({ _id: userId }, { $set: { role: role as Role, updatedAt: ctx.now } });
  await audit(ctx, "account.role", userId, { role });
  return null;
}

/** The newest 200 entries of the audit log, with who did it. */
export async function adminAuditLog(ctx: Ctx) {
  requireAdmin(ctx);
  const rows = await ctx.c.auditLog.find().sort({ createdAt: -1 }).limit(200).toArray();
  const actors = await ctx.c.accounts.find({ _id: { $in: [...new Set(rows.flatMap((r) => (r.actor ? [r.actor] : [])))] } }).toArray();
  const students = new Map((await ctx.c.students.find({ _id: { $in: actors.map((a) => a.nim) } }).toArray()).map((s) => [s._id, s.fullName]));
  const names = new Map(actors.map((a) => [a._id, students.get(a.nim) ?? null]));
  return rows.map((r) => ({
    id: String(r._id),
    created_at: r.createdAt.toISOString(),
    actor_name: r.actor ? (names.get(r.actor) ?? null) : null,
    action: r.action,
    target: r.target,
    detail: r.detail,
  }));
}

/** Creates accounts for roster students, or locks, unlocks or resets one; each is audited. */
export async function adminAccounts(ctx: Ctx, auth: Auth, body: unknown) {
  requireAdmin(ctx);
  const action = parseAccountAction(body);
  if (!action) throw refuse("unknown_request");
  const context = await auth.$context;

  if (action.action === "activate") {
    const results: { student_id: string; ok: boolean; message?: string }[] = [];
    for (const id of action.student_ids) {
      const student = await ctx.c.students.findOne({ _id: id });
      if (!student) { results.push({ student_id: id, ok: false, message: "not on the roster" }); continue; }
      if (await ctx.c.accounts.findOne({ nim: id })) { results.push({ student_id: id, ok: true, message: "already active" }); continue; }
      try {
        const user = await context.internalAdapter.createUser({ email: studentEmail(id), name: student.fullName, emailVerified: true }, { method: "admin" });
        await context.internalAdapter.linkAccount({
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: await context.password.hash(firstPassword(id)),
        });
        await ctx.c.accounts.insertOne({
          _id: user.id, nim: id, role: "student", mustChangePassword: true,
          leaderboardJoined: false, lockedAt: null, createdAt: ctx.now, updatedAt: ctx.now,
        });
        await audit(ctx, "account.activate", id);
        results.push({ student_id: id, ok: true });
      } catch (e) {
        results.push({ student_id: id, ok: false, message: e instanceof Error ? e.message : "not created" });
      }
    }
    return { results };
  }

  if (action.user_id === ctx.caller.userId && action.action !== "unlock") throw refuse("not_on_yourself");
  const account = await ctx.c.accounts.findOne({ _id: action.user_id });
  if (!account) throw refuse("no_such_account", 404);
  if (action.action === "reset") {
    await context.internalAdapter.updatePassword(account._id, await context.password.hash(firstPassword(account.nim)));
    await context.internalAdapter.deleteUserSessions(account._id);
    await ctx.c.accounts.updateOne({ _id: account._id }, { $set: { mustChangePassword: true, updatedAt: ctx.now } });
  } else if (action.action === "lock") {
    await ctx.c.accounts.updateOne({ _id: account._id }, { $set: { lockedAt: ctx.now, updatedAt: ctx.now } });
    await context.internalAdapter.deleteUserSessions(account._id);
  } else {
    await ctx.c.accounts.updateOne({ _id: account._id }, { $set: { lockedAt: null, updatedAt: ctx.now } });
  }
  await audit(ctx, `account.${action.action}`, account.nim);
  return { ok: true };
}



/**
 * Makes someone the first admin: puts them on the roster and creates their sign-in and an admin
 * account. Only when the site has no admin yet, so leaving the settings in place later does
 * nothing. The first password is `pendik26` + the student id; the app asks for a new one at once.
 */
export async function ensureFirstAdmin(c: Collections, auth: Auth, who: { nim: string; fullName: string; cohort?: string }): Promise<boolean> {
  if (!STUDENT_ID.test(who.nim) || !who.fullName.trim()) throw new Error("FIRST_ADMIN_NIM and FIRST_ADMIN_NAME are needed");
  if (await c.accounts.countDocuments({ role: "admin" })) return false;
  const now = new Date();
  const cohort = who.cohort?.trim() || String(now.getUTCFullYear());
  await c.students.updateOne(
    { _id: who.nim },
    { $setOnInsert: { fullName: who.fullName.trim(), cohort, track: null, classGroup: null, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  const context = await auth.$context;
  const existing = await c.accounts.findOne({ nim: who.nim });
  if (existing) {
    await c.accounts.updateOne({ _id: existing._id }, { $set: { role: "admin", updatedAt: now } });
    return true;
  }
  const user = await context.internalAdapter.createUser({ email: studentEmail(who.nim), name: who.fullName.trim(), emailVerified: true }, { method: "admin" });
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await context.password.hash(firstPassword(who.nim)),
  });
  await c.accounts.insertOne({
    _id: user.id, nim: who.nim, role: "admin", mustChangePassword: true,
    leaderboardJoined: false, lockedAt: null, createdAt: now, updatedAt: now,
  });
  return true;
}
