import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { collections, ensureIndexes } from "./db.js";

// A whole app on a real MongoDB for the tests (MONGODB_TEST_URI), in a database of its own.
export async function testApp(uri: string) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(`pendik_test_${Math.random().toString(36).slice(2, 10)}`);
  await ensureIndexes(db);
  const c = collections(db);
  const auth = createAuth({
    database: mongodbAdapter(db, { client }),
    secret: "test-secret-test-secret-test-secret-0123",
    baseURL: "http://localhost",
    trustedOrigins: ["http://localhost"],
    isLocked: async (id) => Boolean(await c.accounts.findOne({ _id: id, lockedAt: { $ne: null } })),
    rateLimit: false,
  });
  const app = createApp({ db, client, auth, driveSyncSecret: "sync-secret" });
  return {
    app,
    c,
    db,
    auth,
    async close() {
      await db.dropDatabase();
      await client.close();
    },
  };
}
