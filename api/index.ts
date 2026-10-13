// Vercel Function: the app's whole API. vercel.json rewrites /api/* here, keeping the original
// URL, and server/app.ts routes by path. Without MONGODB_URI and BETTER_AUTH_SECRET every route
// answers 503.
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { createApp, type App } from "../server/app.js";
import { createAuth } from "../server/auth.js";
import { ensureIndexes } from "../server/db.js";
import { driveSyncConfigFromEnv } from "../server/drive.js";
import { publicUrlFromEnv, trustedOriginsFromEnv } from "../server/env.js";
import { getMongo } from "../server/mongo.js";
import { aiConfigFromEnv } from "../server/ai.js";
import { collections } from "../server/db.js";
import { ensureFirstAdmin } from "../server/people.js";

let app: Promise<App> | null = null;

function build(): Promise<App> {
  const env = process.env;
  const uri = env.MONGODB_URI;
  const secret = env.BETTER_AUTH_SECRET;
  if (!uri || !secret) throw new Error("MONGODB_URI and BETTER_AUTH_SECRET must be set.");
  return getMongo(uri, env.MONGODB_DB || "pendik").then(async ({ client, db }) => {
    // Once per cold start, off the request path: the indexes normally exist already.
    ensureIndexes(db).catch((err) => { console.error("Creating indexes failed", err); });
    const google =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined;
    const auth = createAuth({
      database: mongodbAdapter(db, { client }),
      secret,
      baseURL: publicUrlFromEnv(env),
      trustedOrigins: trustedOriginsFromEnv(env),
      google,
      isLocked: async (userId) => Boolean(await db.collection("accounts").findOne({ _id: userId as never, lockedAt: { $ne: null } })),
      rateLimit: "database",
    });
    // The first admin, from FIRST_ADMIN_NIM and FIRST_ADMIN_NAME (never committed). It only
    // happens while the site has no admin; remove the settings afterwards.
    if (env.FIRST_ADMIN_NIM && env.FIRST_ADMIN_NAME) {
      await ensureFirstAdmin(collections(db), auth, { nim: env.FIRST_ADMIN_NIM, fullName: env.FIRST_ADMIN_NAME, cohort: env.FIRST_ADMIN_COHORT });
    }
    const aiConfig = aiConfigFromEnv(env);
    return createApp({
      db,
      client,
      auth,
      ai: aiConfig ? { config: aiConfig } : undefined,
      drive: driveSyncConfigFromEnv(env) ?? undefined,
      driveSyncSecret: env.DRIVE_SYNC_SECRET,
      origins: env.APP_ORIGINS,
    });
  });
}

async function handle(request: Request): Promise<Response> {
  try {
    app ??= build();
    return await (await app)(request);
  } catch (err) {
    app = null;
    console.error(err);
    return new Response(JSON.stringify({ error: "server_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
