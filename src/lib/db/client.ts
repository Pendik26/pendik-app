import { createAuthClient } from "better-auth/react";

// The one way the app talks to its server (api/index.ts): sign-in through Better Auth, and every
// other call as `POST /api/rpc/<name>` with a JSON body, answered with { data } or { error: "code" }.
// Nothing here knows about the database behind it.

export const authClient = createAuthClient({ basePath: "/api/auth" });

/** JSON as the server sends and stores it. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ApiError {
  /** A short code the app translates ("admins_only", "not_signed_in"), or a plain message. */
  message: string;
  status: number;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

/** Calls a server function by name. Never throws: a failure to connect comes back as an error with status 0. */
export async function rpc<T = unknown>(fn: string, args: object = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/rpc/${fn}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    return { data: null, error: { message: "network", status: 0 } };
  }
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!res.ok || !body || body.error) return { data: null, error: { message: body?.error ?? "server_error", status: res.status } };
  return { data: (body.data ?? null) as T, error: null };
}

/** A raw request to the API, for responses read as a stream (the AI answers). */
export function apiFetch(path: string, init: { body: string; signal?: AbortSignal }): Promise<Response> {
  return fetch(`/api/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: init.body,
    signal: init.signal,
  });
}

// ---------------------------------------------------------------------------------------------
// Errors

/** The short code of a refusal from our functions, or null for anything else. */
export function errorCode(error: { message?: string } | null | undefined): string | null {
  const m = error?.message?.match(/^[a-z_]+$/);
  return m ? m[0] : null;
}

/** A call's data, or its error thrown as an Error. */
export async function must<T>(call: PromiseLike<ApiResult<T>>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(error.message);
  return data;
}
