import { useState } from "react";
import { Link } from "react-router-dom";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import { abandonAttempt, attemptTitle, loadExamRecords, runningAttempt, useExamRecords } from "../../lib/exams";

/**
 * "You have an unfinished attempt": on Home, so a student who closed the tab finds the way back.
 * Practice can be thrown away from here; an exam can only be continued and submitted.
 */
export function RunningAttemptBanner() {
  const { t } = useI18n();
  const records = useExamRecords();
  const running = runningAttempt(records);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!running) return null;

  const discard = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await abandonAttempt(running.id);
      await loadExamRecords();
    } catch (e) {
      setProblem(errorText(e));
    }
    setBusy(false);
    setAsking(false);
  };

  return (
    <div className="running-attempt" role="status">
      <div className="running-attempt-text">
        <strong>{running.mode === "exam" ? t("exam.inProgress") : t("exam.practiceInProgress")}</strong>
        <span>{attemptTitle(running, records)}</span>
      </div>
      <div className="running-attempt-actions">
        {running.mode === "practice" && !asking && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { setAsking(true); }}>
            {t("exam.discard")}
          </button>
        )}
        {asking && (
          <>
            <span>{t("exam.discardAsk")}</span>
            <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => { setAsking(false); }}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void discard()}>
              {t("exam.discardYes")}
            </button>
          </>
        )}
        {!asking && (
          <Link to={`/exam/attempt/${running.id}`} className="btn btn-small">
            {t("exam.continue")}
          </Link>
        )}
      </div>
      {problem && <p className="account-error" role="alert">{problem}</p>}
    </div>
  );
}
