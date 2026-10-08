/** Origins allowed to call the auth API: the configured URL plus Vercel's deployment URLs. */
export function trustedOriginsFromEnv(env: Record<string, string | undefined>): string[] {
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((h): h is string => Boolean(h))
    .map((h) => `https://${h}`);
  const extra = (env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([env.BETTER_AUTH_URL, ...hosts, ...extra].filter((o): o is string => Boolean(o)))];
}

export function publicUrlFromEnv(env: Record<string, string | undefined>): string | undefined {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}
