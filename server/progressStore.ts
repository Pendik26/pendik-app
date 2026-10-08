import type { Collection, Db } from "mongodb";
import type { SyncEntry } from "../src/lib/syncMerge.js";

/** One synced progress entry as stored: a `medicine:*` key for one user. */
export interface StoredEntry extends SyncEntry {
  /** Server time of the last write, used to answer "what changed since T". */
  rev: number;
}

export interface ProgressStore {
  get(userId: string, keys: string[]): Promise<Map<string, StoredEntry>>;
  put(userId: string, entries: StoredEntry[]): Promise<void>;
  changedSince(userId: string, rev: number): Promise<StoredEntry[]>;
  all(userId: string): Promise<StoredEntry[]>;
  deleteAll(userId: string): Promise<void>;
}

interface ProgressDoc extends StoredEntry {
  userId: string;
}

// Reads return only the entry, not _id or the userId the query already names.
const ENTRY_FIELDS = { _id: 0, key: 1, value: 1, updatedAt: 1, rev: 1 } as const;

export class MongoProgressStore implements ProgressStore {
  // Indexes are declared in schema.ts.
  private readonly col: Collection<ProgressDoc>;

  constructor(db: Db) {
    this.col = db.collection<ProgressDoc>("progress");
  }

  async get(userId: string, keys: string[]) {
    const docs = await this.col.find<StoredEntry>({ userId, key: { $in: keys } }, { projection: ENTRY_FIELDS }).toArray();
    return new Map(docs.map((d) => [d.key, d]));
  }

  async put(userId: string, entries: StoredEntry[]) {
    if (entries.length === 0) return;
    await this.col.bulkWrite(
      entries.map((e) => ({
        updateOne: {
          filter: { userId, key: e.key },
          update: { $set: { value: e.value, updatedAt: e.updatedAt, rev: e.rev } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async changedSince(userId: string, rev: number) {
    return this.col.find<StoredEntry>({ userId, rev: { $gte: rev } }, { projection: ENTRY_FIELDS }).toArray();
  }

  async all(userId: string) {
    return this.changedSince(userId, 0);
  }

  async deleteAll(userId: string) {
    await this.col.deleteMany({ userId });
  }
}

/** In-memory store for tests and the local dev server. */
export class MemoryProgressStore implements ProgressStore {
  private readonly data = new Map<string, Map<string, StoredEntry>>();

  private user(userId: string) {
    let m = this.data.get(userId);
    if (!m) this.data.set(userId, (m = new Map()));
    return m;
  }

  async get(userId: string, keys: string[]) {
    const m = this.user(userId);
    return new Map(
      keys.flatMap((k) => {
        const entry = m.get(k);
        return entry ? [[k, structuredClone(entry)] as const] : [];
      }),
    );
  }

  async put(userId: string, entries: StoredEntry[]) {
    const m = this.user(userId);
    for (const e of entries) m.set(e.key, structuredClone(e));
  }

  async changedSince(userId: string, rev: number) {
    return [...this.user(userId).values()].filter((e) => e.rev >= rev).map((e) => structuredClone(e));
  }

  async all(userId: string) {
    return this.changedSince(userId, 0);
  }

  async deleteAll(userId: string) {
    this.data.delete(userId);
  }
}
