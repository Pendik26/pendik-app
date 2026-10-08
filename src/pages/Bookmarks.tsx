import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookmarkButton } from "../components/exam/BookmarkButton";
import { QuestionImage } from "../components/exam/QuestionImage";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";
import { AttemptError, ATTEMPT_ERRORS, myBookmarks, runningAttempt, startBankPractice, useExamRecords, type BookmarkedQuestion } from "../lib/exams";

const OPTION_LETTERS = "ABCDEFGH";

/** The questions the student bookmarked, with their answers; practise them again as a set. */
export function Bookmarks() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const records = useExamRecords();
  const running = runningAttempt(records);
  const [list, setList] = useState<BookmarkedQuestion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myBookmarks().then(setList, (e: Error) => { setProblem(e.message); });
  }, []);

  const practise = async () => {
    if (!list) return;
    setBusy(true);
    setProblem(null);
    try {
      const { attempt_id } = await startBankPractice({
        block: null, sources: [], years: [], subjects: [], bookmarkedOnly: true,
        count: Math.min(list.length, 200), timeLimitMinutes: null, title: t("bookmarks.practiceTitle"),
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
      <Link to="/exam/practice" className="back-link">← {t("bank.title")}</Link>
      <h1>{t("bookmarks.title")}</h1>
      <p className="subtitle">{t("bookmarks.subtitle")}</p>
      {problem && <p className="account-error" role="alert">{problem}</p>}

      {!list ? (
        !problem && <p className="subtitle">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="account-note">{t("bookmarks.empty")}</p>
      ) : (
        <>
          <div className="quiz-start-actions">
            {running ? (
              <Link to={`/exam/attempt/${running.id}`} className="btn">{t("exam.continue")}</Link>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void practise()}>
                {t("bookmarks.practise", { count: list.length })}
              </button>
            )}
          </div>
          <ol className="bookmark-list">
            {list.map((q) => (
              <li key={q.id} className="account-card">
                <div className="bookmark-meta">
                  <span>{[t("admin.blockN", { block: q.block }), q.source, q.year, q.subject].filter(Boolean).join(" · ")}</span>
                  <BookmarkButton questionId={q.id} />
                </div>
                <p className="quiz-question-text exam-stem">{q.stem}</p>
                {q.stemImage && <QuestionImage path={q.stemImage} alt={q.stemImageAlt} small />}
                {q.options ? (
                  <div className="quiz-options quiz-options-static">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={oi === q.correct ? "quiz-option correct" : "quiz-option"}>
                        <span className="quiz-option-letter">{OPTION_LETTERS.charAt(oi)}</span>
                        <span className="quiz-option-text">{opt.image ? <QuestionImage path={opt.image} alt={opt.text} small /> : opt.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="exam-typed">{t("exam.acceptedAnswers", { list: (q.acceptedAnswers ?? []).join(" · ") })}</p>
                )}
                {q.explanation && <p className="quiz-feedback-explanation quiz-review-explanation correct">{q.explanation}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
