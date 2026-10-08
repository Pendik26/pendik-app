import { useState } from "react";
import { Link } from "react-router-dom";
import { QuestionImage } from "../../components/exam/QuestionImage";
import { useI18n } from "../../i18n/useI18n";
import { importQuestions, packagesFromImport, suggestedMinutes } from "../../lib/admin";
import { loadExamRecords } from "../../lib/exams";
import { parseQuestionMarkdown } from "../../lib/questionMarkdown";

/**
 * Importing a Markdown file of questions: check it, save the questions as drafts, then make an
 * exam package and a practice package from them (both drafts until published).
 */
export function AdminImport() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<{ importId: string; count: number } | null>(null);
  const [made, setMade] = useState<{ exam_id: string; practice_id: string } | null>(null);
  const parsed = text.trim() ? parseQuestionMarkdown(text) : null;
  const header = parsed?.header ?? null;
  const [examTitle, setExamTitle] = useState("");
  const [practiceTitle, setPracticeTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [trackBest, setTrackBest] = useState(true);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setImported(null);
    setMade(null);
  };

  const save = async () => {
    if (!parsed || !header || parsed.problems.length) return;
    setBusy(true);
    setProblem(null);
    try {
      const importId = await importQuestions(header.title, text, parsed.questions);
      setImported({ importId, count: parsed.questions.length });
      setExamTitle(header.title);
      setPracticeTitle(`${header.title} (${t("exam.modePractice").toLowerCase()})`);
      setMinutes(String(suggestedMinutes(parsed.questions.length)));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const makePackages = async () => {
    if (!imported || !header) return;
    setBusy(true);
    setProblem(null);
    try {
      setMade(await packagesFromImport({
        importId: imported.importId,
        examTitle: examTitle.trim() || header.title,
        practiceTitle: practiceTitle.trim() || header.title,
        block: header.block,
        source: header.source,
        year: header.year,
        timeLimitMinutes: Math.max(1, Math.min(300, Number(minutes) || suggestedMinutes(imported.count))),
        trackBest,
      }));
      await loadExamRecords().catch(() => undefined);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}

      {!imported && (
        <>
          <p className="account-note">
            {t("admin.importHint")} <a href="https://github.com/Pendik26/pendik-app/blob/major/docs/questions.md" target="_blank" rel="noopener noreferrer">{t("admin.formatGuide")}</a>
          </p>
          <div className="admin-toolbar">
            <label className="btn btn-secondary btn-small">
              {t("admin.chooseFile")}
              <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => void readFile(e.target.files?.[0])} />
            </label>
          </div>
          <textarea className="form-input admin-textarea admin-mono" rows={14} value={text} spellCheck={false}
            placeholder={"---\ntitle: Block 1.1 UB 2025\nblock: 1.1\nsource: ub\nyear: 2025\n---\n\n## 1\n…"}
            onChange={(e) => { setText(e.target.value); }} />
        </>
      )}

      {parsed && !imported && (
        <div className="account-card">
          {header && (
            <p>
              <strong>{header.title}</strong> · {t("admin.blockN", { block: header.block })}
              {header.source && ` · ${header.source}`}
              {header.year && ` · ${header.year}`}
            </p>
          )}
          <p>{t("admin.questionsReady", { count: parsed.questions.length })}</p>
          {parsed.problems.length > 0 && (
            <>
              <p className="account-error">{t("admin.fixFirst", { count: parsed.problems.length })}</p>
              <ul className="admin-problems">
                {parsed.problems.slice(0, 50).map((p) => <li key={`${p.line}:${p.message}`}>{t("admin.lineN", { line: p.line })} {p.message}</li>)}
              </ul>
            </>
          )}
          <button type="button" className="btn btn-small" disabled={busy || !header || parsed.problems.length > 0 || parsed.questions.length === 0} onClick={() => void save()}>
            {busy ? t("common.saving") : t("admin.importDrafts", { count: parsed.questions.length })}
          </button>
          {parsed.questions.length > 0 && (
            <details className="admin-preview">
              <summary>{t("admin.preview")}</summary>
              <ol>
                {parsed.questions.slice(0, 200).map((q, i) => (
                  <li key={i}>
                    <p className="exam-stem">{q.stem}</p>
                    {q.stem_image && <QuestionImage path={q.stem_image} alt={q.stem_image_alt} small />}
                    {q.options ? (
                      <ul>{q.options.map((o, oi) => <li key={oi} className={oi === q.correct_index ? "admin-correct" : undefined}>{o.text}</li>)}</ul>
                    ) : (
                      <p className="admin-correct">{q.accepted_answers?.join(" · ")}</p>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {imported && !made && (
        <div className="account-card admin-form">
          <p className="account-success">{t("admin.importedN", { count: imported.count })}</p>
          <p className="account-note">{t("admin.makePackagesHint")}</p>
          <label className="account-field">
            <span>{t("admin.examTitle")}</span>
            <input className="form-input" value={examTitle} onChange={(e) => { setExamTitle(e.target.value); }} />
          </label>
          <label className="account-field">
            <span>{t("admin.timeLimit")}</span>
            <input className="form-input" type="number" min={1} max={300} value={minutes} onChange={(e) => { setMinutes(e.target.value); }} />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={trackBest} onChange={(e) => { setTrackBest(e.target.checked); }} />
            {t("admin.trackBest")}
          </label>
          <label className="account-field">
            <span>{t("admin.practiceTitle")}</span>
            <input className="form-input" value={practiceTitle} onChange={(e) => { setPracticeTitle(e.target.value); }} />
          </label>
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void makePackages()}>{t("admin.makePackages")}</button>
        </div>
      )}

      {made && (
        <div className="account-card">
          <p className="account-success">{t("admin.packagesMade")}</p>
          <div className="account-row">
            <Link to="/admin/packages" className="btn btn-small">{t("admin.reviewAndPublish")}</Link>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setText(""); setImported(null); setMade(null); }}>{t("admin.importAnother")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
