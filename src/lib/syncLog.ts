import type { SyncRunRow } from "./admin";

/** "14:03:07" in the viewer's clock, for log lines. */
export const logTime = (at: Date): string => at.toTimeString().slice(0, 8);

/** One past run as plain log lines: what it did, how long it took, and why it was held or failed. */
export function runLog(r: SyncRunRow): string[] {
  const lines = [`run ${r.id.slice(0, 8)}  started ${r.started_at}  by ${r.started_by}`];
  lines.push(`status ${r.status}  calls ${r.calls}`);
  lines.push(`files found ${r.files_found}  added ${r.files_added}  updated ${r.files_updated}  missing ${r.files_missing}`);
  if (r.finished_at) {
    const seconds = Math.max(0, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000));
    lines.push(`finished ${r.finished_at}  took ${seconds}s`);
  } else {
    lines.push("not finished");
  }
  for (const [key, value] of Object.entries(r.notes)) lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  if (r.error) lines.push(`error: ${r.error}`);
  return lines;
}
