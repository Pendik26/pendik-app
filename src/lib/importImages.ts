// The pictures of an import: a question file can name a picture it doesn't have yet as
// ![what it shows](upload:label). The import screen lists each label as a slot to fill; once a
// picture is uploaded, the label is swapped for its path before the file is checked and saved.

const SLOT = /\]\(upload:([^)\s]+)\)/g;

/** The labels waiting for a picture, in the order the file first names them. */
export function imageSlots(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SLOT)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Labels the file names more than once: usually a copy-paste slip, since each gets one picture. */
export function repeatedSlots(text: string): string[] {
  const seen = new Map<string, number>();
  for (const m of text.matchAll(SLOT)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([label]) => label);
}

/** The text with every uploaded label replaced by its picture's path. */
export function fillSlots(text: string, uploaded: Readonly<Record<string, string>>): string {
  return text.replace(SLOT, (whole, label: string) => (Object.hasOwn(uploaded, label) ? `](${uploaded[label]})` : whole));
}

/** The longest side kept, in pixels; bigger pictures are shrunk. */
export const MAX_SIDE = 1600;
const QUALITY = 0.92;

/** The size a picture is shown at after shrinking so its longest side is at most `max` (never enlarged). */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A picture file as WebP (shrunk to MAX_SIDE), done in the browser so the server stores something small. */
export async function toWebp(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/webp", QUALITY); });
  if (!blob || blob.type !== "image/webp") throw new Error("no_webp");
  return blob;
}

/** Sends a picture to the server; returns the path a question stores. */
export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const res = await fetch(`/api/question-image?name=${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  const data = (await res.json().catch(() => null)) as { data?: { path?: string }; error?: string } | null;
  if (!res.ok || !data?.data?.path) throw new Error(data?.error ?? "server_error");
  return data.data.path;
}
