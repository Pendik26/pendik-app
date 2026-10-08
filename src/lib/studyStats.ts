import { dayTotals, localDateKey, type StudyKind, type StudyLog } from "./activity";
import { own } from "./records";

// Figures from the study log for the Progress page: how much was studied per day, this week
// against last, and the time of day the student studies most.

export interface DayPoint {
  date: string;
  /** Cards and image-occlusion labels reviewed. */
  reviews: number;
  questions: number;
  chapters: number;
  exams: number;
}

export function dailySeries(log: StudyLog, days = 30, today: Date = new Date()): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const date = localDateKey(d);
    const t = dayTotals(log, date);
    out.push({ date, reviews: t.cards + t.labels, questions: t.questions, chapters: t.chapters, exams: t.exams });
  }
  return out;
}

export interface WeekSummary {
  reviews: number;
  questions: number;
  chapters: number;
  exams: number;
  activeDays: number;
}

function sumWeek(points: DayPoint[]): WeekSummary {
  return points.reduce(
    (w, p) => ({
      reviews: w.reviews + p.reviews,
      questions: w.questions + p.questions,
      chapters: w.chapters + p.chapters,
      exams: w.exams + p.exams,
      activeDays: w.activeDays + (p.reviews + p.questions + p.chapters + p.exams > 0 ? 1 : 0),
    }),
    { reviews: 0, questions: 0, chapters: 0, exams: 0, activeDays: 0 },
  );
}

/** The last seven days (today included) against the seven before them. */
export function weekComparison(log: StudyLog, today: Date = new Date()): { thisWeek: WeekSummary; lastWeek: WeekSummary } {
  const series = dailySeries(log, 14, today);
  return { thisWeek: sumWeek(series.slice(7)), lastWeek: sumWeek(series.slice(0, 7)) };
}

/** "8–10 pm": the two-hour window with the most study, once there's enough to say. */
export function bestStudyTime(log: StudyLog, minimum = 40): string | null {
  const byHour = Array.from({ length: 24 }, (_, h) => Number(log.hours[String(h)]) || 0);
  const total = byHour.reduce((a, b) => a + b, 0);
  if (total < minimum) return null;
  // Each hour with the one after it; the first busiest pair wins.
  const pairs = byHour.map((n, h) => n + (byHour.at((h + 1) % 24) ?? 0));
  const best = pairs.indexOf(Math.max(...pairs));
  const label = (h: number) => {
    const hour = h % 12 === 0 ? 12 : h % 12;
    return { hour, half: h < 12 ? "am" : "pm" };
  };
  const a = label(best);
  const b = label((best + 2) % 24);
  return a.half === b.half ? `${a.hour}–${b.hour} ${b.half}` : `${a.hour} ${a.half}–${b.hour} ${b.half}`;
}

/** One day's work by subject, for tapping a day on the heatmap. */
export function dayDetail(log: StudyLog, date: string): { subject: string; counts: Partial<Record<StudyKind, number>> }[] {
  return Object.entries(own(log.days, date) ?? {})
    .map(([subject, counts = {}]) => ({ subject, counts }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Total study actions per local date, for the heatmap's shading. */
export function dayIntensity(log: StudyLog): Map<string, number> {
  const out = new Map<string, number>();
  for (const date of Object.keys(log.days)) {
    const t = dayTotals(log, date);
    out.set(date, t.cards + t.labels + t.questions + t.chapters * 10 + t.exams * 30);
  }
  return out;
}
