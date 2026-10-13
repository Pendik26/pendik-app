import { MongoClient, type Db } from "mongodb";

// Serverless functions are re-invoked in warm containers; keep one client per container instead
// of opening a new connection pool on every request.
const globalCache = globalThis as unknown as { __pendikMongo?: Promise<{ client: MongoClient; db: Db }> };

export function getMongo(uri: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  globalCache.__pendikMongo ??= (async () => {
    const client = new MongoClient(uri, {
      // One function instance handles one request at a time, plus a few parallel reads.
      maxPoolSize: 5,
      // Many instances can be alive at once; one idle for a minute is closed, so instances
      // winding down don't sit on the cluster's connection limit.
      maxIdleTimeMS: 60_000,
      appName: "pendik",
      // Give up after 5s instead of the driver's 30s when the cluster can't be reached (network
      // access list, outage), so requests fail fast with a clear 503.
      serverSelectionTimeoutMS: 5000,
      // A query that hangs (an overloaded free cluster) fails instead of holding the function.
      socketTimeoutMS: 20_000,
    });
    await client.connect();
    return { client, db: client.db(dbName) };
  })().catch((err) => {
    globalCache.__pendikMongo = undefined;
    throw err;
  });
  return globalCache.__pendikMongo;
}
