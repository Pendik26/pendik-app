import { supabase } from "./supabase";
import { saveNow } from "./progressSync";

// The leaderboard: worked out in the database (`leaderboard()` in
// supabase/migrations/20261008000500_study.sql) from each student's saved progress and finished
// attempts. Only students who joined are listed, under their display name.

export type Period = "week" | "all" | "streak";
export type Scope = "everyone" | "cohort";

export interface BoardRow {
  rank: number;
  name: string;
  cohort: string | null;
  value: number;
  me: boolean;
}

export interface Board {
  period: Period;
  scope: Scope;
  /** The signed-in student's cohort. */
  cohort: string | null;
  points: { correctAnswer: number; cardLearned: number; chapterFinished: number; studyDay: number };
  rows: BoardRow[];
  /** Everyone ranked on this board; `rows` holds the top of it. */
  total: number;
  me: {
    joined: boolean;
    displayName: string;
    rank: number | null;
    value: number;
    week: number;
    streak: number;
    stats: { points: number; correctAnswers: number; cardsLearned: number; chaptersFinished: number; studyDays: number };
  };
}

/** Must match the SQL (`part_points`). */
export const POINTS = { correctAnswer: 1, cardLearned: 2, chapterFinished: 10, studyDay: 5 } as const;

interface BoardJson {
  period: Period;
  cohort: string | null;
  rows: BoardRow[];
  total: number;
  me: {
    joined: boolean;
    display_name: string;
    value: number;
    week: number;
    streak: number;
    points: number;
    rank: number | null;
    stats: { correct_answers: number; cards_learned: number; chapters_finished: number; study_days: number } | null;
  };
}

export async function fetchBoard(period: Period, scope: Scope): Promise<Board> {
  // Your own score is only current once your latest progress is saved.
  await saveNow();
  const { data, error } = await supabase.rpc("leaderboard", { p_period: period, p_my_cohort_only: scope === "cohort" });
  if (error) throw new Error(navigator.onLine ? error.message : "You're offline. The leaderboard needs a connection.");
  const b = data as BoardJson;
  const s = b.me.stats;
  return {
    period: b.period,
    scope,
    cohort: b.cohort,
    points: POINTS,
    rows: b.rows,
    total: b.total,
    me: {
      joined: b.me.joined,
      displayName: b.me.display_name,
      rank: b.me.rank,
      value: b.me.value,
      week: b.me.week,
      streak: b.me.streak,
      stats: {
        points: b.me.points,
        correctAnswers: s?.correct_answers ?? 0,
        cardsLearned: s?.cards_learned ?? 0,
        chaptersFinished: s?.chapters_finished ?? 0,
        studyDays: s?.study_days ?? 0,
      },
    },
  };
}

/** Trims and checks a display name; null when it isn't acceptable. */
export function cleanDisplayName(input: string): string | null {
  const printable = [...input].filter((ch) => ch >= " " && ch !== "\u007f").join("");
  const name = printable.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 32 ? name : null;
}

export async function updateMembership(input: { joined?: boolean; displayName?: string }): Promise<void> {
  const displayName = input.displayName === undefined ? null : cleanDisplayName(input.displayName);
  if (input.displayName !== undefined && !displayName) throw new Error("Use 2 to 32 characters for your display name.");
  const { error } = await supabase.rpc("update_my_settings", {
    p_display_name: displayName,
    p_leaderboard_joined: input.joined ?? null,
  });
  if (error) throw new Error(error.message);
}
