// Vercel Function: the app's whole API. vercel.json rewrites /api/* here, keeping the original
// URL, and server/app.ts routes by path. Without MONGODB_URI and BETTER_AUTH_SECRET every route
// answers 503, and the app keeps working as a guest-only static site.
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { createApp, type App } from "../server/app.js";
import { createAuth } from "../server/auth.js";
import { publicUrlFromEnv, trustedOriginsFromEnv } from "../server/env.js";
import { getMongo } from "../server/mongo.js";
import { MongoLeaderboardStore } from "../server/leaderboard.js";
import { MongoProgressStore } from "../server/progressStore.js";
import { ensureIndexes } from "../server/schema.js";
import { aiConfigFromEnv, MongoAiUsageStore } from "../server/ai.js";
import { DriveIndex, driveConfigFromEnv, MongoDriveSnapshotStore } from "../server/drive.js";

let app: Promise<App> | null = null;

function build(): Promise<App> {
  const env = process.env;
  const uri = env.MONGODB_URI;
  const secret = env.BETTER_AUTH_SECRET;
  if (!uri || !secret) throw new Error("MONGODB_URI and BETTER_AUTH_SECRET must be set.");
  return getMongo(uri, env.MONGODB_DB || "medicine").then(async ({ client, db }) => {
    // Once per cold start, off the request path: the indexes normally exist already.
    ensureIndexes(db).catch((err) => { console.error("Creating indexes failed", err); });
    const store = new MongoProgressStore(db);
    const leaderboard = new MongoLeaderboardStore(db);
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
      onDeleteUser: async (userId) => {
        await Promise.all([store.deleteAll(userId), leaderboard.delete(userId)]);
      },
      rateLimit: "database",
    });
    const aiConfig = aiConfigFromEnv(env);
    const ai = aiConfig ? { config: aiConfig, usage: new MongoAiUsageStore(db) } : undefined;
    const driveConfig = driveConfigFromEnv(env);
    const drive = driveConfig ? new DriveIndex(driveConfig, new MongoDriveSnapshotStore(db)) : undefined;
    return createApp({ auth, store, leaderboard, googleEnabled: Boolean(google), ai, drive });
  });
}

async function handle(request: Request): Promise<Response> {
  try {
    app ??= build();
    return await (await app)(request);
  } catch (err) {
    app = null;
    console.error(err);
    return new Response(JSON.stringify({ error: "Accounts are not available right now." }), {
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
