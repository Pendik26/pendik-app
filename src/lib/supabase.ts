import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The one Supabase client: login, the database and the Edge Functions. Only the public URL and
// publishable key are in the bundle; the database's own rules decide what each student can read.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Why the app can't reach Supabase, shown instead of a blank page; null when it's configured. */
export const supabaseConfigError: string | null =
  url && key ? null : "Supabase isn't configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";

export const supabase: SupabaseClient = createClient(url || "http://localhost:54321", key || "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Students sign in with their student id (NIM); Supabase Auth sees it as this address. */
export function studentEmail(studentId: string): string {
  return `${studentId.trim().toLowerCase()}@pendik26.internal`;
}

/** A first password is `pendik26` + the student id; it can't be kept as the new password. */
export function isFirstPassword(studentId: string, password: string): boolean {
  return password === `pendik26${studentId.trim()}`;
}

/** Turns a database error from our functions (`raise exception 'code'`) into its code. */
export function errorCode(error: { message?: string } | null | undefined): string | null {
  const m = error?.message?.match(/^[a-z_]+$/);
  return m ? m[0] : null;
}
