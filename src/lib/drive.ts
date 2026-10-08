import { englishT, type Translate } from "../i18n/i18n";
import type { DriveFile, DriveFileKind, DriveFolder, DriveTree } from "./driveTypes";

// The class Google Drive, as the `drive-sync` Edge Function copies it into the `drive_files`
// table: building the folder tree from it, and finding a block's or subject's folder in it by name
// ("BLOCK 1.2 …" / "ANATOMY").

/** A row of the `drive_files` table, as the app reads it. */
export interface DriveFileRow {
  drive_file_id: string;
  title: string;
  kind: string;
  folder_path: string[] | null;
  size_bytes: number | null;
  drive_modified_at: string | null;
  created_at: string;
  synced_at: string;
}

const KINDS: Record<string, DriveFileKind> = {
  slide: "slides",
  pdf: "pdf",
  video: "video",
  youtube: "video",
  audio: "audio",
  doc: "document",
  sheet: "sheet",
  image: "image",
};

/** The folder tree the Class Drive pages show, built from the synced file rows' folder paths. */
export function treeFromRows(rows: readonly DriveFileRow[]): DriveTree {
  const root: DriveFolder = { name: "", folders: [], files: [] };
  let updatedAt = 0;
  for (const row of rows) {
    let folder = root;
    for (const name of row.folder_path ?? []) {
      let next = folder.folders.find((f) => f.name === name);
      if (!next) {
        next = { name, folders: [], files: [] };
        folder.folders.push(next);
      }
      folder = next;
    }
    folder.files.push({
      id: row.drive_file_id,
      name: row.title,
      kind: KINDS[row.kind] ?? "other",
      size: row.size_bytes,
      modifiedTime: row.drive_modified_at ?? row.created_at,
      createdTime: row.created_at,
    });
    updatedAt = Math.max(updatedAt, Date.parse(row.synced_at) || 0);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const sort = (f: DriveFolder) => {
    f.folders.sort(byName);
    f.files.sort(byName);
    f.folders.forEach(sort);
  };
  sort(root);
  return { root, updatedAt, complete: true };
}

/** Along a path, the first folder whose contents haven't been loaded. The synced listing has none. */
export function waitingOnPath(root: DriveFolder, path: readonly string[]): { key: string; depth: number } | null {
  let folder: DriveFolder | undefined = root;
  for (const [i, name] of path.entries()) {
    folder = folder.folders.find((f) => f.name === name);
    if (!folder) return null;
    if (folder.deferred && !folder.loaded) return { key: folder.deferred, depth: i + 1 };
  }
  return null;
}

/** Every folder under a folder that hasn't been loaded yet. The synced listing has none. */
export function waitingFolders(root: DriveFolder): { folder: DriveFolder; path: string[] }[] {
  return allFolders(root).filter(({ folder }) => folder.deferred && !folder.loaded);
}

/** The folder at a path of folder names from the top, or null. */
export function folderAt(root: DriveFolder, path: readonly string[]): DriveFolder | null {
  let folder: DriveFolder | undefined = root;
  for (const name of path) {
    folder = folder.folders.find((f) => f.name === name);
    if (!folder) return null;
  }
  return folder;
}

/** The path (folder names) to the first folder, depth first, that matches. */
export function findFolderPath(root: DriveFolder, matches: (folder: DriveFolder) => boolean, maxDepth = 4): string[] | null {
  const walk = (folder: DriveFolder, path: string[]): string[] | null => {
    // Past cohorts' archives aren't where this year's blocks are.
    for (const child of folder.folders) {
      if (child.archive) continue;
      const childPath = [...path, child.name];
      if (matches(child)) return childPath;
    }
    if (path.length >= maxDepth) return null;
    for (const child of folder.folders) {
      if (child.archive) continue;
      const found = walk(child, [...path, child.name]);
      if (found) return found;
    }
    return null;
  };
  return walk(root, []);
}

/** "BLOCK 1.2 INTEGUMEN SYSTEM…" → "1.2". */
export function blockIdOf(folderName: string): string | null {
  return /\bblock\s*(\d+(?:\.\d+)+)/i.exec(folderName)?.[1] ?? null;
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Folder names a subject goes by, in English and Indonesian. */
const SUBJECT_NAMES = new Map([
  ["anatomy", ["anatomy", "anatomi"]],
  ["physiology", ["physiology", "fisiologi"]],
  ["histology", ["histology", "histologi"]],
  ["biochem", ["biochem", "biochemistry", "biokimia"]],
]);

export function isSubjectFolder(folderName: string, subjectId: string): boolean {
  const name = letters(folderName);
  const names = SUBJECT_NAMES.get(subjectId) ?? [subjectId];
  return names.some((n) => letters(n) === name);
}

export function blockFolderPath(root: DriveFolder, blockId: string): string[] | null {
  return findFolderPath(root, (f) => blockIdOf(f.name) === blockId);
}

/** The path to a subject's folder inside its block's folder. */
export function subjectFolderPath(root: DriveFolder, blockId: string, subjectId: string): string[] | null {
  const blockPath = blockFolderPath(root, blockId);
  const block = blockPath && folderAt(root, blockPath);
  if (!blockPath || !block) return null;
  const subject = block.folders.find((f) => isSubjectFolder(f.name, subjectId));
  return subject ? [...blockPath, subject.name] : null;
}

// A listing never changes once loaded (a new one is a new object), so what's under each folder
// is worked out once and kept with it.
const under = new WeakMap<DriveFolder, DriveFile[]>();

/** Every file in a folder and its subfolders. */
export function filesUnder(folder: DriveFolder): DriveFile[] {
  let files = under.get(folder);
  if (!files) {
    files = [...folder.files, ...folder.folders.flatMap(filesUnder)];
    under.set(folder, files);
  }
  return files;
}

export function countFiles(folder: DriveFolder): number {
  return filesUnder(folder).length;
}

/** When a file was put in the Drive or last changed, whichever is later (ms; 0 if unknown). */
export function changedAt(file: DriveFile): number {
  const times = [file.createdTime, file.modifiedTime].map((t) => (t ? Date.parse(t) : 0));
  return Math.max(0, ...times.filter((t) => Number.isFinite(t)));
}

/** Files count as new for a week after they're added or changed. */
export const NEW_FOR_MS = 7 * 86_400_000;

export function isNew(file: DriveFile, opened: ReadonlySet<string>, now: number = Date.now()): boolean {
  return !opened.has(file.id) && now - changedAt(file) < NEW_FOR_MS;
}

/** Every folder under a folder, with its path. */
export function allFolders(folder: DriveFolder, path: string[] = []): { folder: DriveFolder; path: string[] }[] {
  return folder.folders.flatMap((f) => [{ folder: f, path: [...path, f.name] }, ...allFolders(f, [...path, f.name])]);
}

export type DriveSort = "name" | "newest";

/** A folder's files in the chosen order (the listing comes sorted by name). */
export function sortFiles(files: readonly DriveFile[], sort: DriveSort): DriveFile[] {
  return sort === "newest" ? [...files].sort((a, b) => changedAt(b) - changedAt(a)) : [...files];
}

/** Lower case, without accents, for matching what's typed against names. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface DriveMatch<T> {
  item: T;
  path: string[];
  /** Where the words were found in the shown name, for highlighting ([start, end], inclusive). */
  ranges: [number, number][];
}

/**
 * Items whose name, or the folders they're in, contain every word typed ("ub 1.2" finds
 * "UB 1.2 2025.pdf"). Name matches come first.
 */
export function searchDrive<T>(items: { item: T; name: string; path: string[] }[], query: string, limit = 80): { matches: DriveMatch<T>[]; total: number } {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { matches: [], total: 0 };
  const scored: { m: DriveMatch<T>; score: number }[] = [];
  for (const { item, name, path } of items) {
    const shown = fold(name);
    const where = fold(path.join(" "));
    if (!words.every((w) => shown.includes(w) || where.includes(w))) continue;
    const ranges: [number, number][] = [];
    let inName = 0;
    for (const w of words) {
      const at = shown.indexOf(w);
      if (at >= 0) {
        inName += 1;
        ranges.push([at, at + w.length - 1]);
      }
    }
    scored.push({ m: { item, path, ranges }, score: inName * 10 - path.length });
  }
  scored.sort((a, b) => b.score - a.score);
  return { matches: scored.slice(0, limit).map((s) => s.m), total: scored.length };
}

export interface DriveFileGroup {
  /** The subfolders the files are in, from the folder looked at ("Lecture · PPTs"); "" for its own. */
  label: string;
  path: string[];
  files: DriveFile[];
}

/** A folder's files grouped by the subfolder they're in, top to bottom. */
export function fileGroups(folder: DriveFolder, path: string[] = []): DriveFileGroup[] {
  const own = folder.files.length ? [{ label: path.map(niceName).join(" · "), path, files: folder.files }] : [];
  return [...own, ...folder.folders.flatMap((f) => fileGroups(f, [...path, f.name]))];
}

/** Every file under a folder, with the folder path it's in. */
export function allFiles(folder: DriveFolder, path: string[] = []): { file: DriveFile; path: string[] }[] {
  return [...folder.files.map((file) => ({ file, path })), ...folder.folders.flatMap((f) => allFiles(f, [...path, f.name]))];
}

/** "PRACTICUM" → "Practicum"; names with lower case letters are left as they are. */
export function niceName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase())
    // Small words stay small, abbreviations in capitals: UB (ujian blok), the faculty's names.
    .replace(/(?<=\s)(And|Of|The|In|On|For|To|Dan|Di)(?=\s)/g, (w) => w.toLowerCase())
    .replace(/\b(Ub|Iup|Fk|Uns|Osce|Csl|Ppt|Pdf)\b/g, (w) => w.toUpperCase());
}

/**
 * Where something is, briefly: "Block 1.2 › Anatomy › Lecture" for
 * SEMESTER 1/BLOCK 1.2 INTEGUMEN…/ANATOMY/LECTURE/PPTs. The semester and "PPTs" folders say
 * nothing a student needs, and a block folder's long name becomes its number.
 */
export function placeLabel(path: readonly string[], t: Translate = englishT): string {
  const parts = path
    .filter((name) => !/^(semester|smt)\b/i.test(name.trim()) && !/^ppts?$/i.test(name.trim()))
    .map((name) => {
      const block = blockIdOf(name);
      return block ? t("drive.block", { block }) : niceName(name);
    });
  return parts.join(" › ") || t("drive.title");
}

/** The file name without its extension, for lists. */
export function fileTitle(name: string): string {
  return name
    .replace(/\.(pptx?|pdf|docx?|xlsx?|mp4|mov|m4a|mp3|key|odp)$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The Class Drive page at a folder (by folder names), optionally with a file open. */
export function driveHref(path: readonly string[], fileId?: string): string {
  const params = new URLSearchParams();
  for (const name of path) params.append("f", name);
  if (fileId) params.set("file", fileId);
  const qs = params.toString();
  return qs ? `/drive?${qs}` : "/drive";
}

/** A video a Doc in the Drive links to is listed as "youtube:<doc id>:<video id>". */
export function youtubeVideoId(id: string): string | null {
  const m = /^youtube:[^:]+:([A-Za-z0-9_-]{11})$/.exec(id);
  return m ? m[1] : null;
}

export function drivePreviewUrl(id: string): string {
  const video = youtubeVideoId(id);
  if (video) return `https://www.youtube-nocookie.com/embed/${video}`;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}
export function driveViewUrl(id: string): string {
  const video = youtubeVideoId(id);
  if (video) return `https://www.youtube.com/watch?v=${video}`;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}
/** Null for a YouTube video, which can't be downloaded. */
export function driveDownloadUrl(id: string): string | null {
  if (youtubeVideoId(id)) return null;
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

/** "today", "yesterday", "3 days ago", or the date. */
export function addedWhen(at: number, now: number = Date.now(), t: Translate = englishT): string {
  if (!at) return "";
  const day = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / 86_400_000);
  const days = day(now) - day(at);
  if (days <= 0) return t("drive.today");
  if (days === 1) return t("drive.yesterday");
  if (days < 7) return t("drive.daysAgo", { count: days });
  return new Date(at).toLocaleDateString(t("drive.dateLocale"), { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** "just now", "4 min ago", "2 h ago". */
export function updatedAgo(at: number, now: number = Date.now(), t: Translate = englishT): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t("drive.justNow");
  if (minutes < 60) return t("drive.minAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? t("drive.hoursAgo", { count: hours }) : t("drive.daysAgoShort", { count: Math.floor(hours / 24) });
}

const KIND_LABELS = {
  folder: "drive.kindFolder",
  slides: "drive.kindSlides",
  pdf: "drive.kindPdf",
  video: "drive.kindVideo",
  audio: "drive.kindAudio",
  document: "drive.kindDocument",
  sheet: "drive.kindSheet",
  image: "drive.kindImage",
  other: "drive.kindOther",
} as const satisfies Record<DriveFileKind | "folder", string>;

export const kindLabel = (kind: DriveFileKind | "folder", t: Translate = englishT): string => t(KIND_LABELS[kind]);

/** "PPT · 26 MB · added 3 days ago". */
export function fileFacts(file: DriveFile, now?: number, t: Translate = englishT): string {
  const when = addedWhen(changedAt(file), now, t);
  return [kindLabel(file.kind, t), formatSize(file.size), when && t("drive.added", { when })].filter(Boolean).join(" · ");
}
