import { localDateKey } from "../lib/activity";

const DAYS = 7;

/** Shading by how much was studied (the study log), or just whether (older study days). */
function levelFor(amount: number | undefined, studied: boolean): 0 | 1 | 2 | 3 {
  if (amount && amount > 0) return amount < 20 ? 1 : amount < 60 ? 2 : 3;
  return studied ? 1 : 0;
}

/**
 * GitHub-style calendar heatmap: sequential single-hue magnitude, one cell per day. With
 * `onSelect`, each day is a button that shows what was studied.
 */
export function ActivityHeatmap({
  days,
  weeks = 16,
  intensity,
  selected,
  onSelect,
}: {
  days: string[];
  weeks?: number;
  intensity?: Map<string, number>;
  selected?: string | null;
  onSelect?: (date: string) => void;
}) {
  const studied = new Set(days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Align the grid to end on today, columns = weeks, rows = weekday.
  const totalDays = weeks * DAYS;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1) - today.getDay());

  const cells: { date: Date; key: string; level: 0 | 1 | 2 | 3; future: boolean }[] = [];
  for (let i = 0; i < totalDays + today.getDay(); i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    // Study days are stored as dates; the grid's cells are the student's own calendar days.
    const key = localDateKey(date);
    cells.push({ date, key, level: levelFor(intensity?.get(key), studied.has(key)), future: date > today });
  }

  const weekCols: (typeof cells)[] = [];
  for (let w = 0; w * DAYS < cells.length; w++) weekCols.push(cells.slice(w * DAYS, w * DAYS + DAYS));

  const describe = (cell: (typeof cells)[number]) => {
    const amount = intensity?.get(cell.key) ?? 0;
    const what = amount > 0 ? `${amount} study actions` : studied.has(cell.key) ? "studied" : "no study";
    return `${cell.date.toDateString()}: ${what}`;
  };

  return (
    <div className={onSelect ? "heatmap heatmap-interactive" : "heatmap"} role={onSelect ? "group" : "img"} aria-label={`Study activity over the last ${weeks} weeks`}>
      {weekCols.map((week, wi) => (
        <div className="heatmap-col" key={wi}>
          {week.map((cell) =>
            cell.future ? (
              <span key={cell.key} className="heatmap-cell heatmap-cell-future" aria-hidden="true" />
            ) : onSelect ? (
              <button
                key={cell.key}
                type="button"
                className={`heatmap-cell level-${cell.level}${selected === cell.key ? " selected" : ""}`}
                title={describe(cell)}
                aria-label={describe(cell)}
                aria-pressed={selected === cell.key}
                onClick={() => { onSelect(cell.key); }}
              />
            ) : (
              <div key={cell.key} className={`heatmap-cell level-${cell.level}`} title={describe(cell)} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
