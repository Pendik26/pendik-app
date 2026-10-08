const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const BACKUP_STALE_DAYS = 14;

/** Whole days since the last export, or null if never exported. */
export function daysSinceExport(lastExport: string | null, now: Date = new Date()): number | null {
  if (!lastExport) return null;
  const exported = new Date(lastExport).getTime();
  if (Number.isNaN(exported)) return null;
  return Math.floor((now.getTime() - exported) / MS_PER_DAY);
}

/**
 * A backup nudge only makes sense once there's something to lose, and only
 * once it's been a while (or never) since the last export.
 */
export function shouldNudgeBackup(
  lastExport: string | null,
  hasActivity: boolean,
  now: Date = new Date(),
): boolean {
  if (!hasActivity) return false;
  const days = daysSinceExport(lastExport, now);
  return days === null || days >= BACKUP_STALE_DAYS;
}
