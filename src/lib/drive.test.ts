import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addedWhen, blockFolderPath, blockIdOf, CACHED_FOLDERS, graftFolders, waitingFolders, waitingOnPath, withFolder, type DriveCache, changedAt, countFiles, driveHref, fileGroups, filesUnder, fileTitle, folderAt, forgetDriveCache, formatSize, isNew, placeLabel, isSubjectFolder, niceName, readDriveCache, searchDrive, sortFiles, subjectFolderPath, updatedAgo, writeDriveCache } from "./drive";
import type { DriveFile, DriveFolder, DriveTree } from "./driveTypes";

const file = (id: string, name: string): DriveFile => ({ id, name, kind: "slides", size: 1000, modifiedTime: "" });
const folder = (name: string, folders: DriveFolder[] = [], files: DriveFile[] = []): DriveFolder => ({ name, folders, files });

const root = folder("", [
  folder("SEMESTER 1", [
    folder("BLOCK 1.1 CELL BIOLOGY AND HEMATOLOGY", [folder("BIOCHEMISTRY", [], [file("bio1", "Enzymes.pptx")]), folder("EXAMS", [folder("UB", [], [file("ub1", "UB 2025.pdf")])])]),
    folder("BLOCK 1.2 INTEGUMEN SYSTEM AND MUSKOLOSKELETAL", [
      folder("ANATOMY", [
        folder("LECTURE", [folder("PPTs", [], [file("l2", "L2 - Intro.pptx")]), folder("RECORDINGS")]),
        folder("PRACTICUM", [folder("PPTs", [], [file("p1", "P1.pptx")])], [file("tatib", "TATIB 1.2 .pdf")]),
      ]),
    ]),
    folder("SKILLS", [], [file("sk", "Handwashing.pdf")]),
  ]),
]);

describe("finding folders in the class Drive", () => {
  it("reads the block id from a block folder's name", () => {
    expect(blockIdOf("BLOCK 1.2 INTEGUMEN SYSTEM AND MUSKOLOSKELETAL")).toBe("1.2");
    expect(blockIdOf("Block 1.10 Something")).toBe("1.10");
    expect(blockIdOf("SKILLS")).toBeNull();
  });

  it("matches subject folders by name, in English or Indonesian", () => {
    expect(isSubjectFolder("BIOCHEMISTRY", "biochem")).toBe(true);
    expect(isSubjectFolder("Biokimia", "biochem")).toBe(true);
    expect(isSubjectFolder("ANATOMI", "anatomy")).toBe(true);
    expect(isSubjectFolder("PHYSIOLOGY", "anatomy")).toBe(false);
    expect(isSubjectFolder("constructor", "constructor")).toBe(true);
  });

  it("finds a subject's folder inside its block, at any depth", () => {
    expect(subjectFolderPath(root, "1.2", "anatomy")).toEqual(["SEMESTER 1", "BLOCK 1.2 INTEGUMEN SYSTEM AND MUSKOLOSKELETAL", "ANATOMY"]);
    expect(subjectFolderPath(root, "1.1", "biochem")?.at(-1)).toBe("BIOCHEMISTRY");
    expect(subjectFolderPath(root, "1.2", "biochem")).toBeNull();
    expect(subjectFolderPath(root, "9.9", "anatomy")).toBeNull();
    expect(folderAt(root, ["SEMESTER 1", "nope"])).toBeNull();
  });

  it("groups a subject's files by the folder they're in", () => {
    const anatomy = folderAt(root, subjectFolderPath(root, "1.2", "anatomy") ?? []);
    expect(anatomy && countFiles(anatomy)).toBe(3);
    expect(anatomy && fileGroups(anatomy).map((g) => [g.label, g.files.map((f) => f.id)])).toEqual([
      ["Lecture · PPTs", ["l2"]],
      ["Practicum", ["tatib"]],
      ["Practicum · PPTs", ["p1"]],
    ]);
  });
});

describe("Drive labels and links", () => {
  it("tidies shouted folder names but keeps abbreviations", () => {
    expect(niceName("BLOCK 1.2 INTEGUMEN SYSTEM AND MUSKOLOSKELETAL")).toBe("Block 1.2 Integumen System and Muskoloskeletal");
    expect(niceName("UB 1.2 ASTERION 2025")).toBe("UB 1.2 Asterion 2025");
    expect(niceName("PPTs")).toBe("PPTs");
    expect(fileTitle("L2 - Intro.pptx")).toBe("L2 - Intro");
    expect(placeLabel(["SEMESTER 1", "BLOCK 1.2 INTEGUMEN SYSTEM", "ANATOMY", "LECTURE", "PPTs"])).toBe("Block 1.2 › Anatomy › Lecture");
    expect(placeLabel(["SEMESTER 1"])).toBe("Class Drive");
    expect(fileTitle("Anatomy_Cranium__Trunk.pptx")).toBe("Anatomy Cranium Trunk");
  });

  it("links to a folder by its names, and a file in it", () => {
    expect(driveHref([])).toBe("/drive");
    expect(driveHref(["SEMESTER 1", "A&B"], "id1")).toBe("/drive?f=SEMESTER+1&f=A%26B&file=id1");
  });

  it("formats sizes and ages", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize(500)).toBe("1 KB");
    expect(formatSize(7_404_733)).toBe("7.1 MB");
    expect(formatSize(26_836_841)).toBe("26 MB");
    expect(updatedAgo(0, 30_000)).toBe("just now");
    expect(updatedAgo(0, 4 * 60_000)).toBe("4 min ago");
    expect(updatedAgo(0, 3 * 3_600_000)).toBe("3 h ago");
  });
});

describe("new files", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-10-06T12:00:00Z");
  const dated = (id: string, created: string, modified = "2020-01-01T00:00:00Z"): DriveFile => ({ ...file(id, `${id}.pdf`), createdTime: created, modifiedTime: modified });

  it("counts from when a file was put in the Drive, even if it kept an older date", () => {
    expect(changedAt(dated("a", "2026-10-05T00:00:00Z"))).toBe(Date.parse("2026-10-05T00:00:00Z"));
    expect(changedAt({ ...file("b", "b.pdf"), modifiedTime: "" })).toBe(0);
  });

  it("are new for a week, until they're opened", () => {
    const fresh = dated("fresh", "2026-10-04T00:00:00Z");
    const old = dated("old", "2026-09-20T00:00:00Z");
    expect(isNew(fresh, new Set(), now)).toBe(true);
    expect(isNew(fresh, new Set(["fresh"]), now)).toBe(false);
    expect(isNew(old, new Set(), now)).toBe(false);
    expect(now - changedAt(fresh)).toBeLessThan(7 * DAY);
  });

  it("can be listed newest first", () => {
    const files = [dated("x", "2026-09-01T00:00:00Z"), dated("y", "2026-10-01T00:00:00Z"), dated("z", "2026-09-15T00:00:00Z")];
    expect(sortFiles(files, "newest").map((f) => f.id)).toEqual(["y", "z", "x"]);
    expect(sortFiles(files, "name").map((f) => f.id)).toEqual(["x", "y", "z"]);
  });

  it("say when they were added", () => {
    expect(addedWhen(now - 60_000, now)).toBe("today");
    expect(addedWhen(now - DAY, now)).toBe("yesterday");
    expect(addedWhen(now - 3 * DAY, now)).toBe("3 days ago");
    expect(addedWhen(0, now)).toBe("");
  });

  it("are counted per folder once", () => {
    expect(filesUnder(root)).toBe(filesUnder(root));
    expect(countFiles(root)).toBe(6);
  });
});

describe("finding files", () => {
  const items = [
    { item: "ub", name: "UB 2025", path: ["Semester 1", "Block 1.2", "Exams", "UB"] },
    { item: "l2", name: "L2 - Introduction to Anatomy", path: ["Semester 1", "Block 1.2", "Anatomy"] },
    { item: "fis", name: "Fisiologi Otot", path: ["Semester 1", "Block 1.2", "Physiology"] },
  ];

  it("needs every word, in the name or the folders it's in", () => {
    expect(searchDrive(items, "ub 1.2").matches.map((m) => m.item)).toEqual(["ub"]);
    expect(searchDrive(items, "anatomy intro").matches.map((m) => m.item)).toEqual(["l2"]);
    expect(searchDrive(items, "nothing like this").total).toBe(0);
    expect(searchDrive(items, "  ").total).toBe(0);
  });

  it("puts name matches first and marks where the words are", () => {
    const { matches } = searchDrive(items, "anatomy");
    expect(matches.at(0)?.item).toBe("l2");
    expect(matches.at(0)?.ranges).toEqual([[21, 27]]);
  });

  it("ignores case and accents", () => {
    expect(searchDrive([{ item: "x", name: "Fisiología", path: [] }], "FISIOLOGIA").total).toBe(1);
  });
});

describe("the listing kept on the device", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, v); },
        removeItem: (k: string) => { data.delete(k); },
      },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("belongs to one account and goes on sign-out", () => {
    const tree = { root, updatedAt: 1, complete: true };
    writeDriveCache({ userId: "u1", etag: '"drive-1-1"', tree });
    expect(readDriveCache("u1")?.etag).toBe('"drive-1-1"');
    expect(readDriveCache("u2")).toBeNull();
    forgetDriveCache();
    expect(readDriveCache("u1")).toBeNull();
  });
});

describe("archive folders", () => {
  const archiveTree = (): DriveFolder => ({
    name: "",
    files: [],
    folders: [
      {
        name: "PENDPRODUKTIF",
        archive: true,
        files: [],
        folders: [
          { name: "2019", folders: [], files: [], deferred: "key2019aaaaaaaaa" },
          { name: "2020", folders: [], files: [], deferred: "key2020aaaaaaaaa" },
        ],
      },
      { name: "SEMESTER 1", files: [], folders: [{ name: "BLOCK 1.2 INTEGUMEN", files: [], folders: [] }] },
    ],
  });
  const cohort: DriveTree = {
    root: { name: "", files: [], folders: [{ name: "BLOCK 1.1", folders: [], files: [{ id: "old1", name: "UB.pdf", kind: "pdf", size: 1, modifiedTime: "" }] }] },
    updatedAt: 1,
    complete: true,
  };

  it("fills opened cohorts in, leaving everything else as it was", () => {
    const root = archiveTree();
    const grafted = graftFolders(root, { key2019aaaaaaaaa: { tree: cohort } });
    const opened = grafted.folders[0].folders[0];
    expect(opened).toMatchObject({ name: "2019", deferred: "key2019aaaaaaaaa", loaded: true });
    expect(opened.folders[0].files[0].name).toBe("UB.pdf");
    expect(grafted.folders[1]).toBe(root.folders[1]);
    expect(graftFolders(root, {})).toBe(root);
  });

  it("knows which cohorts are still waiting, and which one a path needs", () => {
    const grafted = graftFolders(archiveTree(), { key2019aaaaaaaaa: { tree: cohort } });
    expect(waitingFolders(grafted).map((w) => w.folder.name)).toEqual(["2020"]);
    expect(waitingOnPath(grafted, ["PENDPRODUKTIF", "2020", "BLOCK 1.1"])).toEqual({ key: "key2020aaaaaaaaa", depth: 2 });
    expect(waitingOnPath(grafted, ["PENDPRODUKTIF", "2019", "BLOCK 1.1"])).toBeNull();
  });

  it("never takes this year's block folder from an archive", () => {
    const root = archiveTree();
    root.folders[0].folders.push({ name: "BLOCK 1.2 OLD", folders: [], files: [] });
    expect(blockFolderPath(root, "1.2")).toEqual(["SEMESTER 1", "BLOCK 1.2 INTEGUMEN"]);
  });

  it("keeps only the most recently opened cohorts on the device", () => {
    let cache: DriveCache = { userId: "u", etag: null, tree: { root: archiveTree(), updatedAt: 0, complete: true } };
    for (let i = 0; i < CACHED_FOLDERS + 2; i++) cache = withFolder(cache, `k${i}`, { etag: null, tree: cohort, openedAt: i });
    expect(Object.keys(cache.folders ?? {}).sort()).toEqual(["k2", "k3", "k4", "k5"]);
  });
});
