// Student accounts: how a student id becomes a sign-in address and a first password. The app
// has the same rules in src/lib/db/client.ts. Import-free.

export const studentEmail = (studentId: string) => `${studentId.trim().toLowerCase()}@pendik26.internal`;

/** The password an account starts with (and goes back to on a reset); it must be changed at sign-in. */
export const firstPassword = (studentId: string) => `pendik26${studentId.trim()}`;

export type AccountAction =
  | { action: "activate"; student_ids: string[] }
  | { action: "lock" | "unlock" | "reset"; user_id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STUDENT_ID = /^[0-9A-Za-z]{3,30}$/;

/** Checks a request body; null when it isn't one of the actions. */
export function parseAccountAction(body: unknown): AccountAction | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.action === "activate") {
    const ids = Array.isArray(b.student_ids) ? b.student_ids.filter((id): id is string => typeof id === "string" && STUDENT_ID.test(id)) : [];
    return ids.length > 0 && ids.length <= 300 && ids.length === (b.student_ids as unknown[]).length ? { action: "activate", student_ids: [...new Set(ids)] } : null;
  }
  if ((b.action === "lock" || b.action === "unlock" || b.action === "reset") && typeof b.user_id === "string" && UUID.test(b.user_id)) {
    return { action: b.action, user_id: b.user_id };
  }
  return null;
}
