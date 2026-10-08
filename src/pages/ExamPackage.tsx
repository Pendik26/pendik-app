import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";
import { blockById } from "../lib/blocks";
import {
  AttemptError,
  ATTEMPT_ERRORS,
  bestScore,
  finishedAttempts,
  runningAttempt,
  startAttempt,
  useExamRecords,
} from "../lib/exams";

/** One package: what it is, the student's past attempts, and the button to start or continue. */
export function ExamPackage() {
  const { packageId = "" } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const records = useExamRecords();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pkg = records.packages.find((p) => p.id === packageId);
  if (!pkg) {
    return (
      <section className="page">
        <p className="subtitle">{records.loaded ? t("exam.errNotFound") : t("common.loading")}</p>
        <Link to="/exam" className="btn btn-secondary">{t("exam.backToExams")}</Link>
      </section>
    );
  }

  const running = runningAttempt(records);
  const runningHere = running?.packageId === pkg.id ? running : null;
  const runningOther = running && !runningHere ? records.packages.find((p) => p.id === running.packageId) : undefined;
  const past = finishedAttempts(pkg.id, records);
  const best = pkg.trackBest ? bestScore(pkg.id, records) : null;
  const block = pkg.block ? blockById(pkg.block) : undefined;
  const isExam = pkg.mode === "exam";
  const date = (iso: string) => new Date(iso).toLocaleString(language === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { attempt_id } = await startAttempt(pkg.id);
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
      <div className="quiz-start">
        <h1>{pkg.title}</h1>
        <p className="subtitle">
          {[block?.label, isExam ? t("exam.modeExam") : t("exam.modePractice")].filter(Boolean).join(" · ")}
        </p>
        <p className="exam-format-note">
          {isExam && pkg.timeLimitMinutes
            ? t("exam.formatTimed", { count: pkg.questionCount, minutes: pkg.timeLimitMinutes })
            : t("exam.formatCount", { count: pkg.questionCount })}
        </p>
        <ul className="exam-rules">
          {isExam ? (
            <>
              <li>{t("exam.ruleKeys")}</li>
              <li>{t("exam.ruleTime")}</li>
              <li>{t("exam.ruleTab")}</li>
              {pkg.trackBest && <li>{t("exam.ruleBest")}</li>}
            </>
          ) : (
            <>
              <li>{t("exam.rulePractice")}</li>
              <li>{t("exam.ruleShuffle")}</li>
            </>
          )}
        </ul>
        {best !== null && <p className="exam-last-score">{t("exam.bestScore", { score: best })}</p>}
        {problem && <p className="account-error" role="alert">{problem}</p>}
        <div className="quiz-start-actions">
          {runningOther ? (
            <>
              <p className="account-note">{t("exam.finishOtherFirst", { title: runningOther.title })}</p>
              <Link to={`/exam/attempt/${running?.id ?? ""}`} className="btn quiz-start-btn">{t("exam.continue")}</Link>
            </>
          ) : runningHere ? (
            <Link to={`/exam/attempt/${runningHere.id}`} className="btn quiz-start-btn">{t("exam.continue")}</Link>
          ) : (
            <button type="button" className="btn quiz-start-btn" onClick={() => void start()} disabled={busy}>
              {busy ? t("common.loading") : past.length ? t("exam.startAgain") : t("exam.start")}
            </button>
          )}
        </div>
      </div>

      {past.length > 0 && (
        <div className="dashboard-section">
          <h2 className="section-heading">{t("exam.yourAttempts")}</h2>
          <ol className="exam-history">
            {past.map((a) => (
              <li key={a.id}>
                <Link to={`/exam/result/${a.id}`}>
                  <span>{a.finishedAt ? date(a.finishedAt) : ""}</span>
                  <strong>{a.score === null ? "–" : `${a.score}%`}</strong>
                  <small>{t("exam.counts", { correct: a.correctCount ?? 0, wrong: a.wrongCount ?? 0, blank: a.blankCount ?? 0 })}</small>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
