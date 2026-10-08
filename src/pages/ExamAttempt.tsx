import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FlagIcon, TimerIcon } from "../components/icons";
import { QuestionImage } from "../components/exam/QuestionImage";
import { formatClock } from "../lib/examFormat";
import { useI18n } from "../i18n/useI18n";
import {
  abandonAttempt,
  AttemptError,
  ATTEMPT_ERRORS,
  getAttempt,
  matchesAccepted,
  saveAttempt,
  submitAttempt,
  takeOverAttempt,
  type AttemptAnswer,
  type AttemptQuestion,
  type RunningAttempt,
} from "../lib/exams";
import type { MessageKey } from "../i18n/i18n";

const OPTION_LETTERS = "ABCDEFGH";
const SAVE_DELAY_MS = 1000;
const LOW_TIME_SEC = 120;

const isAnswered = (a: AttemptAnswer | undefined) =>
  a !== undefined && ("choice" in a ? true : a.text.trim().length > 0);

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "elsewhere"; title: string }
  | { kind: "running"; attempt: RunningAttempt; questions: AttemptQuestion[] };

/** Taking a package: the server keeps the time and the keys; this page shows and saves. */
export function ExamAttempt() {
  const { attemptId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [reload, setReload] = useState(0);

  const errorText = useCallback(
    (e: unknown) => {
      const key = e instanceof AttemptError ? ATTEMPT_ERRORS[e.code] : undefined;
      return key ? t(key as MessageKey) : t("common.error", { message: e instanceof Error ? e.message : String(e) });
    },
    [t],
  );

  useEffect(() => {
    let live = true;
    getAttempt(attemptId).then(
      (a) => {
        if (!live) return;
        if (a.status !== "in_progress") {
          navigate(a.status === "finished" ? `/exam/result/${a.id}` : "/exam", { replace: true });
          return;
        }
        if (a.holder === "other" || !a.questions) setPhase({ kind: "elsewhere", title: a.title });
        else setPhase({ kind: "running", attempt: a, questions: a.questions });
      },
      (e: unknown) => { if (live) setPhase({ kind: "error", message: errorText(e) }); },
    );
    return () => { live = false; };
  }, [attemptId, reload, navigate, errorText]);

  if (phase.kind === "loading") return <section className="page"><p className="subtitle">{t("common.loading")}</p></section>;
  if (phase.kind === "error") {
    return (
      <section className="page">
        <p className="account-error" role="alert">{phase.message}</p>
        <Link to="/exam" className="btn btn-secondary">{t("exam.backToExams")}</Link>
      </section>
    );
  }
  if (phase.kind === "elsewhere") {
    return (
      <section className="page">
        <div className="quiz-start">
          <h1>{phase.title}</h1>
          <p className="subtitle">{t("exam.openElsewhere")}</p>
          <div className="quiz-start-actions">
            <button
              type="button"
              className="btn quiz-start-btn"
              onClick={() => {
                setPhase({ kind: "loading" });
                takeOverAttempt(attemptId).then(
                  () => { setReload((n) => n + 1); },
                  (e: unknown) => { setPhase({ kind: "error", message: errorText(e) }); },
                );
              }}
            >
              {t("exam.continueHere")}
            </button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <RunningExam
      key={`${phase.attempt.id}#${reload}`}
      attempt={phase.attempt}
      questions={phase.questions}
      onElsewhere={() => { setPhase({ kind: "elsewhere", title: phase.attempt.title }); }}
      errorText={errorText}
    />
  );
}

function RunningExam({
  attempt,
  questions,
  onElsewhere,
  errorText,
}: {
  attempt: RunningAttempt;
  questions: AttemptQuestion[];
  onElsewhere: () => void;
  errorText: (e: unknown) => string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isExam = attempt.mode === "exam";
  const [answers, setAnswers] = useState<Record<string, AttemptAnswer>>(attempt.answers);
  const [flagged, setFlagged] = useState<Set<string>>(new Set(attempt.flagged));
  const [tabLeaves, setTabLeaves] = useState(attempt.tabLeaves);
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Practice short answers: revealed once the student checks.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(Object.entries(attempt.answers).filter(([, a]) => "self_mark" in a && a.self_mark !== undefined).map(([id]) => id)),
  );

  // The deadline on this device's clock, from the seconds the server says are left.
  const [deadline] = useState(() => (attempt.secondsLeft === null ? null : Date.now() + attempt.secondsLeft * 1000));
  const [secondsLeft, setSecondsLeft] = useState(attempt.secondsLeft);

  // What the saves send: kept in step with the state (and set straight away by the handlers).
  const latest = useRef({ answers, flagged, tabLeaves });
  useEffect(() => { latest.current = { answers, flagged, tabLeaves }; });
  const dirty = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const finished = useRef(false);

  const submit = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(saveTimer.current);
    setSubmitting(true);
    try {
      await submitAttempt(attempt.id, latest.current.answers);
      navigate(`/exam/result/${attempt.id}`, { replace: true });
    } catch (e) {
      finished.current = false;
      setSubmitting(false);
      if (e instanceof AttemptError && e.code === "held_elsewhere") onElsewhere();
      else setProblem(errorText(e));
    }
  }, [attempt.id, navigate, onElsewhere, errorText]);

  const saveNow = useCallback(async () => {
    if (finished.current || !dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const { answers: a, flagged: f, tabLeaves: l } = latest.current;
    try {
      await saveAttempt(attempt.id, a, [...f], l);
      setSaveState(dirty.current ? "saving" : "saved");
    } catch (e) {
      if (e instanceof AttemptError && e.code === "held_elsewhere") { finished.current = true; onElsewhere(); return; }
      // The time ran out: the server grades what it has.
      if (e instanceof AttemptError && (e.code === "time_up" || e.code === "attempt_not_running")) { void submit(); return; }
      dirty.current = true;
      setSaveState("error");
    }
  }, [attempt.id, onElsewhere, submit]);

  const queueSave = useCallback(() => {
    dirty.current = true;
    setSaveState("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveNow(); }, SAVE_DELAY_MS);
  }, [saveNow]);

  // The clock: when it reaches zero the attempt is submitted.
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(id);
        void submit();
      }
    }, 1000);
    return () => { window.clearInterval(id); };
  }, [deadline, submit]);

  // Leaving the tab during an exam is counted (the result shows it); either way, save first.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden" || finished.current) return;
      if (isExam) {
        setTabLeaves((n) => n + 1);
        latest.current.tabLeaves += 1;
        dirty.current = true;
      }
      void saveNow();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current && !finished.current) { void saveNow(); e.preventDefault(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [isExam, saveNow]);

  useEffect(() => () => { window.clearTimeout(saveTimer.current); }, []);

  const question = questions[index];
  const answer = question ? answers[question.id] : undefined;
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  // Practice shows the key as soon as a choice is made (or a typed answer is checked).
  const revealed = !isExam && question !== undefined && (question.type === "single_choice" ? answer !== undefined : checked.has(question.id));

  const setAnswer = (id: string, a: AttemptAnswer | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (a === undefined) delete next[id];
      else next[id] = a;
      latest.current.answers = next;
      return next;
    });
    queueSave();
  };

  const choose = (position: number) => {
    if (!question || revealed) return;
    setAnswer(question.id, { choice: position });
  };

  const toggleFlag = () => {
    if (!question) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      latest.current.flagged = next;
      return next;
    });
    queueSave();
  };

  const confirmSubmit = () => {
    const unanswered = questions.length - answeredCount;
    const parts: string[] = [];
    if (unanswered > 0) parts.push(t("exam.unanswered", { count: unanswered }));
    if (flagged.size > 0) parts.push(t("exam.flaggedCount", { count: flagged.size }));
    const message = parts.length ? t("exam.submitAnyway", { list: parts.join(", ") }) : t("exam.submitConfirm");
    if (window.confirm(message)) void submit();
  };

  const quitPractice = () => {
    if (!window.confirm(t("exam.quitConfirm"))) return;
    finished.current = true;
    abandonAttempt(attempt.id).then(
      () => { navigate(`/exam/papers/${attempt.packageId}`, { replace: true }); },
      (e: unknown) => { finished.current = false; setProblem(errorText(e)); },
    );
  };

  // Keyboard: letters or digits answer, arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); setIndex((i) => Math.min(questions.length - 1, i + 1)); return; }
      if (!question?.options) return;
      const letter = OPTION_LETTERS.indexOf(e.key.toUpperCase());
      const digit = "123456789".indexOf(e.key);
      const pos = letter >= 0 ? letter : digit;
      if (pos >= 0 && pos < question.options.length) { e.preventDefault(); choose(pos); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  });

  if (!question) return null;

  const pillClass = (q: AttemptQuestion, qi: number) => {
    const a = answers[q.id];
    let cls = "quiz-nav-pill";
    if (qi === index) cls += " current";
    if (isAnswered(a)) {
      if (isExam) cls += " answered";
      else if (q.type === "single_choice" && a && "choice" in a) cls += a.choice === q.correct ? " correct" : " incorrect";
      else if (a && "self_mark" in a && a.self_mark !== undefined) cls += a.self_mark ? " correct" : " incorrect";
      else cls += " answered";
    }
    if (flagged.has(q.id)) cls += " flagged";
    return cls;
  };

  const typed = answer && "text" in answer ? answer : null;

  return (
    <section className="page exam-attempt">
      <div className="quiz-header">
        <div>
          <h1>{attempt.title}</h1>
          <p className="subtitle">
            {isExam ? t("exam.modeExam") : t("exam.modePractice")} ·{" "}
            <span className={saveState === "error" ? "exam-save exam-save-error" : "exam-save"} role="status">
              {saveState === "saving" ? t("common.saving") : saveState === "error" ? t("exam.saveFailed") : t("exam.saved")}
            </span>
          </p>
        </div>
        {secondsLeft !== null && (
          <div className={secondsLeft <= LOW_TIME_SEC ? "exam-timer exam-timer-low" : "exam-timer"} role="timer" aria-label={t("exam.timeLeft")}>
            <TimerIcon />
            {formatClock(secondsLeft)}
          </div>
        )}
      </div>

      {problem && <p className="account-error" role="alert">{problem}</p>}
      {isExam && tabLeaves > 0 && <p className="exam-tab-leaves">{t("exam.tabLeaves", { count: tabLeaves })}</p>}

      <div className="quiz-card">
        <div className="quiz-progress">
          <div className="quiz-progress-track">
            <div className="quiz-progress-fill" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
          </div>
          <span className="quiz-progress-label">{t("exam.questionOf", { n: index + 1, total: questions.length })}</span>
        </div>

        <div className="quiz-nav-strip">
          {questions.map((q, qi) => (
            <button
              key={q.id}
              type="button"
              className={pillClass(q, qi)}
              onClick={() => { setIndex(qi); }}
              aria-current={qi === index ? "true" : undefined}
              aria-label={t("exam.goTo", { n: qi + 1 })}
            >
              {qi + 1}
            </button>
          ))}
        </div>

        <div className="quiz-question-head">
          <p className="quiz-question-text exam-stem">{question.stem}</p>
          <button
            type="button"
            className={flagged.has(question.id) ? "exam-flag-btn active" : "exam-flag-btn"}
            onClick={toggleFlag}
            aria-pressed={flagged.has(question.id)}
          >
            <FlagIcon />
            {flagged.has(question.id) ? t("exam.flagged") : t("exam.flag")}
          </button>
        </div>

        {question.stemImage && <QuestionImage path={question.stemImage} alt={question.stemImageAlt} />}

        {question.type === "single_choice" && question.options ? (
          <div className="quiz-options" role="radiogroup" aria-label={question.stem}>
            {question.options.map((opt, oi) => {
              const chosen = answer && "choice" in answer && answer.choice === oi;
              let cls = "quiz-option";
              if (revealed) {
                if (oi === question.correct) cls += " correct";
                else if (chosen) cls += " incorrect";
              } else if (chosen) cls += " selected";
              return (
                <button key={oi} type="button" className={cls} onClick={() => { choose(oi); }} disabled={revealed} role="radio" aria-checked={Boolean(chosen)}>
                  <span className="quiz-option-letter">{OPTION_LETTERS.charAt(oi)}</span>
                  <span className="quiz-option-text">
                    {opt.image ? <QuestionImage path={opt.image} alt={opt.text} small /> : opt.text}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="exam-short-answer">
            <input
              className="form-input"
              value={typed?.text ?? ""}
              disabled={revealed}
              placeholder={t("exam.typeAnswer")}
              aria-label={t("exam.typeAnswer")}
              onChange={(e) => { setAnswer(question.id, e.target.value ? { text: e.target.value } : undefined); }}
            />
            {!isExam && !revealed && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={!typed?.text.trim()}
                onClick={() => {
                  setChecked((prev) => new Set(prev).add(question.id));
                  // A typed answer that matches is marked right; the student can change it.
                  const right = matchesAccepted(typed?.text ?? "", question.acceptedAnswers ?? []);
                  setAnswer(question.id, { text: typed?.text ?? "", self_mark: right });
                }}
              >
                {t("exam.check")}
              </button>
            )}
            {revealed && typed && (
              <div className="exam-self-mark">
                <p>{t("exam.acceptedAnswers", { list: (question.acceptedAnswers ?? []).join(" · ") })}</p>
                <div className="account-row" role="radiogroup" aria-label={t("exam.markYourself")}>
                  <button type="button" className={typed.self_mark ? "btn btn-small" : "btn btn-secondary btn-small"} aria-pressed={typed.self_mark === true}
                    onClick={() => { setAnswer(question.id, { text: typed.text, self_mark: true }); }}>
                    {t("exam.iGotIt")}
                  </button>
                  <button type="button" className={typed.self_mark === false ? "btn btn-small" : "btn btn-secondary btn-small"} aria-pressed={typed.self_mark === false}
                    onClick={() => { setAnswer(question.id, { text: typed.text, self_mark: false }); }}>
                    {t("exam.iMissedIt")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {revealed && question.explanation && (
          <div className={`quiz-feedback ${question.type === "single_choice" && answer && "choice" in answer && answer.choice === question.correct ? "correct" : "incorrect"}`} role="status">
            <p className="quiz-feedback-explanation">{question.explanation}</p>
          </div>
        )}

        <div className="quiz-nav-buttons">
          <button type="button" className="btn btn-secondary quiz-prev-btn" onClick={() => { setIndex((i) => Math.max(0, i - 1)); }} disabled={index === 0}>
            ← {t("exam.previous")}
          </button>
          {index === questions.length - 1 ? (
            <button type="button" className="btn quiz-next-btn" onClick={confirmSubmit} disabled={submitting}>
              {submitting ? t("exam.submitting") : t("exam.submit")}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary quiz-skip-btn" onClick={() => { setIndex((i) => i + 1); }}>
              {t("exam.next")} →
            </button>
          )}
        </div>

        <div className="exam-attempt-footer">
          {index !== questions.length - 1 && (
            <button type="button" className="exam-submit-early" onClick={confirmSubmit} disabled={submitting}>
              {t("exam.submitNow", { answered: answeredCount, total: questions.length })}
            </button>
          )}
          {!isExam && (
            <button type="button" className="btn btn-link" onClick={quitPractice}>{t("exam.quitPractice")}</button>
          )}
        </div>
      </div>
    </section>
  );
}
