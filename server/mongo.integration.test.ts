// Runs the MongoDB stores against a real server. Skipped unless MONGODB_TEST_URI is set, e.g.
//   MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npx vitest run server/mongo.integration.test.ts
// Uses a throwaway database that is dropped afterwards.
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoLeaderboardStore, newDoc, scoreFor, scoreUpdate } from "./leaderboard.js";
import { MongoProgressStore } from "./progressStore.js";
import { MongoDriveSnapshotStore } from "./drive.js";
import { ensureIndexes, INDEXES } from "./schema.js";

const uri = process.env.MONGODB_TEST_URI;
const NOW = Date.parse("2026-09-26T12:00:00Z");
const quizKey = "medicine:quiz:1.2/anatomy";
const attempts = (...scores: number[]) => scores.map((score) => ({ score, total: 10 }));

describe.skipIf(!uri)("MongoDB stores", () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(`medicine-test-${process.pid}`);
    await ensureIndexes(db);
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  it("creates every declared index, idempotently, with expiry on sessions", async () => {
    await ensureIndexes(db);
    for (const [name, declared] of Object.entries(INDEXES)) {
      const existing = await db.collection(name).indexes();
      expect(existing.length, name).toBe(declared.length + 1); // plus _id
    }
    const session = await db.collection("session").indexes();
    expect(session.find((i) => i.name === "expiry")?.expireAfterSeconds).toBe(0);
  });

  it("stores progress per user and key, and returns entries without internal fields", async () => {
    const store = new MongoProgressStore(db);
    await store.put("u1", [{ key: quizKey, value: attempts(7), updatedAt: 1, rev: 100 }]);
    await store.put("u1", [{ key: quizKey, value: attempts(7, 9), updatedAt: 2, rev: 200 }]);
    await store.put("u2", [{ key: quizKey, value: attempts(1), updatedAt: 1, rev: 150 }]);
    expect(await store.changedSince("u1", 150)).toEqual([{ key: quizKey, value: attempts(7, 9), updatedAt: 2, rev: 200 }]);
    expect((await store.get("u1", [quizKey])).get(quizKey)?.value).toEqual(attempts(7, 9));
    expect(await db.collection("progress").countDocuments({ userId: "u1" })).toBe(1);
    await store.deleteAll("u1");
    expect(await store.all("u1")).toEqual([]);
    expect(await store.all("u2")).toHaveLength(1);
  });

  it("updates score parts in place, even with dots in the key, and credits gains by day", async () => {
    const lb = new MongoLeaderboardStore(db);
    const base = { userId: "s1", displayName: "Siti", cohort: "2025" };
    await lb.create(newDoc(base, [{ key: quizKey, value: attempts(8) }], NOW));
    await lb.setProfile("s1", { joined: true });

    // Two syncs that read the same record and write different keys both land.
    const seen = (await lb.get("s1"))!;
    await lb.applyScore("s1", scoreUpdate(seen, [{ key: quizKey, value: attempts(8, 10) }], NOW));
    await lb.applyScore("s1", scoreUpdate(seen, [{ key: "medicine:ebookdone:1.2/anatomy", value: ["chapter-01"] }], NOW));
    // A repeated create (first-sync race) keeps the existing record and its membership.
    await lb.create(newDoc(base, [], NOW));

    const doc = (await lb.get("s1"))!;
    expect(doc.joined).toBe(true);
    expect(Object.keys(doc.parts).sort()).toEqual(["medicine:ebookdone:1%2E2/anatomy", "medicine:quiz:1%2E2/anatomy"]);
    expect(scoreFor(doc, "all", NOW)).toBe(28);
    expect(doc.daily).toEqual({ "2026-09-26": 20 });
    expect((await lb.joined()).map((d) => d.userId)).toEqual(["s1"]);
    // Each board reads only what ranking it needs.
    const [week] = await lb.joined("week");
    expect(week.daily).toEqual({ "2026-09-26": 20 });
    expect(week.parts).toBeUndefined();
    const [all] = await lb.joined("all", "2025");
    expect(scoreFor(all, "all", NOW)).toBe(28);
    expect(all.daily).toBeUndefined();
    expect(await lb.joined("all", "2024")).toEqual([]);

    // Old days are dropped as new ones are credited.
    const later = NOW + 20 * 86_400_000;
    await lb.applyScore("s1", scoreUpdate(doc, [{ key: quizKey, value: attempts(8, 10, 10) }], later));
    expect((await lb.get("s1"))!.daily).toEqual({ "2026-10-16": 10 });
  });

  it("keeps the Drive listing and each opened archive folder, dated for expiry", async () => {
    const snapshots = new MongoDriveSnapshotStore(db);
    const tree = { root: { name: "", folders: [], files: [] }, updatedAt: 5, complete: true, deferred: { abc: "folderId0001" } };
    await snapshots.save(tree);
    await snapshots.save({ ...tree, updatedAt: 6 }, "folder:abc");
    expect(await snapshots.load()).toEqual(tree);
    expect((await snapshots.load("folder:abc"))?.updatedAt).toBe(6);
    const doc = await db.collection("driveSnapshot").findOne({ _id: "folder:abc" as never });
    expect(doc?.savedAt).toBeInstanceOf(Date);
    const ttl = (await db.collection("driveSnapshot").indexes()).find((i) => i.name === "expiry");
    expect(ttl?.expireAfterSeconds).toBe(30 * 86_400);
  });

  it("repairs a record from before per-key parts", async () => {
    const lb = new MongoLeaderboardStore(db);
    await db.collection("leaderboard").insertOne({
      userId: "old",
      joined: true,
      displayName: "Old",
      cohort: null,
      stats: { points: 5 },
      runEnd: null,
      runLength: 0,
      daily: {},
      updatedAt: 1,
    });
    await lb.replaceParts("old", { [quizKey.replaceAll(".", "%2E")]: { correctAnswers: 9 } }, NOW);
    const doc = (await db.collection("leaderboard").findOne({ userId: "old" }))!;
    expect(doc.stats).toBeUndefined();
    expect(doc.joined).toBe(true);
    expect(scoreFor((await lb.get("old"))!, "all", NOW)).toBe(9);
  });
});
