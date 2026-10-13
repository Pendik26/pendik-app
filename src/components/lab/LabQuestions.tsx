import { useState } from "react";
import type { LabQuestion } from "../../lib/labActivities";
import { useI18n } from "../../i18n/useI18n";

const LETTERS = "ABCDEFGH";

/** The activity's check questions, answered one by one with instant feedback. */
export function LabQuestions({ questions }: { questions: LabQuestion[] }) {
  /** The option chosen for each question answered so far, by question index. */
  const { t } = useI18n();
  const [answers, setAnswers] = useState<ReadonlyMap<number, number>>(new Map());
  const answered = answers.size;
  const correct = questions.filter((q, i) => answers.get(i) === q.answer).length;

  return (
    <section className="lab-card lab-questions" aria-labelledby="lab-questions-title">
      <div className="lab-questions-head">
        <h2 id="lab-questions-title">{t("lab.check")}</h2>
        {answered > 0 && (
          <span className="lab-questions-score">
            {t("lab.correctOf", { correct, total: questions.length })}
            {answered === questions.length && (
              <button type="button" className="btn-link" onClick={() => { setAnswers(new Map()); }}>
                {t("common.retry")}
              </button>
            )}
          </span>
        )}
      </div>
      <ol className="lab-question-list">
        {questions.map((q, qi) => {
          const chosen = answers.get(qi);
          const revealed = chosen !== undefined;
          return (
            <li key={qi} className="lab-question">
              <p className="quiz-question-text">{q.question}</p>
              <div className="quiz-options" role="radiogroup" aria-label={q.question}>
                {q.options.map((opt, oi) => {
                  let cls = "quiz-option";
                  if (revealed) {
                    if (oi === q.answer) cls += " correct";
                    else if (oi === chosen) cls += " incorrect";
                  }
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={cls}
                      role="radio"
                      aria-checked={chosen === oi}
                      disabled={revealed}
                      onClick={() => { setAnswers((prev) => new Map(prev).set(qi, oi)); }}
                    >
                      <span className="quiz-option-letter">{LETTERS.charAt(oi)}</span>
                      <span className="quiz-option-text">{opt}</span>
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className={`quiz-feedback ${chosen === q.answer ? "correct" : "incorrect"}`} role="status">
                  <p className="quiz-feedback-verdict">{chosen === q.answer ? t("study.correct") : t("study.notQuite")}</p>
                  <p className="quiz-feedback-explanation">{q.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
