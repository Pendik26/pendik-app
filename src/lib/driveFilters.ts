import type { DriveFile } from "./driveTypes";

// Filters for the Class Drive by where a file sits in the folders:
//   [SEMESTER n /] [REGULER | IUP /] BLOK x.y <name> / <category> / [<subject> / ...] <file>
// The same reading the Drive sync uses (server/drivePath.ts), so a file is filtered by the
// block, category and subject its row has in the database.

export interface DriveFilter {
  block: string;
  category: string;
  subject: string;
}

export const NO_DRIVE_FILTER: DriveFilter = { block: "", category: "", subject: "" };

export const isFiltering = (f: DriveFilter): boolean => Boolean(f.block || f.category || f.subject);

export interface DrivePlace {
  block: string | null;
  blockName: string | null;
  category: string | null;
  subject: string | null;
}

const SEMESTER = /^semester\s*([0-9]{1,2})\b/i;
const TRACK = /^(reguler|regular|iup)$/i;
const BLOCK = /^blo(?:k|ck)\s*([0-9]{1,2})\s*[.,]\s*([0-9]{1,2})\s*[-–:]?\s*(.*)$/i;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** The block, category and subject for the folders a file is in. */
export function placeOf(folders: readonly string[]): DrivePlace {
  const place: DrivePlace = { block: null, blockName: null, category: null, subject: null };
  let i = 0;
  if (SEMESTER.test(folders[i] ?? "")) i++;
  if (TRACK.test((folders[i] ?? "").trim())) i++;
  const block = (folders[i] ?? "").trim().match(BLOCK);
  if (!block) return place;
  place.block = `${Number(block[1])}.${Number(block[2])}`;
  place.blockName = tidy(block[3]) || null;
  place.category = folders[i + 1] ? tidy(folders[i + 1]) : null;
  place.subject = folders[i + 2] ? tidy(folders[i + 2]) : null;
  return place;
}

export interface PlacedFile {
  file: DriveFile;
  path: string[];
}

const matches = (p: DrivePlace, f: DriveFilter) =>
  (!f.block || p.block === f.block) && (!f.category || p.category === f.category) && (!f.subject || p.subject === f.subject);

/** The files that sit in the chosen block, category and subject. */
export function filterDriveFiles<T extends { path: string[] }>(files: readonly T[], f: DriveFilter): T[] {
  if (!isFiltering(f)) return [...files];
  return files.filter((x) => matches(placeOf(x.path), f));
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export interface DriveFilterOptions {
  blocks: { id: string; name: string | null }[];
  categories: string[];
  subjects: string[];
}

/**
 * What each dropdown offers. They narrow one another: the categories are the ones in the chosen
 * block, the subjects the ones in the chosen block and category. So a combination with no files
 * can't be picked.
 */
export function driveFilterOptions<T extends { path: string[] }>(files: readonly T[], f: DriveFilter): DriveFilterOptions {
  const placed = files.map((x) => placeOf(x.path));
  const blocks = new Map<string, string | null>();
  for (const p of placed) if (p.block && !blocks.has(p.block)) blocks.set(p.block, p.blockName);
  const inBlock = placed.filter((p) => !f.block || p.block === f.block);
  const categories = new Set(inBlock.flatMap((p) => (p.category ? [p.category] : [])));
  const inCategory = inBlock.filter((p) => !f.category || p.category === f.category);
  const subjects = new Set(inCategory.flatMap((p) => (p.subject ? [p.subject] : [])));
  return {
    blocks: [...blocks].map(([id, name]) => ({ id, name })).sort((a, b) => natural(a.id, b.id)),
    categories: [...categories].sort(natural),
    subjects: [...subjects].sort(natural),
  };
}

/** A filter whose parts are still among the options (a part that isn't is cleared). */
export function cleanFilter<T extends { path: string[] }>(files: readonly T[], f: DriveFilter): DriveFilter {
  const block = driveFilterOptions(files, NO_DRIVE_FILTER).blocks.some((b) => b.id === f.block) ? f.block : "";
  const category = driveFilterOptions(files, { ...NO_DRIVE_FILTER, block }).categories.includes(f.category) ? f.category : "";
  const subject = driveFilterOptions(files, { block, category, subject: "" }).subjects.includes(f.subject) ? f.subject : "";
  return { block, category, subject };
}
