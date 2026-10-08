/** Deterministic "tip of the day": same pick for everyone on the same calendar date, no server needed. */
export function tipOfDay(tips: string[], date: Date = new Date()): string {
  if (tips.length === 0) return "";
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      86_400_000,
  );
  return tips[dayOfYear % tips.length];
}
