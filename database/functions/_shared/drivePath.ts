// How a file's place in the class Drive becomes its block, category and subject, what kind of
// file it is, and which YouTube videos a Google Doc links to. Import-free (Deno and the tests).
//
// The class Drive is laid out as
//   [SEMESTER n /] [REGULER | IUP /] BLOK x.y <name> / <category> / [<subject> / ...] <file>
// and anything that doesn't fit is still listed, just without a block.

export interface DrivePlace {
  semester: number | null;
  track: "REGULER" | "IUP" | null;
  block: string | null;
  blockName: string | null;
  category: string | null;
  subject: string | null;
}

const SEMESTER = /^semester\s*([0-9]{1,2})\b/i;
const TRACK = /^(reguler|regular|iup)$/i;
// "BLOK 1.1 Biomedik", "Blok 2,3 - Kardio", "BLOCK 1.2"
const BLOCK = /^blo(?:k|ck)\s*([0-9]{1,2})\s*[.,]\s*([0-9]{1,2})\s*[-–:]?\s*(.*)$/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Reads the folder names from the class folder down to the file. */
export function placeOf(folders: readonly string[]): DrivePlace {
  const place: DrivePlace = { semester: null, track: null, block: null, blockName: null, category: null, subject: null };
  let i = 0;
  const semester = folders[i]?.match(SEMESTER);
  if (semester) {
    place.semester = Number(semester[1]);
    i++;
  }
  const track = folders[i]?.trim().match(TRACK);
  if (track) {
    place.track = track[1].toLowerCase() === "iup" ? "IUP" : "REGULER";
    i++;
  }
  const block = folders[i]?.trim().match(BLOCK);
  if (!block) return place;
  place.block = `${Number(block[1])}.${Number(block[2])}`;
  place.blockName = tidy(block[3]) || null;
  if (place.semester === null) place.semester = Number(block[1]) * 2 - 1;
  place.category = folders[i + 1] ? tidy(folders[i + 1]) : null;
  place.subject = folders[i + 2] ? tidy(folders[i + 2]) : null;
  return place;
}

/** The kinds the app knows (drive_files.kind). */
export type DriveKind = "pdf" | "slide" | "doc" | "sheet" | "video" | "audio" | "image" | "youtube" | "file";

export function kindOf(mimeType: string, name: string): DriveKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") || ["ppt", "pptx", "key", "odp"].includes(ext)) return "slide";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (mimeType.includes("document") || mimeType.includes("msword") || mimeType.startsWith("text/") || ["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "file";
}

const YOUTUBE =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/g;

/** The YouTube videos a text links to, in order, each once. */
export function youtubeIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(YOUTUBE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The row id of a video a Doc links to: tied to the Doc, so its rows go when the Doc does. */
export const youtubeRowId = (docId: string, videoId: string) => `youtube:${docId}:${videoId}`;
