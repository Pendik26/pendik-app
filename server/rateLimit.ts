import { ApiError } from "./context.js";
import type { Collections } from "./db.js";

// Per-student limits on how often the costly calls can be made, kept in MongoDB so every
// function instance counts the same calls. Each call adds one to its window's counter (a minute
// long); past the limit it is refused with 429 until the next minute. Sign-in is limited
// separately by Better Auth, and the AI keeps its daily allowance.

export interface Limits {
  /** Calls a minute for a function that has no entry in `perFunction`. */
  standard: number;
  /** Calls a minute for named functions, and for the "ai" and "image" kinds. */
  perFunction: Record<string, number>;
}

export const DEFAULT_LIMITS: Limits = {
  standard: 240,
  perFunction: {
    start_attempt: 12,
    start_bank_practice: 12,
    submit_attempt: 12,
    abandon_attempt: 12,
    take_over_attempt: 12,
    admin_import_questions: 12,
    admin_packages_from_import: 12,
    admin_import_lecturers: 12,
    admin_add_students: 12,
    admin_accounts: 30,
    ai: 20,
    image: 30,
  },
};

const WINDOW_MS = 60_000;

/** Counts one call by `userId` to `kind`; throws 429 "too_many_requests" when over the limit. */
export async function takeRate(c: Collections, limits: Limits | false, userId: string, kind: string, now = new Date()): Promise<void> {
  if (!limits) return;
  const limit = limits.perFunction[kind] ?? limits.standard;
  const windowStart = Math.floor(now.getTime() / WINDOW_MS);
  const doc = await c.apiLimits.findOneAndUpdate(
    { _id: `${userId}:${kind}:${windowStart}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((windowStart + 2) * WINDOW_MS) } },
    { upsert: true, returnDocument: "after" },
  );
  if (doc && doc.count > limit) throw new ApiError(429, "too_many_requests");
}
