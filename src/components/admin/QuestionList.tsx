import { useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import { deleteQuestion, updateQuestion, type AdminQuestion } from "../../lib/admin";
import { parseQuestionMarkdown, questionMarkdown } from "../../lib/questionMarkdown";

/** One question as editable Markdown (the import format, without the file header). */
function asMarkdown(q: AdminQuestion): string {
  const text = questionMarkdown({ title: "-", block: "1.1", source: null, year: null, subject: null }, [q]);
  return text.slice(text.indexOf("## 1")).replace(/^## 1\n/, "");
}

/**
 * Questions with their keys, each editable as Markdown or deletable. Used for a package's
 * questions and for the whole question bank. `details` adds a line under each question.
 */
export function QuestionList({ questions, onChanged, details }: {
  questions: readonly AdminQuestion[];
  onChanged: () => void;
  details?: (q: AdminQuestion) => string;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    // The header only has to parse; the question keeps its own block.
    const parsed = parseQuestionMarkdown(`---\ntitle: -\nblock: 1.1\n---\n## 1\n${editing.text}`);
    const q = parsed.questions[0];
    if (!q || parsed.problems.length) {
      setProblem(parsed.problems.map((p) => p.message).join(" ") || t("admin.notAQuestion"));
      return;
    }
    setProblem(null);
    try {
      await updateQuestion(editing.id, {
        subject: q.subject,
        stem: q.stem,
        stem_image: q.stem_image,
        stem_image_alt: q.stem_image_alt,
        options: q.options,
        correct_index: q.correct_index,
        accepted_answers: q.accepted_answers,
        explanation: q.explanation,
      });
      setEditing(null);
      onChanged();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="admin-questions">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <p className="account-note">{t("admin.editHint")}</p>
      <ol>
        {questions.map((q) => (
          <li key={q.id}>
            {editing?.id === q.id ? (
              <div className="admin-form">
                <textarea className="form-input admin-textarea admin-mono" rows={10} value={editing.text} spellCheck={false}
                  onChange={(e) => { setEditing({ id: q.id, text: e.target.value }); }} />
                <div className="account-row">
                  <button type="button" className="btn btn-small" onClick={() => void save()}>{t("common.save")}</button>
                  <button type="button" className="btn btn-link" onClick={() => { setEditing(null); setProblem(null); }}>{t("common.cancel")}</button>
                </div>
              </div>
            ) : (
              <div className="admin-question">
                <p className="exam-stem">{q.stem}</p>
                {q.options ? (
                  <ul>{q.options.map((o, oi) => <li key={oi} className={oi === q.correct_index ? "admin-correct" : undefined}>{o.text}</li>)}</ul>
                ) : (
                  <p className="admin-correct">{q.accepted_answers?.join(" · ")}</p>
                )}
                <div className="admin-actions">
                  <small>{[details?.(q), t("admin.revisionN", { n: q.revision })].filter(Boolean).join(" · ")}</small>
                  <button type="button" className="btn btn-link" onClick={() => { setEditing({ id: q.id, text: asMarkdown(q) }); }}>{t("admin.edit")}</button>
                  <button type="button" className="btn btn-link account-danger"
                    onClick={() => {
                      if (!window.confirm(t("admin.deleteQuestionConfirm"))) return;
                      deleteQuestion(q.id).then(onChanged, (e: Error) => { setProblem(e.message); });
                    }}>
                    {t("admin.delete")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
