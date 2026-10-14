import type { LecturerDoc, ScheduleDocDoc, ScheduleEventDoc } from "./db.js";
import { audit, blankToNull, refuse, requireAdmin, text, track, trackVisible, type Args, type Ctx } from "./context.js";

// The timetable: tutorial and skills-lab (SL) sessions per student group, the official lecture
// schedule PDFs, and the lecturer directory (WhatsApp numbers). Everyone signed in reads them;
// admins write them, and any student can flag a wrong number or suggest a lecturer.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^\+\d{8,15}$/;
const MAX_EVENTS_A_CALL = 500;
/** Open notes one student may have waiting, so the admin's list can't be flooded. */
const MAX_OPEN_REPORTS = 5;

/** "0812-3456 789" or "+62 812…" as "+62812…"; null when it can't be a phone number. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) digits = `+62${digits.slice(1)}`;
  else if (!digits.startsWith("+")) digits = `+${digits}`;
  return PHONE_RE.test(digits) ? digits : null;
}

const clip = (v: string | null, max: number): string | null => {
  const t = blankToNull(v);
  if (t && t.length > max) throw refuse("too_long");
  return t;
};

const need = (v: string | null, max: number): string => {
  const t = clip(v, max);
  if (!t) throw refuse("missing_field");
  return t;
};

// ---------------------------------------------------------------------------------------------
// Reading

export async function scheduleEvents(ctx: Ctx) {
  const rows = await ctx.c.scheduleEvents.find().sort({ date: 1, start: 1 }).toArray();
  return rows.map(({ _id, createdAt: _c, updatedAt: _u, ...r }) => ({ id: _id, ...r }));
}

export async function lecturers(ctx: Ctx) {
  const rows = await ctx.c.lecturers.find().sort({ name: 1 }).toArray();
  return rows.map((r) => ({ id: r._id, name: r.name, phones: r.phones }));
}

export async function scheduleDocs(ctx: Ctx) {
  const rows = await ctx.c.scheduleDocs.find().sort({ block: 1, title: 1 }).toArray();
  return rows.filter((r) => trackVisible(ctx, r.track)).map((r) => ({ id: r._id, block: r.block, track: r.track, title: r.title, url: r.url }));
}

/** The student groups that have anything scheduled, for the group picker. */
export async function scheduleGroups(ctx: Ctx) {
  const groups = (await ctx.c.scheduleEvents.distinct("group")) as string[];
  return groups.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

// ---------------------------------------------------------------------------------------------
// Students' notes about the lecturer list

export async function reportLecturer(ctx: Ctx, args: Args): Promise<null> {
  const kind = text(args, "p_kind");
  if (kind !== "wrong_number" && kind !== "new_lecturer") throw refuse("bad_kind");
  const open = await ctx.c.lecturerReports.countDocuments({ userId: ctx.caller.userId, status: "open" });
  if (open >= MAX_OPEN_REPORTS) throw refuse("too_many_reports");

  let lecturerId: string | null = null;
  let name = clip(text(args, "p_name"), 120);
  const phoneRaw = clip(text(args, "p_phone"), 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) throw refuse("bad_phone");

  if (kind === "wrong_number") {
    lecturerId = text(args, "p_lecturer_id");
    const found = lecturerId ? await ctx.c.lecturers.findOne({ _id: lecturerId }) : null;
    if (!found) throw refuse("lecturer_not_found", 404);
    name = found.name;
  } else if (!name) {
    throw refuse("missing_field");
  }

  await ctx.c.lecturerReports.insertOne({
    _id: crypto.randomUUID(), userId: ctx.caller.userId, kind, lecturerId, name, phone,
    note: clip(text(args, "p_note"), 500), status: "open", createdAt: ctx.now,
  });
  return null;
}

// ---------------------------------------------------------------------------------------------
// Admin

/** Adds sessions in one go (the whole term's timetable) or fixes one by passing its id. */
export async function adminSaveEvents(ctx: Ctx, args: Args) {
  requireAdmin(ctx);
  const raw = args.p_events;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS_A_CALL) throw refuse("bad_events");

  const docs: ScheduleEventDoc[] = raw.map((item, i) => {
    const e = (item ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : null);
    const kind = str("kind");
    if (kind !== "tutor" && kind !== "sl") throw refuse(`bad_event_${i + 1}`);
    const date = str("date");
    const start = str("start");
    const end = str("end");
    if (!date || !DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw refuse(`bad_event_${i + 1}`);
    if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end) || end <= start) throw refuse(`bad_event_${i + 1}`);
    return {
      _id: str("id") ?? crypto.randomUUID(),
      kind, group: need(str("group"), 40), block: clip(str("block"), 10), date, start, end,
      code: clip(str("code"), 20), phase: clip(str("phase"), 60), title: need(str("title"), 200),
      subtitle: clip(str("subtitle"), 200), lecturerId: clip(str("lecturerId"), 80),
      cancelledNote: clip(str("cancelledNote"), 200), createdAt: ctx.now, updatedAt: ctx.now,
    };
  });

  await ctx.c.scheduleEvents.bulkWrite(docs.map(({ _id, createdAt, ...rest }) => ({
    updateOne: { filter: { _id }, update: { $set: rest, $setOnInsert: { createdAt } }, upsert: true },
  })), { ordered: false });
  await audit(ctx, "schedule.save", null, { count: docs.length });
  return { saved: docs.length };
}

export async function adminDeleteEvents(ctx: Ctx, args: Args): Promise<{ deleted: number }> {
  requireAdmin(ctx);
  const ids = args.p_ids;
  const group = text(args, "p_group");
  const kind = text(args, "p_kind");
  let filter: Record<string, unknown>;
  if (Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_EVENTS_A_CALL && ids.every((i) => typeof i === "string")) {
    filter = { _id: { $in: ids } };
  } else if (group && (kind === "tutor" || kind === "sl")) {
    // Clearing one group's tutorials or SL before importing a corrected timetable.
    filter = { group, kind };
  } else {
    throw refuse("bad_ids");
  }
  const { deletedCount } = await ctx.c.scheduleEvents.deleteMany(filter);
  await audit(ctx, "schedule.delete", group, { count: deletedCount });
  return { deleted: deletedCount };
}

export async function adminSaveLecturer(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const name = need(text(args, "p_name"), 120);
  const rawPhones = args.p_phones;
  if (!Array.isArray(rawPhones) || rawPhones.length > 5 || !rawPhones.every((p) => typeof p === "string")) throw refuse("bad_phones");
  const phones = [...new Set(rawPhones.map((p: string) => normalizePhone(p)))];
  if (phones.some((p) => p === null)) throw refuse("bad_phone");

  const id = text(args, "p_id");
  const set = { name, phones: phones as string[], updatedAt: ctx.now };
  if (id) {
    const { matchedCount } = await ctx.c.lecturers.updateOne({ _id: id }, { $set: set });
    if (!matchedCount) throw refuse("lecturer_not_found", 404);
  } else {
    const doc: LecturerDoc = { _id: crypto.randomUUID(), ...set, createdAt: ctx.now };
    await ctx.c.lecturers.insertOne(doc);
  }
  await audit(ctx, "lecturer.save", id ?? name);
  return null;
}

export async function adminDeleteLecturer(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const id = text(args, "p_id") ?? "";
  await ctx.c.lecturers.deleteOne({ _id: id });
  // Sessions keep their text; they just stop linking to a person who is gone.
  await ctx.c.scheduleEvents.updateMany({ lecturerId: id }, { $set: { lecturerId: null } });
  await audit(ctx, "lecturer.delete", id);
  return null;
}

export async function adminSaveScheduleDoc(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  const url = need(text(args, "p_url"), 500);
  if (!/^https:\/\//.test(url)) throw refuse("bad_url");
  const set = { block: need(text(args, "p_block"), 10), track: track(args.p_track), title: need(text(args, "p_title"), 200), url, updatedAt: ctx.now };
  const id = text(args, "p_id");
  if (id) {
    const { matchedCount } = await ctx.c.scheduleDocs.updateOne({ _id: id }, { $set: set });
    if (!matchedCount) throw refuse("not_found", 404);
  } else {
    const doc: ScheduleDocDoc = { _id: crypto.randomUUID(), ...set, createdAt: ctx.now };
    await ctx.c.scheduleDocs.insertOne(doc);
  }
  await audit(ctx, "scheduledoc.save", id ?? set.title);
  return null;
}

export async function adminDeleteScheduleDoc(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  await ctx.c.scheduleDocs.deleteOne({ _id: text(args, "p_id") ?? "" });
  return null;
}

export async function adminLecturerReports(ctx: Ctx) {
  requireAdmin(ctx);
  const rows = await ctx.c.lecturerReports.find({ status: "open" }).sort({ createdAt: -1 }).limit(100).toArray();
  return rows.map((r) => ({ id: r._id, kind: r.kind, lecturer_id: r.lecturerId, name: r.name, phone: r.phone, note: r.note, created_at: r.createdAt.toISOString() }));
}

export async function adminResolveReport(ctx: Ctx, args: Args): Promise<null> {
  requireAdmin(ctx);
  await ctx.c.lecturerReports.updateOne({ _id: text(args, "p_id") ?? "" }, { $set: { status: "done" } });
  return null;
}
