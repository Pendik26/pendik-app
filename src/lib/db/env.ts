// Which Supabase settings the build puts in the page (vite.config.ts). The app reads them as
// VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, but Vercel's Supabase integration names
// them for Next.js, so both spellings are accepted. Only the URL and the public key are ever
// read here: the integration's secret and service-role keys never reach the browser.

const URL_NAMES = ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];
const KEY_NAMES = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
];

const first = (env: Record<string, string | undefined>, names: string[]) =>
  names.map((n) => env[n]?.trim()).find((v) => v) ?? "";

/** True for a key that must stay on the server: a secret key, or a legacy service-role JWT. */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

/** The Supabase URL and publishable key from the build's environment; throws on a secret key. */
export function supabaseEnv(env: Record<string, string | undefined>): { url: string; key: string } {
  const url = first(env, URL_NAMES);
  const key = first(env, KEY_NAMES);
  if (key && isSecretKey(key)) {
    throw new Error("The Supabase key for the browser is a secret (service role) key. Use the publishable or anon key.");
  }
  return { url, key };
}
