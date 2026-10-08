import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";
import {
  attemptTitle,
  AttemptError,
  ATTEMPT_ERRORS,
  bankMatches,
  bankOptions,
  runningAttempt,
  startBankPractice,
  useExamRecords,
  type BankGroup,
} from "../lib/exams";

/** Most questions one practice draws. */
const MAX_COUNT = 200;

const distinct = <T,>(xs: (T | null)[]): T[] =>
  [...new Set(xs.filter((x): x is T => x !== null))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

const toggled = <T,>(list: readonly T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** Chips to pick any number of values; none picked means any. */
function Chips<T extends string | number>({ label, values, picked, onToggle }: {
  label: string;
  values: readonly T[];
  picked: readonly T[];
  onToggle: (value: T) => void;
}) {
  if (values.length === 0) return null;
  return (
    <fieldset className="bank-field">
      <legend>{label}</legend>
      <div className="tag-filter-row">
        {values.map((v) => (
          <button key={v} type="button" className={picked.includes(v) ? "tag tag-toggle active" : "tag tag-toggle"}
            aria-pressed={picked.includes(v)} onClick={() => { onToggle(v); }}>
            {v}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Build a practice set from the question bank: block, sources, years, subjects, count and timer. */
export function BankPractice() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const records = useExamRecords();
  const running = runningAttempt(records);
  const [groups, setGroups] = useState<BankGroup[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [block, setBlock] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [count, setCount] = useState(20);
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(20);

  useEffect(() => {
    bankOptions().then(
      (g) => {
        setGroups(g);
        setBlock((b) => b ?? g[0]?.block ?? null);
      },
      (e: Error) => { setProblem(e.message); },
    );
  }, []);

  const inBlock = useMemo(() => (groups ?? []).filter((g) => block === null || g.block === block), [groups, block]);
  const blocks = useMemo(() => distinct((groups ?? []).map((g) => g.block)), [groups]);
  const sourceList = useMemo(() => distinct(inBlock.map((g) => g.source)), [inBlock]);
  const yearList = useMemo(() => distinct(inBlock.map((g) => g.year)), [inBlock]);
  const subjectList = useMemo(() => distinct(inBlock.map((g) => g.subject)), [inBlock]);
  const bookmarkedTotal = (groups ?? []).reduce((n, g) => n + g.bookmarked, 0);
  const choice = { block, sources, years, subjects, bookmarkedOnly };
  const matches = groups ? bankMatches(groups, choice) : 0;
  const drawn = Math.min(count, matches, MAX_COUNT);

  const pickBlock = (b: string | null) => {
    setBlock(b);
    setSources([]);
    setYears([]);
    setSubjects([]);
  };

  const start = async () => {
    setBusy(true);
    setProblem(null);
    const parts = [block && t("admin.blockN", { block }), ...sources, ...years.map(String), ...subjects, bookmarkedOnly && t("bank.bookmarksTag")];
    try {
      const { attempt_id } = await startBankPractice({
        ...choice,
        count: drawn,
        timeLimitMinutes: timed ? minutes : null,
        title: [t("bank.titlePrefix"), parts.filter(Boolean).join(" · ")].filter(Boolean).join(": "),
      });
      navigate(`/exam/attempt/${attempt_id}`);
    } catch (e) {
      setBusy(false);
      const key = e instanceof AttemptError ? ATTEMPT_ERRORS[e.code] : undefined;
      setProblem(key ? t(key as MessageKey) : t("common.error", { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <section className="page">
      <Link to="/exam" className="back-link">← {t("exam.allExams")}</Link>
      <h1>{t("bank.title")}</h1>
      <p className="subtitle">{t("bank.subtitle")}</p>

      {running && (
        <Link to={`/exam/attempt/${running.id}`} className="exam-running-banner">
          <strong>{t("exam.inProgress")}</strong>
          <span>{attemptTitle(running, records)}</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {problem && <p className="account-error" role="alert">{problem}</p>}

      {!groups ? (
        !problem && <p className="subtitle">{t("common.loading")}</p>
      ) : groups.length === 0 ? (
        <p className="account-note">{t("bank.empty")}</p>
      ) : (
        <div className="account-card bank-form">
          <fieldset className="bank-field">
            <legend>{t("bank.block")}</legend>
            <div className="tag-filter-row">
              {blocks.map((b) => (
                <button key={b} type="button" className={block === b ? "tag tag-toggle active" : "tag tag-toggle"}
                  aria-pressed={block === b} onClick={() => { pickBlock(b); }}>
                  {t("admin.blockN", { block: b })}
                </button>
              ))}
              <button type="button" className={block === null ? "tag tag-toggle active" : "tag tag-toggle"}
                aria-pressed={block === null} onClick={() => { pickBlock(null); }}>
                {t("bank.allBlocks")}
              </button>
            </div>
          </fieldset>
          <Chips label={t("bank.sources")} values={sourceList} picked={sources} onToggle={(v) => { setSources((l) => toggled(l, v)); }} />
          <Chips label={t("bank.years")} values={yearList} picked={years} onToggle={(v) => { setYears((l) => toggled(l, v)); }} />
          <Chips label={t("bank.subjects")} values={subjectList} picked={subjects} onToggle={(v) => { setSubjects((l) => toggled(l, v)); }} />
          <p className="account-note">{t("bank.anyHint")}</p>

          <label className="bank-check">
            <input type="checkbox" checked={bookmarkedOnly} disabled={bookmarkedTotal === 0}
              onChange={(e) => { setBookmarkedOnly(e.target.checked); }} />
            <span>{t("bank.onlyBookmarks", { count: bookmarkedTotal })}</span>
          </label>

          <div className="bank-numbers">
            <label className="account-field">
              <span>{t("bank.count")}</span>
              <input className="form-input" type="number" min={1} max={MAX_COUNT} value={count}
                onChange={(e) => { setCount(Math.max(1, Math.min(MAX_COUNT, Math.round(Number(e.target.value) || 1)))); }} />
            </label>
            <label className="bank-check">
              <input type="checkbox" checked={timed} onChange={(e) => { setTimed(e.target.checked); }} />
              <span>{t("bank.timer")}</span>
            </label>
            {timed && (
              <label className="account-field">
                <span>{t("bank.minutes")}</span>
                <input className="form-input" type="number" min={1} max={300} value={minutes}
                  onChange={(e) => { setMinutes(Math.max(1, Math.min(300, Math.round(Number(e.target.value) || 1)))); }} />
              </label>
            )}
          </div>

          <p className="exam-format-note" aria-live="polite">
            {matches === 0 ? t("bank.noneMatch") : t("bank.matches", { count: matches, drawn })}
          </p>
          <ul className="exam-rules">
            <li>{t("exam.rulePractice")}</li>
            <li>{t("bank.ruleRandom")}</li>
          </ul>
          <div className="quiz-start-actions">
            {running ? (
              <Link to={`/exam/attempt/${running.id}`} className="btn quiz-start-btn">{t("exam.continue")}</Link>
            ) : (
              <button type="button" className="btn quiz-start-btn" disabled={busy || matches === 0} onClick={() => void start()}>
                {t("bank.start", { count: drawn })}
              </button>
            )}
            <Link to="/exam/bookmarks" className="btn btn-secondary">{t("bank.myBookmarks")}</Link>
          </div>
        </div>
      )}
    </section>
  );
}
