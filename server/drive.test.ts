import { describe, expect, it, vi } from "vitest";
import { crawlDrive, DriveIndex, driveConfigFromEnv, folderKey, kindOf, MemoryDriveSnapshotStore, publicTree, type DriveConfig } from "./drive.js";

const FOLDER = "application/vnd.google-apps.folder";
const ROOT = "rootFolder0001";

interface Item {
  id: string;
  name: string;
  mimeType: string;
  parent: string;
  size?: string;
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

/** A Drive API that answers files.list from a list of items, two per page. */
function fakeDrive(items: Item[], { fail = new Set<string>() } = {}) {
  const calls: string[] = [];
  const requests: string[][] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    // files.get for a folder's name.
    const one = /\/files\/([^/?]+)$/.exec(url.pathname)?.[1];
    if (one) {
      calls.push(`get:${one}`);
      const item = items.find((i) => i.id === one);
      if (url.searchParams.get("key") !== "test-key" || fail.has(one) || !item) return new Response("{}", { status: 404 });
      return Response.json({ name: item.name, mimeType: item.mimeType });
    }
    const parents = [...(url.searchParams.get("q") ?? "").matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    calls.push(...parents);
    requests.push(parents);
    if (url.searchParams.get("key") !== "test-key") return new Response("{}", { status: 403 });
    if (parents.some((p) => fail.has(p))) return new Response("{}", { status: 500 });
    const children = items.filter((i) => parents.includes(i.parent));
    const start = Number(url.searchParams.get("pageToken") || 0);
    const page = children
      .slice(start, start + 2)
      .map(({ parent, ...rest }) => ({ ...rest, parents: [parent], createdTime: "2026-10-02T00:00:00Z", modifiedTime: "2026-10-01T00:00:00Z" }));
    const next = start + 2 < children.length ? String(start + 2) : undefined;
    return Response.json({ files: page, nextPageToken: next });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, requests };
}

const config: DriveConfig = { apiKey: "test-key", folderId: ROOT, apiBase: "https://drive.test/v3", ttlMs: 5 * 60_000 };

const classDrive: Item[] = [
  { id: "semester0001", name: "SEMESTER 1", mimeType: FOLDER, parent: ROOT },
  { id: "block12folder", name: "BLOCK 1.2 INTEGUMEN SYSTEM AND MUSKOLOSKELETAL", mimeType: FOLDER, parent: "semester0001" },
  { id: "anatomyfolder", name: "ANATOMY", mimeType: FOLDER, parent: "block12folder" },
  { id: "ubfolder00001", name: "UB", mimeType: FOLDER, parent: "block12folder" },
  { id: "lecture13file", name: "L13 - Kinesiologi.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", parent: "anatomyfolder", size: "7404733" },
  { id: "lecture02file", name: "L2 - Introduction.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", parent: "anatomyfolder", size: "26836841" },
  { id: "tatibfile0001", name: "TATIB 1.2 .pdf", mimeType: "application/pdf", parent: "anatomyfolder", size: "14933460" },
  { id: "recording0001", name: "Lecture 1.mp4", mimeType: "video/mp4", parent: "anatomyfolder", size: "900" },
  { id: "googleslides1", name: "Notes", mimeType: "application/vnd.google-apps.presentation", parent: "anatomyfolder" },
  // A shortcut to a file elsewhere, and one pointing back up the tree.
  { id: "shortcut00001", name: "UB 2025 paper", mimeType: "application/vnd.google-apps.shortcut", parent: "ubfolder00001", shortcutDetails: { targetId: "paperelsewhere", targetMimeType: "application/pdf" } },
  { id: "shortcut00002", name: "Back to semester", mimeType: "application/vnd.google-apps.shortcut", parent: "ubfolder00001", shortcutDetails: { targetId: "semester0001", targetMimeType: FOLDER } },
];

describe("Drive settings", () => {
  it("needs a key and a folder, given as an id or a share link", () => {
    expect(driveConfigFromEnv({})).toBeUndefined();
    expect(driveConfigFromEnv({ GOOGLE_DRIVE_API_KEY: "k" })).toBeUndefined();
    const fromLink = driveConfigFromEnv({
      GOOGLE_DRIVE_API_KEY: "k",
      GOOGLE_DRIVE_FOLDER_ID: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345?usp=share_link",
    });
    expect(fromLink?.folderId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(fromLink?.ttlMs).toBe(5 * 60_000);
    expect(driveConfigFromEnv({ GOOGLE_DRIVE_API_KEY: "k", GOOGLE_DRIVE_FOLDER_ID: "x' or '1'='1" })).toBeUndefined();
  });

  it("takes archive folders as ids or links, dropping bad ones and the class folder", () => {
    const c = driveConfigFromEnv({
      GOOGLE_DRIVE_API_KEY: "k",
      GOOGLE_DRIVE_FOLDER_ID: "classFolder0001",
      GOOGLE_DRIVE_ON_DEMAND_FOLDERS: "https://drive.google.com/drive/folders/archiveFolder01?usp=share_link, archiveFolder02\nx' or 1, classFolder0001",
    });
    expect(c?.onDemand).toEqual(["archiveFolder01", "archiveFolder02"]);
    expect(driveConfigFromEnv({ GOOGLE_DRIVE_API_KEY: "k", GOOGLE_DRIVE_FOLDER_ID: "classFolder0001" })?.onDemand).toEqual([]);
  });
});

describe("file kinds", () => {
  it("comes from the type, or the extension when Drive doesn't know it", () => {
    expect(kindOf("application/vnd.openxmlformats-officedocument.presentationml.presentation", "a.pptx")).toBe("slides");
    expect(kindOf("application/octet-stream", "Slides.PPT")).toBe("slides");
    expect(kindOf("application/pdf", "a.pdf")).toBe("pdf");
    expect(kindOf("video/mp4", "a.mp4")).toBe("video");
    expect(kindOf("application/vnd.google-apps.document", "Notes")).toBe("document");
    expect(kindOf("application/zip", "a.zip")).toBe("other");
  });
});

describe("walking the Drive", () => {
  it("lists every folder, page by page, sorted the way people number things", async () => {
    const { fetchImpl } = fakeDrive(classDrive);
    const tree = await crawlDrive(config, fetchImpl, () => 1000);
    expect(tree.complete).toBe(true);
    expect(tree.updatedAt).toBe(1000);
    const block = tree.root.folders[0].folders[0];
    expect(block.folders.map((f) => f.name)).toEqual(["ANATOMY", "UB"]);
    const anatomy = block.folders[0];
    expect(anatomy.files.map((f) => f.name)).toEqual(["L2 - Introduction.pptx", "L13 - Kinesiologi.pptx", "Lecture 1.mp4", "Notes", "TATIB 1.2 .pdf"]);
    expect(anatomy.files[0]).toEqual({
      id: "lecture02file",
      name: "L2 - Introduction.pptx",
      kind: "slides",
      size: 26836841,
      modifiedTime: "2026-10-01T00:00:00Z",
      createdTime: "2026-10-02T00:00:00Z",
    });
    expect(anatomy.files.find((f) => f.name === "Notes")?.size).toBeNull();
  });

  it("follows shortcuts to files but never loops back up the tree", async () => {
    const { fetchImpl, calls } = fakeDrive(classDrive);
    const tree = await crawlDrive(config, fetchImpl);
    const ub = tree.root.folders[0].folders[0].folders[1];
    expect(ub.files).toEqual([expect.objectContaining({ id: "paperelsewhere", name: "UB 2025 paper", kind: "pdf" })]);
    expect(ub.folders).toEqual([]);
    expect(calls.filter((c) => c === "semester0001")).toHaveLength(1);
  });

  it("lists many folders in one request", async () => {
    // A level of 60 folders: three requests of up to 25, not 60.
    const folders: Item[] = Array.from({ length: 60 }, (_, i) => ({ id: `subfolder${String(i).padStart(5, "0")}`, name: `F${i}`, mimeType: FOLDER, parent: ROOT }));
    const wide = [...folders, ...folders.map((f) => ({ id: `${f.id}file`, name: `${f.name}.pdf`, mimeType: "application/pdf", parent: f.id }))];
    const { fetchImpl, requests } = fakeDrive(wide);
    const tree = await crawlDrive(config, fetchImpl);
    expect(tree.root.folders).toHaveLength(60);
    expect(tree.root.folders.every((f) => f.files.length === 1)).toBe(true);
    expect(tree.root.folders.map((f) => f.name).slice(0, 3)).toEqual(["F0", "F1", "F2"]);
    expect(new Set(requests.map((r) => r.join())).size).toBe(4);
    expect(Math.max(...requests.map((r) => r.length))).toBe(25);
  });

  it("keeps going when one folder fails, and says the listing is incomplete", async () => {
    const { fetchImpl } = fakeDrive(classDrive, { fail: new Set(["ubfolder00001"]) });
    const tree = await crawlDrive(config, fetchImpl);
    expect(tree.complete).toBe(false);
    expect(tree.root.folders[0].folders[0].folders[0].files).toHaveLength(5);
  });

  it("fails when the folder itself can't be listed (wrong key, not shared)", async () => {
    const { fetchImpl } = fakeDrive(classDrive);
    await expect(crawlDrive({ ...config, apiKey: "wrong" }, fetchImpl)).rejects.toThrow(/403/);
  });

  it("never sends folder ids to students", async () => {
    const { fetchImpl } = fakeDrive(classDrive);
    const json = JSON.stringify(await crawlDrive(config, fetchImpl));
    for (const id of [ROOT, "semester0001", "block12folder", "anatomyfolder", "ubfolder00001"]) expect(json).not.toContain(id);
  });
});

describe("archives (folders opened on demand)", () => {
  const ARCHIVE = "archiveFolder01";
  const archive: Item[] = [
    { id: ARCHIVE, name: "PENDPRODUKTIF", mimeType: FOLDER, parent: "elsewhere00001" },
    { id: "readmefile0001", name: "Read me.pdf", mimeType: "application/pdf", parent: ARCHIVE },
    { id: "cohort2019abcd", name: "2019", mimeType: FOLDER, parent: ARCHIVE },
    { id: "cohort2020abcd", name: "2020", mimeType: FOLDER, parent: ARCHIVE },
    { id: "deepfolder0001", name: "BLOCK 1.1", mimeType: FOLDER, parent: "cohort2019abcd" },
    { id: "oldpaper00001", name: "UB 1.1.pdf", mimeType: "application/pdf", parent: "deepfolder0001" },
  ];
  const withArchive: DriveConfig = { ...config, onDemand: [ARCHIVE] };

  it("lists the archive at the top with its cohorts, without walking into them", async () => {
    const { fetchImpl, calls } = fakeDrive([...classDrive, ...archive]);
    const tree = await crawlDrive(withArchive, fetchImpl);
    expect(tree.complete).toBe(true);
    expect(tree.root.folders.map((f) => f.name)).toEqual(["PENDPRODUKTIF", "SEMESTER 1"]);
    const top = tree.root.folders[0];
    expect(top.archive).toBe(true);
    expect(top.files.map((f) => f.name)).toEqual(["Read me.pdf"]);
    expect(top.folders).toEqual([
      { name: "2019", folders: [], files: [], deferred: folderKey("cohort2019abcd") },
      { name: "2020", folders: [], files: [], deferred: folderKey("cohort2020abcd") },
    ]);
    expect(calls).not.toContain("cohort2019abcd");
    expect(tree.deferred?.[folderKey("cohort2019abcd")]).toBe("cohort2019abcd");
    // The browser's copy has keys, never the ids.
    const sent = JSON.stringify(publicTree(tree));
    for (const id of [ARCHIVE, "cohort2019abcd", "cohort2020abcd"]) expect(sent).not.toContain(id);
  });

  it("walks a cohort when it's opened, keeps it, and refuses unknown keys", async () => {
    let now = 0;
    const { fetchImpl, calls } = fakeDrive([...classDrive, ...archive]);
    const snapshots = new MemoryDriveSnapshotStore();
    const index = new DriveIndex(withArchive, snapshots, fetchImpl, () => now);
    expect(await index.folder("unknownKey000000")).toBeNull();
    const key = folderKey("cohort2019abcd");
    const cohort = await index.folder(key);
    expect(cohort?.root.folders[0]?.name).toBe("BLOCK 1.1");
    expect(cohort?.root.folders[0]?.files.map((f) => f.name)).toEqual(["UB 1.1.pdf"]);
    expect((await snapshots.load(`folder:${key}`))?.updatedAt).toBe(0);
    const walks = calls.filter((c) => c === "cohort2019abcd").length;
    now = 60_000;
    expect(await index.folder(key)).toBe(cohort);
    expect(calls.filter((c) => c === "cohort2019abcd")).toHaveLength(walks);
  });

  it("treats a shortcut to a folder as an archive: listed one level down, its folders on demand", async () => {
    const linked: Item[] = [
      ...classDrive,
      ...archive,
      { id: "shortcutArch01", name: "PENDPRODUKTIF", mimeType: "application/vnd.google-apps.shortcut", parent: "semester0001", shortcutDetails: { targetId: ARCHIVE, targetMimeType: FOLDER } },
    ];
    const { fetchImpl, calls } = fakeDrive(linked);
    const tree = await crawlDrive(config, fetchImpl);
    const top = tree.root.folders[0].folders.find((f) => f.name === "PENDPRODUKTIF");
    expect(top?.archive).toBe(true);
    expect(top?.files.map((f) => f.name)).toEqual(["Read me.pdf"]);
    expect(top?.folders.map((f) => [f.name, f.deferred])).toEqual([
      ["2019", folderKey("cohort2019abcd")],
      ["2020", folderKey("cohort2020abcd")],
    ]);
    expect(calls).toContain(ARCHIVE);
    expect(calls).not.toContain("cohort2019abcd");
    // Opening a cohort walks it, as for an archive from the settings.
    const index = new DriveIndex(config, new MemoryDriveSnapshotStore(), fetchImpl);
    expect((await index.folder(folderKey("cohort2019abcd")))?.root.folders[0]?.files.map((f) => f.name)).toEqual(["UB 1.1.pdf"]);
  });

  it("still lists the class Drive when an archive can't be read", async () => {
    const { fetchImpl } = fakeDrive(classDrive);
    const tree = await crawlDrive(withArchive, fetchImpl);
    expect(tree.complete).toBe(false);
    expect(tree.root.folders.map((f) => f.name)).toEqual(["SEMESTER 1"]);
  });
});

describe("the listing students get", () => {
  it("is reused until it is a few minutes old, then read again", async () => {
    let now = 0;
    const items = [...classDrive];
    const { fetchImpl } = fakeDrive(items);
    const index = new DriveIndex(config, new MemoryDriveSnapshotStore(), fetchImpl, () => now);
    const first = await index.tree();
    now = 60_000;
    expect(await index.tree()).toBe(first);
    // A new file in Drive appears once the listing is stale.
    items.push({ id: "lecture20file", name: "L20 - New.pptx", mimeType: "application/pdf", parent: "anatomyfolder" });
    now = 6 * 60_000;
    const second = await index.tree();
    expect(second).not.toBe(first);
    expect(second.root.folders[0].folders[0].folders[0].files.map((f) => f.name)).toContain("L20 - New.pptx");
  });

  it("starts from the saved listing after a cold start, and saves each new one", async () => {
    const snapshots = new MemoryDriveSnapshotStore();
    const { fetchImpl } = fakeDrive(classDrive);
    const saved = await crawlDrive(config, fetchImpl, () => 0);
    await snapshots.save(saved);
    const { fetchImpl: neverCalled, calls } = fakeDrive(classDrive);
    const index = new DriveIndex(config, snapshots, neverCalled, () => 60_000);
    expect(await index.tree()).toEqual(saved);
    expect(calls).toHaveLength(0);

    const refreshed = await new DriveIndex(config, snapshots, fetchImpl, () => 10 * 60_000).tree();
    expect(refreshed.updatedAt).toBe(10 * 60_000);
    expect((await snapshots.load())?.updatedAt).toBe(10 * 60_000);
  });

  it("keeps serving the last listing while Drive is failing, without hammering it", async () => {
    let now = 0;
    const fail = new Set<string>();
    const { fetchImpl, calls } = fakeDrive(classDrive, { fail });
    const index = new DriveIndex(config, new MemoryDriveSnapshotStore(), fetchImpl, () => now);
    const good = await index.tree();
    fail.add(ROOT);
    vi.spyOn(console, "error").mockImplementation(() => {});
    now = 10 * 60_000;
    expect(await index.tree()).toBe(good);
    const before = calls.length;
    now += 5_000;
    expect(await index.tree()).toBe(good);
    expect(calls.length).toBe(before);
  });

  it("lets a student refresh, but not more than every half minute", async () => {
    let now = 0;
    const { fetchImpl, calls } = fakeDrive(classDrive);
    const index = new DriveIndex(config, new MemoryDriveSnapshotStore(), fetchImpl, () => now);
    await index.tree();
    const walked = calls.length;
    now = 10_000;
    await index.tree({ refresh: true });
    expect(calls.length).toBe(walked);
    now = 40_000;
    await index.tree({ refresh: true });
    expect(calls.length).toBe(walked * 2);
  });

  it("walks once when many students ask at the same time", async () => {
    const { fetchImpl, calls } = fakeDrive(classDrive);
    const index = new DriveIndex(config, new MemoryDriveSnapshotStore(), fetchImpl);
    const trees = await Promise.all([index.tree(), index.tree(), index.tree()]);
    expect(trees[1]).toBe(trees[0]);
    expect(calls.filter((c) => c === ROOT)).toHaveLength(1);
  });
});
