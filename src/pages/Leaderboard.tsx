import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FlameIcon, TrophyIcon } from "../components/icons";
import { useAccount } from "../hooks/useAccount";
import { fetchBoard, updateMembership, type Board, type BoardRow, type Period, type Scope } from "../lib/leaderboard";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
  { id: "streak", label: "Streak" },
];

function unit(period: Period, value: number): string {
  if (period === "streak") return value === 1 ? "day" : "days";
  return value === 1 ? "pt" : "pts";
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** A stable hue per name, so each student keeps the same avatar colour. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

function Row({ row, period }: { row: BoardRow; period: Period }) {
  const medal = row.rank <= 3 ? ` lb-rank-${row.rank}` : "";
  return (
    <li className={row.me ? "lb-row lb-row-me" : "lb-row"}>
      <span className={`lb-rank${medal}`}>{row.rank}</span>
      <span className="lb-avatar" style={{ "--lb-hue": hueOf(row.name) } as CSSProperties} aria-hidden="true">
        {initials(row.name)}
      </span>
      <span className="lb-name">
        {row.name}
        {row.me && <span className="lb-you">You</span>}
        {row.cohort && <small>Cohort {row.cohort}</small>}
      </span>
      <span className="lb-value">
        {row.value.toLocaleString()} <small>{unit(period, row.value)}</small>
      </span>
    </li>
  );
}

function JoinCard({ board, onChange }: { board: Board; onChange: () => void }) {
  const [name, setName] = useState(board.me.displayName);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (input: { joined?: boolean; displayName?: string }) => {
    setBusy(true);
    setMessage("");
    try {
      await updateMembership(input);
      setEditing(false);
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save({ joined: true, displayName: name });
  };

  if (board.me.joined && !editing) {
    return (
      <div className="lb-membership">
        <span>
          Showing as <strong>{board.me.displayName}</strong>
        </span>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { setEditing(true); }}>
          Change name
        </button>
        <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void save({ joined: false })}>
          Leave leaderboard
        </button>
        {message && <p className="account-error">{message}</p>}
      </div>
    );
  }

  return (
    <form className="account-card lb-join" onSubmit={submit}>
      <h2>{board.me.joined ? "Change your display name" : "Join the leaderboard"}</h2>
      {!board.me.joined && (
        <p className="account-note">
          Only your display name, cohort and scores are shown to other signed-in students. Your
          email and answers stay private, and you can leave at any time.
        </p>
      )}
      <label className="account-field">
        <span>Display name</span>
        <input
          className="form-input"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          minLength={2}
          maxLength={32}
          required
          autoComplete="nickname"
        />
        <small>A nickname is fine.</small>
      </label>
      {message && <p className="account-error">{message}</p>}
      <div className="account-row">
        <button type="submit" className="btn" disabled={busy}>
          {board.me.joined ? "Save" : "Join"}
        </button>
        {board.me.joined && (
          <button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function SignedInBoard() {
  const { syncNow } = useAccount();
  const [period, setPeriod] = useState<Period>("week");
  const [scope, setScope] = useState<Scope>("everyone");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [synced, setSynced] = useState(false);
  const [reload, setReload] = useState(0);

  // Upload anything unsynced first, so your own score on the board is current. Once per visit:
  // the sync itself updates account state, and must never trigger another one.
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    void syncNow().finally(() => { setSynced(true); });
  }, [syncNow]);

  useEffect(() => {
    if (!synced) return;
    let cancelled = false;
    fetchBoard(period, scope).then(
      (b) => {
        if (cancelled) return;
        setBoard(b);
        setError("");
      },
      (err: Error) => {
        if (!cancelled) setError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [period, scope, synced, reload]);

  const refresh = useCallback(() => { setReload((n) => n + 1); }, []);

  if (error && !board) return <p className="account-error">{error}</p>;
  if (!board) return <p className="subtitle">Loading the leaderboard…</p>;

  const me = board.me;
  const myRowShown = board.rows.some((r) => r.me);
  const stale = board.period !== period || board.scope !== scope;

  return (
    <>
      <div className="lb-summary">
        <div className="lb-stat">
          <span className="lb-stat-value">{me.week.toLocaleString()}</span>
          <span className="lb-stat-label">points this week</span>
        </div>
        <div className="lb-stat">
          <span className="lb-stat-value">{me.stats.points.toLocaleString()}</span>
          <span className="lb-stat-label">points all time</span>
        </div>
        <div className="lb-stat">
          <span className="lb-stat-value">
            <FlameIcon /> {me.streak}
          </span>
          <span className="lb-stat-label">day streak</span>
        </div>
        {me.joined && (
          <div className="lb-stat">
            <span className="lb-stat-value">{me.rank ? `#${me.rank}` : "—"}</span>
            <span className="lb-stat-label">{me.rank ? `of ${board.total} on this board` : "not ranked yet"}</span>
          </div>
        )}
      </div>

      <JoinCard key={`${me.joined}-${me.displayName}`} board={board} onChange={refresh} />

      <div className="lb-controls">
        <div className="account-tabs lb-tabs" role="tablist" aria-label="Ranking">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? "account-tab active" : "account-tab"}
              onClick={() => { setPeriod(p.id); }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {board.cohort ? (
          <div className="account-tabs lb-scope" role="tablist" aria-label="Who to compare with">
            <button
              type="button"
              role="tab"
              aria-selected={scope === "everyone"}
              className={scope === "everyone" ? "account-tab active" : "account-tab"}
              onClick={() => { setScope("everyone"); }}
            >
              Everyone
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "cohort"}
              className={scope === "cohort" ? "account-tab active" : "account-tab"}
              onClick={() => { setScope("cohort"); }}
            >
              Cohort {board.cohort}
            </button>
          </div>
        ) : (
          <p className="account-note">
            Add your cohort on the <Link to="/account">Account</Link> page to compare with your class.
          </p>
        )}
      </div>

      {error && <p className="account-error">{error}</p>}

      <div className={stale ? "account-card lb-board lb-board-stale" : "account-card lb-board"} aria-busy={stale}>
        {board.rows.length === 0 ? (
          <p className="lb-empty">
            {board.period === "streak"
              ? "No one has a study streak going on this board yet."
              : board.period === "week"
                ? "No points on this board this week yet. Study something to get on it."
                : "No one's on this board yet."}
          </p>
        ) : (
          <ol className="lb-list">
            {board.rows.map((row) => (
              <Row key={`${row.rank}-${row.name}-${row.me}`} row={row} period={board.period} />
            ))}
            {me.joined && me.rank && !myRowShown && (
              <>
                <li className="lb-gap" aria-hidden="true">
                  ⋯
                </li>
                <Row row={{ rank: me.rank, name: me.displayName, cohort: board.cohort, value: me.value, me: true }} period={board.period} />
              </>
            )}
          </ol>
        )}
      </div>

      <details className="account-card lb-how">
        <summary>How points work</summary>
        <ul>
          <li>
            <strong>{board.points.correctAnswer}</strong> per correct quiz or exam answer
          </li>
          <li>
            <strong>{board.points.cardLearned}</strong> per flashcard you've learned (reviewed correctly at least once)
          </li>
          <li>
            <strong>{board.points.chapterFinished}</strong> per ebook chapter marked complete
          </li>
          <li>
            <strong>{board.points.studyDay}</strong> per day you study
          </li>
        </ul>
        <p className="account-note">
          <strong>This week</strong> counts points gained in the last 7 days, from when you first
          synced. <strong>Streak</strong> is consecutive study days, still alive if you studied today
          or yesterday. Scores update each time your progress syncs.
        </p>
      </details>
    </>
  );
}

export function Leaderboard() {
  const { status, config, checkSession } = useAccount();

  useEffect(() => {
    if (status === "guest" && config?.accounts) void checkSession();
    // Only on mount, like the Account page: a returning device may have a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page leaderboard-page">
      <h1>
        <span className="lb-title-icon" aria-hidden="true">
          <TrophyIcon />
        </span>
        Leaderboard
      </h1>
      {status === "checking" && <p className="subtitle">Checking…</p>}

      {status === "unavailable" && (
        <>
          <p className="subtitle">See how your studying compares with other students.</p>
          <div className="account-card">
            <p>
              Signed-in students can join a weekly and an all-time board, scored from correct answers, learned cards, finished
              chapters and study days, under a display name they choose. Accounts aren't switched on for this copy of the site, so
              there's no board to show yet.
            </p>
            <p>
              Your own numbers are on <Link to="/progress">Progress</Link>.
            </p>
          </div>
        </>
      )}

      {status === "guest" && (
        <>
          <p className="subtitle">See how your studying compares with other students.</p>
          <div className="account-card lb-guest">
            <p>
              The leaderboard is for signed-in students: scores come from your synced progress, and
              only students who choose to join are listed.
            </p>
            <Link to="/account" className="btn">
              Sign in or create an account
            </Link>
          </div>
        </>
      )}

      {status === "signed-in" && (
        <>
          <p className="subtitle">Points from quizzes, flashcards, reading and study days.</p>
          <SignedInBoard />
        </>
      )}
    </section>
  );
}
