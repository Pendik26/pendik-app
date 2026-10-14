import type { SyncRunRow } from "./admin";

/** A good sync older than this means the daily sync has stopped. */
export const STALE_HOURS = 48;

export type SyncAlarm = "never" | "stale" | "held" | "failed" | null;

/**
 * What an admin should be told about the Drive sync. Runs are newest first. A sync that is still
 * running, or has been applied since, raises nothing; otherwise the most urgent thing wins:
 * the last run was held or failed, or no run has finished well for STALE_HOURS.
 */
export function syncAlarm(runs: readonly SyncRunRow[], now: number = Date.now()): SyncAlarm {
  if (runs.length === 0) return "never";
  const lastDone = runs.find((r) => r.status === "done");
  const latest = runs[0];
  if (latest?.status === "held") return "held";
  if (latest?.status === "failed") return "failed";
  if (!lastDone) return "never";
  const at = Date.parse(lastDone.finished_at ?? lastDone.started_at);
  return now - at > STALE_HOURS * 3_600_000 ? "stale" : null;
}
