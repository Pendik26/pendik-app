import { describe, expect, it } from "vitest";
import { kindOf, placeOf, youtubeIds } from "./drivePath.ts";
import { applyHeldRun, DEFAULT_SYNC, FOLDER, syncStep, type ApiFile, type DriveApi, type FileRow, type SyncConfig, type SyncCursor, type SyncRun, type SyncStore } from "./driveSync.ts";
import { parseServiceAccount, serviceAccountJwt } from "./googleAuth.ts";

describe("where a file sits", () => {
  it("reads semester, track, block, category and subject from the folders", () => {
    expect(placeOf(["SEMESTER 1", "REGULER", "BLOK 1.1 Biomedik Dasar", "PPT DOSEN", "Histologi", "Minggu 2"])).toEqual({
      semester: 1, track: "REGULER", block: "1.1", blockName: "Biomedik Dasar", category: "PPT DOSEN", subject: "Histologi",
    });
    expect(placeOf(["Blok 2,3 - Kardio", "Rekaman"])).toMatchObject({ semester: 3, track: null, block: "2.3", blockName: "Kardio", category: "Rekaman", subject: null });
    expect(placeOf(["IUP", "BLOCK 1.2"])).toMatchObject({ track: "IUP", block: "1.2", blockName: null });
    expect(placeOf(["Misc", "Old"])).toMatchObject({ block: null, category: null });
  });

  it("knows the kind of a file", () => {
    expect(kindOf("application/vnd.google-apps.presentation", "Kuliah")).toBe("slide");
    expect(kindOf("application/octet-stream", "notes.PDF")).toBe("pdf");
    expect(kindOf("video/mp4", "rec")).toBe("video");
    expect(kindOf("application/zip", "x.zip")).toBe("file");
  });

  it("finds each YouTube video a Doc links to once", () => {
    const text = "Lecture: https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3 then youtube.com/shorts/abcdefghijk. Not: youtube.com/watch?v=short";
    expect(youtubeIds(text)).toEqual(["dQw4w9WgXcQ", "abcdefghijk"]);
  });
});

/** The class Drive as a map of folder id → children. */
function fakeDrive(tree: Record<string, ApiFile[]>, docs: Record<string, string> = {}, broken = new Set<string>()): DriveApi & { exported: string[] } {
  const exported: string[] = [];
  return {
    exported,
    async listChildren(ids) {
      if (ids.some((id) => broken.has(id))) throw new Error("403");
      return ids.flatMap((id) => (tree[id] ?? []).map((f) => ({ ...f, parents: [id] })));
    },
    async exportText(id) {
      exported.push(id);
      return docs[id] ?? "";
    },
  };
}

function memoryStore(initial: FileRow[] = []) {
  const files = new Map(initial.map((r) => [r.drive_file_id, { ...r, missing_since: null as string | null }]));
  let running: SyncRun | null = null;
  const runs: SyncRun[] = [];
  const store: SyncStore = {
    async runningRun() { return running; },
    async createRun(_by, cursor: SyncCursor) {
      running = { id: `run${runs.length + 1}`, status: "running", startedAt: new Date().toISOString(), cursor, filesFound: 0, filesAdded: 0, filesUpdated: 0, filesMissing: 0, calls: 0, notes: {} };
      runs.push(running);
      return running;
    },
    async saveRun(run, finished) { if (finished) running = null; else running = run; },
    async existing(ids) { return new Map(ids.filter((id) => files.has(id)).map((id) => [id, files.get(id)?.drive_modified_at ?? null])); },
    async upsert(rows) { for (const r of rows) files.set(r.drive_file_id, { ...files.get(r.drive_file_id), ...r }); },
    async touchVideosOf(docIds, at) {
      for (const [id, f] of files) if (docIds.some((d) => id.startsWith(`youtube:${d}:`))) files.set(id, { ...f, synced_at: at, missing_since: null });
    },
    async liveCount() { return [...files.values()].filter((f) => !f.missing_since).length; },
    async unseenSince(at) { return [...files.values()].filter((f) => !f.missing_since && f.synced_at < at).length; },
    async markMissing(at) {
      let n = 0;
      for (const [id, f] of files) if (!f.missing_since && f.synced_at < at) { files.set(id, { ...f, missing_since: at }); n++; }
      return n;
    },
  };
  return { store, files, runs };
}

const file = (id: string, name: string, extra: Partial<ApiFile> = {}): ApiFile => ({ id, name, mimeType: "application/pdf", modifiedTime: "2026-09-01T00:00:00.000Z", size: "100", ...extra });
const folder = (id: string, name: string): ApiFile => ({ id, name, mimeType: FOLDER });

const classDrive = {
  root: [folder("sem1", "SEMESTER 1")],
  sem1: [folder("reg", "REGULER")],
  reg: [folder("b11", "BLOK 1.1 Biomedik")],
  b11: [folder("ppt", "PPT DOSEN"), folder("rek", "REKAMAN")],
  ppt: [folder("histo", "Histologi"), file("f1", "Epitel.pdf")],
  histo: [file("f2", "Jaringan ikat.pdf"), { id: "s1", name: "Shortcut", mimeType: "application/vnd.google-apps.shortcut", shortcutDetails: { targetId: "f1", targetMimeType: "application/pdf" } }],
  rek: [file("d1", "Links", { mimeType: "application/vnd.google-apps.document", size: undefined })],
};

const config: SyncConfig = { ...DEFAULT_SYNC, rootFolderId: "root" };

describe("syncStep", () => {
  it("walks the Drive, files each file under its block, and adds the videos Docs link to", async () => {
    const { store, files } = memoryStore();
    const drive = fakeDrive(classDrive, { d1: "Week 1 https://youtu.be/dQw4w9WgXcQ" });
    const r = await syncStep(store, drive, config, "schedule");
    expect(r).toMatchObject({ status: "done", remaining: 0, filesFound: 4, filesAdded: 3, filesMissing: 0 });
    expect(files.get("f2")).toMatchObject({ block: "1.1", category: "PPT DOSEN", subject: "Histologi", folder_path: ["SEMESTER 1", "REGULER", "BLOK 1.1 Biomedik", "PPT DOSEN", "Histologi"] });
    expect(files.get("youtube:d1:dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", youtube_id: "dQw4w9WgXcQ", category: "REKAMAN", title: "Links (video)" });
    // No folder ids are kept anywhere.
    expect(JSON.stringify([...files.values()])).not.toMatch(/"(sem1|reg|b11|ppt|histo|rek)"/);
  });

  it("stops at its time budget and carries on in the next call", async () => {
    const { store, runs } = memoryStore();
    let t = 0;
    const now = () => (t += 30_000);
    const first = await syncStep(store, fakeDrive(classDrive), { ...config, budgetMs: 45_000 }, "admin", now);
    expect(first.status).toBe("running");
    expect(first.remaining).toBeGreaterThan(0);
    let r = first;
    for (let i = 0; i < 10 && r.status === "running"; i++) r = await syncStep(store, fakeDrive(classDrive), { ...config, budgetMs: 45_000 }, "admin", now);
    expect(r.status).toBe("done");
    expect(runs).toHaveLength(1);
    expect(runs[0].calls).toBeGreaterThan(1);
  });

  it("hides files that are gone, reads only changed Docs, and keeps the videos of unchanged ones", async () => {
    const m = memoryStore();
    await syncStep(m.store, fakeDrive(classDrive, { d1: "https://youtu.be/dQw4w9WgXcQ" }), config, "schedule");
    await new Promise((r) => setTimeout(r, 5));
    const smaller = { ...classDrive, histo: [] };
    const drive = fakeDrive(smaller, { d1: "https://youtu.be/dQw4w9WgXcQ" });
    const r = await syncStep(m.store, drive, { ...config, maxMissingShare: 0.9 }, "schedule");
    expect(r).toMatchObject({ status: "done", filesMissing: 1 });
    expect(m.files.get("f2")?.missing_since).toBeTruthy();
    expect(m.files.get("youtube:d1:dQw4w9WgXcQ")?.missing_since).toBeNull();
    expect(drive.exported).toEqual([]);
  });

  it("holds the run instead of hiding a large share of the Drive at once", async () => {
    const m = memoryStore();
    await syncStep(m.store, fakeDrive(classDrive), config, "schedule");
    await new Promise((r) => setTimeout(r, 5));
    const r = await syncStep(m.store, fakeDrive({ root: [file("f9", "Only.pdf")] }), { ...config, maxMissingShare: 0.3 }, "schedule");
    // 4 unseen of 5 shown, but under the 10-file floor: small Drives aren't held.
    expect(r.status).toBe("done");

    const big = memoryStore(Array.from({ length: 40 }, (_, i) => ({ drive_file_id: `old${i}`, synced_at: "2000-01-01T00:00:00.000Z", drive_modified_at: null }) as FileRow));
    const held = await syncStep(big.store, fakeDrive(classDrive), config, "schedule");
    expect(held).toMatchObject({ status: "held", filesMissing: 0, notes: { reason: "too_many_missing", unseen: 40 } });
    expect(big.files.get("old1")?.missing_since).toBeNull();
    const run = big.runs[0];
    const applied = await applyHeldRun(big.store, run);
    expect(applied).toMatchObject({ status: "done", filesMissing: 40 });
  });

  it("holds the run when a folder couldn't be listed", async () => {
    const m = memoryStore();
    const r = await syncStep(m.store, fakeDrive(classDrive, {}, new Set(["histo"])), config, "schedule");
    expect(r).toMatchObject({ status: "held", notes: { reason: "incomplete", skippedFolders: 1 } });
  });
});

describe("service account sign-in", () => {
  it("reads the key and signs a JWT that verifies", async () => {
    const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
    expect(parseServiceAccount("nope")).toBeNull();
    const account = parseServiceAccount(JSON.stringify({ client_email: "sync@x.iam.gserviceaccount.com", private_key: pem }));
    if (!account) throw new Error("no account");
    const jwt = await serviceAccountJwt(account, "https://www.googleapis.com/auth/drive.readonly", 1000);
    const [h, c, s] = jwt.split(".");
    const unb64 = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(unb64(c)))).toMatchObject({ iss: "sync@x.iam.gserviceaccount.com", iat: 1000, exp: 4600 });
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, unb64(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
});
