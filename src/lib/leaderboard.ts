// Client for the leaderboard API (server/leaderboard.ts). Signed-in only; scores are worked out
// on the server from synced progress.

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
  /** The signed-in student's cohort, if they set one. */
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new Error("You're offline. The leaderboard needs a connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Couldn't load the leaderboard (${res.status}).`);
  return data as T;
}

export function fetchBoard(period: Period, scope: Scope): Promise<Board> {
  return request<Board>(`/api/leaderboard?period=${period}&scope=${scope}`);
}

export function updateMembership(input: { joined?: boolean; displayName?: string }): Promise<{ joined: boolean; displayName: string }> {
  return request("/api/leaderboard/me", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
