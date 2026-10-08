import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { FlameIcon, TrophyIcon } from "../components/icons";
import { fetchBoard, updateMembership, type Board, type BoardRow, type Period, type Scope } from "../lib/leaderboard";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey, Translate } from "../i18n/i18n";

const PERIODS: { id: Period; label: MessageKey }[] = [
  { id: "week", label: "board.week" },
  { id: "all", label: "board.all" },
  { id: "streak", label: "board.streak" },
];

function unit(period: Period, value: number, t: Translate): string {
  if (period === "streak") return value === 1 ? t("board.day") : t("board.days");
  return value === 1 ? t("board.pt") : t("board.pts");
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
  const { t } = useI18n();
  const medal = row.rank <= 3 ? ` lb-rank-${row.rank}` : "";
  return (
    <li className={row.me ? "lb-row lb-row-me" : "lb-row"}>
      <span className={`lb-rank${medal}`}>{row.rank}</span>
      <span className="lb-avatar" style={{ "--lb-hue": hueOf(row.name) } as CSSProperties} aria-hidden="true">
        {initials(row.name)}
      </span>
      <span className="lb-name">
        {row.name}
        {row.me && <span className="lb-you">{t("board.you")}</span>}
        {row.cohort && <small>{t("board.cohort", { cohort: row.cohort })}</small>}
      </span>
      <span className="lb-value">
        {row.value.toLocaleString()} <small>{unit(period, row.value, t)}</small>
      </span>
    </li>
  );
}

function JoinCard({ board, onChange }: { board: Board; onChange: () => void }) {
  const { t } = useI18n();
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
          {t("board.showingAs")} <strong>{board.me.displayName}</strong>
        </span>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { setEditing(true); }}>
          {t("board.changeName")}
        </button>
        <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void save({ joined: false })}>
          {t("board.leave")}
        </button>
        {message && <p className="account-error">{message}</p>}
      </div>
    );
  }

  return (
    <form className="account-card lb-join" onSubmit={submit}>
      <h2>{board.me.joined ? t("board.changeTitle") : t("board.join")}</h2>
      {!board.me.joined && (
        <p className="account-note">
          {t("board.privacy")}
        </p>
      )}
      <label className="account-field">
        <span>{t("board.displayName")}</span>
        <input
          className="form-input"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          minLength={2}
          maxLength={32}
          required
          autoComplete="nickname"
        />
        <small>{t("board.nickname")}</small>
      </label>
      {message && <p className="account-error">{message}</p>}
      <div className="account-row">
        <button type="submit" className="btn" disabled={busy}>
          {board.me.joined ? t("common.save") : t("board.joinShort")}
        </button>
        {board.me.joined && (
          <button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); }}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function SignedInBoard() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>("week");
  const [scope, setScope] = useState<Scope>("everyone");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
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
  }, [period, scope, reload]);

  const refresh = useCallback(() => { setReload((n) => n + 1); }, []);

  if (error && !board) return <p className="account-error">{error}</p>;
  if (!board) return <p className="subtitle">{t("board.loading")}</p>;

  const me = board.me;
  const myRowShown = board.rows.some((r) => r.me);
  const stale = board.period !== period || board.scope !== scope;

  return (
    <>
      <div className="lb-summary">
        <div className="lb-stat">
          <span className="lb-stat-value">{me.week.toLocaleString()}</span>
          <span className="lb-stat-label">{t("board.pointsWeek")}</span>
        </div>
        <div className="lb-stat">
          <span className="lb-stat-value">{me.stats.points.toLocaleString()}</span>
          <span className="lb-stat-label">{t("board.pointsAll")}</span>
        </div>
        <div className="lb-stat">
          <span className="lb-stat-value">
            <FlameIcon /> {me.streak}
          </span>
          <span className="lb-stat-label">{t("board.dayStreak")}</span>
        </div>
        {me.joined && (
          <div className="lb-stat">
            <span className="lb-stat-value">{me.rank ? `#${me.rank}` : "—"}</span>
            <span className="lb-stat-label">{me.rank ? t("board.ofTotal", { total: board.total }) : t("board.notRanked")}</span>
          </div>
        )}
      </div>

      <JoinCard key={`${me.joined}-${me.displayName}`} board={board} onChange={refresh} />

      <div className="lb-controls">
        <div className="account-tabs lb-tabs" role="tablist" aria-label={t("board.ranking")}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? "account-tab active" : "account-tab"}
              onClick={() => { setPeriod(p.id); }}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        {board.cohort ? (
          <div className="account-tabs lb-scope" role="tablist" aria-label={t("board.compareWith")}>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "everyone"}
              className={scope === "everyone" ? "account-tab active" : "account-tab"}
              onClick={() => { setScope("everyone"); }}
            >
              {t("board.everyone")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "cohort"}
              className={scope === "cohort" ? "account-tab active" : "account-tab"}
              onClick={() => { setScope("cohort"); }}
            >
              {t("board.cohort", { cohort: board.cohort })}
            </button>
          </div>
        ) : null}
      </div>

      {error && <p className="account-error">{error}</p>}

      <div className={stale ? "account-card lb-board lb-board-stale" : "account-card lb-board"} aria-busy={stale}>
        {board.rows.length === 0 ? (
          <p className="lb-empty">
            {board.period === "streak"
              ? t("board.emptyStreak")
              : board.period === "week"
                ? t("board.emptyWeek")
                : t("board.empty")}
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
        <summary>{t("board.how")}</summary>
        <ul>
          <li>
            <strong>{board.points.correctAnswer}</strong> {t("board.perAnswer")}
          </li>
          <li>
            <strong>{board.points.cardLearned}</strong> {t("board.perCard")}
          </li>
          <li>
            <strong>{board.points.chapterFinished}</strong> {t("board.perChapter")}
          </li>
          <li>
            <strong>{board.points.studyDay}</strong> {t("board.perDay")}
          </li>
        </ul>
        <p className="account-note">
          <strong>{t("board.week")}</strong> {t("board.weekHow")}{" "}
          <strong>{t("board.streak")}</strong> {t("board.streakHow")}
        </p>
      </details>
    </>
  );
}

export function Leaderboard() {
  const { t } = useI18n();
  return (
    <section className="page leaderboard-page">
      <h1>
        <span className="lb-title-icon" aria-hidden="true">
          <TrophyIcon />
        </span>
        {t("board.title")}
      </h1>
      <p className="subtitle">{t("board.subtitle")}</p>
      <SignedInBoard />
    </section>
  );
}
