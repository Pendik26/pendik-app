import { rpc } from "./db/client";

// The student's exam readiness against their class: each student's number per block is saved
// (`save_readiness`), and the class average comes back once at least 3 classmates have one.

export interface ClassReadiness {
  cohort: string | null;
  /** Students with a readiness for this block. */
  count: number;
  /** Their average, or null while there are too few to show one. */
  average: number | null;
}

const reported = new Map<string, number>();

/** Saves this student's readiness for a block, when it has moved by a point or more. */
export async function reportReadiness(blockId: string, value: number): Promise<void> {
  const rounded = Math.round(value);
  if (reported.get(blockId) === rounded) return;
  reported.set(blockId, rounded);
  const { error } = await rpc("save_readiness", { p_block: blockId, p_value: Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 });
  if (error) reported.delete(blockId);
}

export async function fetchClassReadiness(blockId: string): Promise<ClassReadiness | null> {
  const { data, error } = await rpc<ClassReadiness>("class_readiness", { p_block: blockId });
  return error ? null : data;
}
