import type { Track } from "../context/accountContextValue";

/**
 * A student's class section ("A" or "B"): the first letter of a Reguler tutorial group (A1–A10, B1–B10).
 * IUP is a single class whose tutorial groups are "IUP A" and "IUP B", so it has no section.
 */
export function classSection(track: Track | null, group: string | null): "A" | "B" | null {
  const g = (group ?? "").trim().toUpperCase();
  const letter = track === "REGULER" ? g.charAt(0) : "";
  return letter === "A" || letter === "B" ? letter : null;
}
