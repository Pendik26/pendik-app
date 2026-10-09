// What every function the browser calls answers with: CORS for the app's own addresses, and
// JSON errors in the shape the app reads ({ error }).

/** The app's addresses, from the APP_ORIGINS secret ("https://a,https://b"). */
export function allowedOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

/** CORS headers for a request from `origin`, or none when it isn't one of the app's. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-expose-headers": "x-ai-remaining",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function jsonError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Copies a response with extra headers added (a streamed body is passed through, not read). */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, { status: response.status, headers: merged });
}
