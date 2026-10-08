// The student's readiness against their class (see /api/readiness on the server). Only for
// signed-in students; a guest's numbers never leave the device.

export interface ClassReadiness {
  cohort: string | null;
  /** Students with a readiness for this block. */
  count: number;
  /** Their average, or null while there are too few to show one. */
  average: number | null;
}

const reported = new Map<string, number>();

/** Sends this student's readiness for a block, when it has moved by a point or more. */
export async function reportReadiness(blockId: string, value: number): Promise<void> {
  const rounded = Math.round(value);
  if (reported.get(blockId) === rounded) return;
  reported.set(blockId, rounded);
  try {
    await fetch("/api/readiness", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ block: blockId, value }),
    });
  } catch {
    reported.delete(blockId);
  }
}

export async function fetchClassReadiness(blockId: string): Promise<ClassReadiness | null> {
  try {
    const res = await fetch(`/api/readiness?block=${encodeURIComponent(blockId)}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as ClassReadiness;
  } catch {
    return null;
  }
}
