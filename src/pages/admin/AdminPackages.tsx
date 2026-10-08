import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import {
  deletePackage,
  deleteQuestion,
  listAllPackages,
  packageQuestions,
  setPackageStatus,
  updatePackage,
  updateQuestion,
  type AdminQuestion,
} from "../../lib/admin";
import { loadExamRecords, type PackageSummary } from "../../lib/exams";
import { parseQuestionMarkdown, questionMarkdown } from "../../lib/questionMarkdown";

/** Every package, drafts included: publish, rename, time limit, and its questions. */
export function AdminPackages() {
  const { t } = useI18n();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const reload = useCallback(() => {
    listAllPackages().then(setPackages, (e: Error) => { setProblem(e.message); });
    void loadExamRecords().catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  const act = async (work: () => Promise<void>) => {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    reload();
  };

  if (!packages) return <p className="subtitle">{problem ?? t("common.loading")}</p>;
  if (packages.length === 0) return <p className="account-note">{t("admin.noPackages")}</p>;

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <ul className="admin-list">
        {packages.map((p) => (
          <li key={p.id} className="account-card admin-package">
            <div className="admin-package-head">
              <div>
                <strong>{p.title}</strong>
                <small>
                  {[p.block && t("admin.blockN", { block: p.block }), p.mode === "exam" ? t("exam.modeExam") : t("exam.modePractice"),
                    t("exam.formatCount", { count: p.questionCount }), p.timeLimitMinutes && `${p.timeLimitMinutes} min`]
                    .filter(Boolean).join(" · ")}
                </small>
              </div>
              <span className={`admin-state admin-state-${p.status === "published" ? "active" : "none"}`}>
                {p.status === "published" ? t("admin.published") : t("admin.draft")}
              </span>
            </div>
            <div className="admin-actions">
              <button type="button" className="btn btn-link"
                onClick={() => void act(() => setPackageStatus(p.id, p.status === "published" ? "draft" : "published"))}>
                {p.status === "published" ? t("admin.unpublish") : t("admin.publish")}
              </button>
              <button type="button" className="btn btn-link"
                onClick={() => {
                  const title = window.prompt(t("admin.examTitle"), p.title);
                  if (title?.trim()) void act(() => updatePackage(p.id, { title: title.trim() }));
                }}>
                {t("admin.rename")}
              </button>
              {p.mode === "exam" && (
                <button type="button" className="btn btn-link"
                  onClick={() => {
                    const value = window.prompt(t("admin.timeLimit"), String(p.timeLimitMinutes ?? ""));
                    const n = Number(value);
                    if (value && n >= 1 && n <= 300) void act(() => updatePackage(p.id, { time_limit_minutes: Math.round(n) }));
                  }}>
                  {t("admin.setTime")}
                </button>
              )}
              <button type="button" className="btn btn-link" onClick={() => { setOpen((o) => (o === p.id ? null : p.id)); }} aria-expanded={open === p.id}>
                {t("admin.questions")}
              </button>
              <button type="button" className="btn btn-link account-danger"
                onClick={() => { if (window.confirm(t("admin.deletePackageConfirm", { title: p.title }))) void act(() => deletePackage(p.id)); }}>
                {t("admin.delete")}
              </button>
            </div>
            {open === p.id && <PackageQuestions pkg={p} onChanged={reload} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One question as editable Markdown (the import format, without the file header). */
function asMarkdown(q: AdminQuestion): string {
  const text = questionMarkdown({ title: "-", block: "1.1", source: null, year: null, subject: null }, [q]);
  return text.slice(text.indexOf("## 1")).replace(/^## 1\n/, "");
}

function PackageQuestions({ pkg, onChanged }: { pkg: PackageSummary; onChanged: () => void }) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    packageQuestions(pkg.id).then(setQuestions, (e: Error) => { setProblem(e.message); });
  }, [pkg.id]);
  useEffect(reload, [reload]);

  const save = async () => {
    if (!editing) return;
    const parsed = parseQuestionMarkdown(`---\ntitle: -\nblock: ${pkg.block ?? "1.1"}\n---\n## 1\n${editing.text}`);
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
      reload();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  if (!questions) return <p className="subtitle">{problem ?? t("common.loading")}</p>;
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
                  <small>{t("admin.revisionN", { n: q.revision })}</small>
                  <button type="button" className="btn btn-link" onClick={() => { setEditing({ id: q.id, text: asMarkdown(q) }); }}>{t("admin.edit")}</button>
                  <button type="button" className="btn btn-link account-danger"
                    onClick={() => {
                      if (!window.confirm(t("admin.deleteQuestionConfirm"))) return;
                      deleteQuestion(q.id).then(() => { reload(); onChanged(); }, (e: Error) => { setProblem(e.message); });
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
