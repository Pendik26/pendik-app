// The API for `npm run dev:api`: the same app as api/index.ts, backed by in-memory storage
// (MEDICINE_API=memory) or a real database (MONGODB_URI). Loaded by the Vite dev server.
import { memoryAdapter } from "better-auth/adapters/memory";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { createApp, type App } from "./app.js";
import { createAuth } from "./auth.js";
import { getMongo } from "./mongo.js";
import { MemoryLeaderboardStore, MongoLeaderboardStore, type LeaderboardStore } from "./leaderboard.js";
import { MemoryProgressStore, MongoProgressStore, type ProgressStore } from "./progressStore.js";
import { ensureIndexes } from "./schema.js";
import { aiConfigFromEnv, MemoryAiUsageStore, MongoAiUsageStore, type AiUsageStore } from "./ai.js";
import { DriveIndex, driveConfigFromEnv } from "./drive.js";

let app: Promise<App> | null = null;

export function getDevApp(): Promise<App> {
  app ??= (async () => {
    const env = process.env;
    let store: ProgressStore;
    let leaderboard: LeaderboardStore;
    let database;
    let usage: AiUsageStore = new MemoryAiUsageStore();
    if (env.MONGODB_URI) {
      const { client, db } = await getMongo(env.MONGODB_URI, env.MONGODB_DB || "medicine-dev");
      await ensureIndexes(db);
      store = new MongoProgressStore(db);
      leaderboard = new MongoLeaderboardStore(db);
      database = mongodbAdapter(db, { client });
      usage = new MongoAiUsageStore(db);
    } else {
      store = new MemoryProgressStore();
      leaderboard = new MemoryLeaderboardStore();
      database = memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] });
    }
    // Google works locally too with an OAuth client whose redirect URI is
    // http://localhost:5173/api/auth/callback/google.
    const google =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined;
    const auth = createAuth({
      database,
      google,
      secret: env.BETTER_AUTH_SECRET || "local-development-secret-not-for-production",
      trustedOrigins: ["http://localhost:*", "http://127.0.0.1:*"],
      onDeleteUser: async (id) => {
        await Promise.all([store.deleteAll(id), leaderboard.delete(id)]);
      },
      rateLimit: false,
    });
    const aiConfig = aiConfigFromEnv(env);
    const driveConfig = driveConfigFromEnv(env);
    return createApp({
      auth,
      store,
      leaderboard,
      googleEnabled: Boolean(google),
      ai: aiConfig ? { config: aiConfig, usage } : undefined,
      drive: driveConfig ? new DriveIndex(driveConfig) : undefined,
    });
  })();
  return app;
}
