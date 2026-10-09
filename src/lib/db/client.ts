import { createClient, type PostgrestError, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// The one way the app talks to Supabase: login, the database and the Edge Functions. Everything
// that reads or writes data imports from here. Only the public URL and publishable key are in the
// bundle (vite.config.ts puts them there); the database's own rules decide what each student can
// read. The schema behind it is database/schema/; `npm run db:types` rewrites ./types.ts from it.

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "";

/** Why the app can't reach Supabase, shown instead of a blank page; null when it's configured. */
export const supabaseConfigError: string | null =
  url && key ? null : "Supabase isn't configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";

/** A separate client with these auth options (e.g. to check a password without replacing the session). */
export function newClient(auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl?: boolean; storageKey?: string }): SupabaseClient<Database> {
  return createClient<Database>(url || "http://localhost:54321", key || "missing-key", { auth });
}

export const db = newClient({ persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });

/** The signed-in session, from memory (supabase-js only goes to the network to refresh it). */
export async function currentSession(): Promise<Session | null> {
  return (await db.auth.getSession()).data.session;
}

// ---------------------------------------------------------------------------------------------
// Database functions

type Functions = Database["public"]["Functions"];
/** A function's arguments. The generated types can't tell which ones SQL accepts as null, so any can be. */
type RpcArgs<F extends keyof Functions> = [Functions[F]["Args"]] extends [never]
  ? []
  : [{ [K in keyof Functions[F]["Args"]]: Functions[F]["Args"][K] | null }];

/** Calls a database function (`rpc`) by its checked name and argument names. */
export function rpc<F extends keyof Functions>(
  fn: F,
  ...args: RpcArgs<F>
): PromiseLike<{ data: Functions[F]["Returns"]; error: PostgrestError | null }> {
  const call = db.rpc as unknown as (fn: string, args?: object) => PromiseLike<{ data: Functions[F]["Returns"]; error: PostgrestError | null }>;
  return call.call(db, fn, args[0]);
}

// ---------------------------------------------------------------------------------------------
// Errors

/** Turns a database error from our functions (`raise exception 'code'`) into its code. */
export function errorCode(error: { message?: string } | null | undefined): string | null {
  const m = error?.message?.match(/^[a-z_]+$/);
  return m ? m[0] : null;
}

/** A query's data, or its error thrown as an Error. */
export async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------------------------
// Edge Functions

/** Calls an Edge Function with the student's session; throws the function's own { error } message. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await db.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? ((await context.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
    throw new Error(detail ?? error.message);
  }
  return data as T;
}

/** A raw request to an Edge Function with the session's token, for responses read as a stream. */
export function fetchFunction(path: string, session: Session, init: { body: string; signal?: AbortSignal }): Promise<Response> {
  return fetch(`${url}/functions/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, apikey: key },
    body: init.body,
    signal: init.signal,
  });
}

// ---------------------------------------------------------------------------------------------
// Sign-in names

/** Students sign in with their student id (NIM); Supabase Auth sees it as this address. */
export function studentEmail(studentId: string): string {
  return `${studentId.trim().toLowerCase()}@pendik26.internal`;
}

/** A first password is `pendik26` + the student id; it can't be kept as the new password. */
export function isFirstPassword(studentId: string, password: string): boolean {
  return password === `pendik26${studentId.trim()}`;
}
