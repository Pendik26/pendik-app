import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfettiBurst } from "../components/ConfettiBurst";
import { BookmarkButton } from "../components/exam/BookmarkButton";
import { QuestionImage } from "../components/exam/QuestionImage";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";
import { attemptHome, AttemptError, ATTEMPT_ERRORS, getAttemptResult, type AttemptResult } from "../lib/exams";
import { formatClock } from "../lib/examFormat";

const OPTION_LETTERS = "ABCDEFGH";

type Kind = "wrong" | "blank" | "ungraded" | "correct";
const KINDS: Kind[] = ["wrong", "blank", "ungraded", "correct"];
const KIND_LABEL: Record<Kind, MessageKey> = { wrong: "exam.wrong", blank: "exam.blank", ungraded: "exam.notGraded", correct: "exam.correct" };

function kindOf(item: AttemptResult["items"][number]): Kind {
  if (!item.graded) return "ungraded";
  return item.isCorrect === true ? "correct" : item.isCorrect === false ? "wrong" : "blank";
}

/** A finished attempt: the score, then every question with the answer given and the key. */
export function ExamResult() {
  const { attemptId = "" } = useParams();
  const { t } = useI18n();
  const [result, setResult] = useState<{ id: string; data: AttemptResult } | { id: string; error: string } | null>(null);
  // null until the student picks a section; then the default below applies.
  const [picked, setPicked] = useState<Kind | "all" | null>(null);

  useEffect(() => {
    let live = true;
    getAttemptResult(attemptId).then(
      (data) => { if (live) setResult({ id: attemptId, data }); },
      (e: unknown) => {
        if (!live) return;
        const key = e instanceof AttemptError ? ATTEMPT_ERRORS[e.code] : undefined;
        setResult({ id: attemptId, error: key ? t(key as MessageKey) : t("common.error", { message: e instanceof Error ? e.message : String(e) }) });
      },
    );
    return () => { live = false; };
  }, [attemptId, t]);

  if (!result || result.id !== attemptId) return <section className="page"><p className="subtitle">{t("common.loading")}</p></section>;
  if ("error" in result) {
    return (
      <section className="page">
        <p className="account-error" role="alert">{result.error}</p>
        <Link to="/exam" className="btn btn-secondary">{t("exam.backToExams")}</Link>
      </section>
    );
  }

  const r = result.data;
  const byId = new Map(r.questions.map((q) => [q.id, q]));
  const perfect = r.score === 100;
  const takenSec = (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000;
  const counts = Object.fromEntries(KINDS.map((k) => [k, r.items.filter((i) => kindOf(i) === k).length])) as Record<Kind, number>;
  // A perfect score opens Correct; otherwise the first section that has questions in it, wrong ones first.
  const filter = picked ?? (perfect ? "correct" : KINDS.find((k) => counts[k] > 0) ?? "all");
  const shown = r.items.filter((i) => filter === "all" || kindOf(i) === filter);

  return (
    <section className="page">
      <Link to={attemptHome(r.packageId)} className="back-link">← {r.title}</Link>
      <div className="quiz-results">
        <div className={`quiz-score-hero${perfect ? " perfect" : ""}`}>
          {perfect && <ConfettiBurst />}
          <p className="quiz-score-value">
            {r.score === null ? "–" : r.score}
            <span className="quiz-score-total">%</span>
          </p>
          <p className="quiz-score-caption">{t("exam.counts", { correct: r.correctCount, wrong: r.wrongCount, blank: r.blankCount })}</p>
          <p className="exam-time-caption">{t("exam.timeTaken", { time: formatClock(takenSec) })}</p>
          {r.mode === "exam" && r.tabLeaves > 0 && <p className="exam-tab-leaves">{t("exam.tabLeaves", { count: r.tabLeaves })}</p>}
        </div>

        <div className="quiz-retry-row">
          <Link to={attemptHome(r.packageId)} className="btn">{t("exam.tryAgain")}</Link>
          <Link to="/exam" className="btn btn-secondary">{t("exam.allExams")}</Link>
        </div>

        <div className="exam-mode-toggle exam-review-tabs" role="radiogroup" aria-label={t("exam.review")}>
          {[...KINDS.filter((k) => counts[k] > 0), "all" as const].map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f}
              className={filter === f ? "exam-mode-btn active" : "exam-mode-btn"} onClick={() => { setPicked(f); }}>
              <span className="exam-mode-name">
                {f === "all" ? `${t("exam.reviewAll")} (${r.items.length})` : `${t(KIND_LABEL[f])} (${counts[f]})`}
              </span>
            </button>
          ))}
        </div>

        <ol className="quiz-review-list">
          {shown.map((item) => {
            const q = byId.get(item.questionId);
            if (!q) return null;
            const n = r.items.indexOf(item) + 1;
            const verdict = t(KIND_LABEL[kindOf(item)]);
            return (
              <li key={q.id} className="quiz-review-item">
                <p className="quiz-question-text exam-stem">{n}. {q.stem}</p>
                {r.changed.has(q.id) && <p className="account-note">{t("exam.changedSince")}</p>}
                {q.stemImage && <QuestionImage path={q.stemImage} alt={q.stemImageAlt} small />}
                {q.options ? (
                  <div className="quiz-options quiz-options-static">
                    {q.options.map((opt, oi) => {
                      let cls = "quiz-option";
                      if (oi === item.correct) cls += " correct";
                      else if (oi === item.chosen) cls += " incorrect";
                      return (
                        <div key={oi} className={cls}>
                          <span className="quiz-option-letter">{OPTION_LETTERS.charAt(oi)}</span>
                          <span className="quiz-option-text">{opt.image ? <QuestionImage path={opt.image} alt={opt.text} small /> : opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="exam-typed">
                    {t("exam.youWrote", { text: item.text ?? "–" })}
                    <br />
                    {t("exam.acceptedAnswers", { list: (q.acceptedAnswers ?? []).join(" · ") })}
                  </p>
                )}
                <p className={`quiz-feedback-explanation quiz-review-explanation ${item.isCorrect ? "correct" : "incorrect"}`}>
                  <strong>{verdict}</strong> {q.explanation}
                </p>
                <div><BookmarkButton questionId={q.id} /></div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
