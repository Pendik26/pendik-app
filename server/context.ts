import type { AccountDoc, Collections, StudentDoc, Track } from "./db.js";

// What every API function gets: the collections and who is calling, plus small helpers for
// reading arguments. A function refuses a request by throwing ApiError with a short code
// ("admins_only", "package_not_found"), which the app turns into a message.

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A refusal with a code the app knows (400 unless said otherwise). */
export const refuse = (code: string, status = 400) => new ApiError(status, code);

export interface Caller {
  userId: string;
  account: AccountDoc;
  student: StudentDoc;
}

export interface Ctx {
  c: Collections;
  /** The signed-in student; every function but the sign-in ones needs one. */
  caller: Caller;
  now: Date;
}

export const isAdmin = (ctx: Ctx) => ctx.caller.account.role === "admin";

export function requireAdmin(ctx: Ctx): void {
  if (!isAdmin(ctx)) throw refuse("admins_only", 403);
}

/** Whether the caller may see material for this track (null means both classes). */
export function trackVisible(ctx: Ctx, track: Track | null): boolean {
  return track === null || ctx.caller.student.track === null || track === ctx.caller.student.track || isAdmin(ctx);
}

export type Args = Record<string, unknown>;

/** A text argument: undefined and null are null; anything else that isn't text is refused. */
export function text(args: Args, name: string): string | null {
  const v = args[name];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw refuse(`bad_${name.replace(/^p_/, "")}`);
  return v;
}

export function int(args: Args, name: string): number | null {
  const v = args[name];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) throw refuse(`bad_${name.replace(/^p_/, "")}`);
  return v;
}

export function bool(args: Args, name: string): boolean | null {
  const v = args[name];
  if (v === undefined || v === null) return null;
  if (typeof v !== "boolean") throw refuse(`bad_${name.replace(/^p_/, "")}`);
  return v;
}

export function list<T>(args: Args, name: string, item: (v: unknown) => v is T): T[] {
  const v = args[name];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(item)) throw refuse(`bad_${name.replace(/^p_/, "")}`);
  return v;
}

export const isString = (v: unknown): v is string => typeof v === "string";
export const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** A trimmed text, or null when blank. */
export const blankToNull = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export const TRACKS: readonly Track[] = ["IUP", "REGULER"];

/** "IUP" or "REGULER", null for none; anything else is refused. */
export function track(v: unknown): Track | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && (TRACKS as readonly string[]).includes(v)) return v as Track;
  throw refuse("bad_track");
}

/** Writes what someone did to the audit log (Admin → Audit log). */
export async function audit(ctx: Ctx, action: string, target: string | null = null, detail: Record<string, unknown> = {}): Promise<void> {
  await ctx.c.auditLog.insertOne({ actor: ctx.caller.userId, action, target, detail, createdAt: new Date() });
}
