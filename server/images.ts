import { Binary } from "mongodb";
import { randomUUID } from "node:crypto";
import { ApiError } from "./context.js";
import type { Collections } from "./db.js";

// Question pictures an admin uploads while importing: stored in the database, shown to signed-in
// students at /api/question-image/<id>. The browser turns every picture into WebP first, and the
// server checks what it is from the file's first bytes, never from what the upload says it is.

/** Biggest picture stored. A 1600 px wide WebP is far smaller. */
export const MAX_IMAGE_BYTES = 1_500_000;

export type ImageType = "image/webp" | "image/png" | "image/jpeg";

/** What an image file is, from its first bytes; null for anything else (an SVG could run script, so it isn't stored). */
export function imageTypeOf(bytes: Uint8Array): ImageType | null {
  const is = (at: number, ...sig: number[]) => sig.every((b, i) => bytes[at + i] === b);
  if (bytes.length >= 12 && is(0, 0x52, 0x49, 0x46, 0x46) && is(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (bytes.length >= 8 && is(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 3 && is(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

/** Where a stored picture is shown, as a question stores it: no leading slash. */
export const imagePathOf = (id: string) => `api/question-image/${id}`;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Stores an admin's picture; the caller has already been checked as an admin. */
export async function storeQuestionImage(c: Collections, body: Uint8Array, name: string, userId: string, now: Date): Promise<{ id: string; path: string }> {
  if (body.length === 0) throw new ApiError(400, "empty_image");
  if (body.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_big");
  const contentType = imageTypeOf(body);
  if (!contentType) throw new ApiError(400, "bad_image");
  const id = randomUUID();
  await c.questionImages.insertOne({ _id: id, name: name.slice(0, 120), contentType, data: new Binary(body), size: body.length, createdBy: userId, createdAt: now });
  return { id, path: imagePathOf(id) };
}

/** A stored picture, or a 404. */
export async function loadQuestionImage(c: Collections, id: string): Promise<{ contentType: ImageType; bytes: Uint8Array }> {
  if (!ID.test(id)) throw new ApiError(404, "not_found");
  const doc = await c.questionImages.findOne({ _id: id });
  if (!doc) throw new ApiError(404, "not_found");
  return { contentType: doc.contentType, bytes: doc.data.buffer };
}
