import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import { QuestionList } from "../../components/admin/QuestionList";
import {
  deletePackage,
  listAllPackages,
  packageQuestions,
  setPackageStatus,
  updatePackage,
  type AdminQuestion,
} from "../../lib/admin";
import { loadExamRecords, type PackageSummary } from "../../lib/exams";

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
              <select className="form-input admin-select" aria-label={t("admin.packageTrack", { title: p.title })} value={p.track ?? ""}
                onChange={(e) => { const v = e.target.value; void act(() => updatePackage(p.id, { track: v === "IUP" || v === "REGULER" ? v : null })); }}>
                <option value="">{t("track.both")}</option>
                <option value="IUP">{t("track.iupOnly")}</option>
                <option value="REGULER">{t("track.regulerOnly")}</option>
              </select>
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

function PackageQuestions({ pkg, onChanged }: { pkg: PackageSummary; onChanged: () => void }) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    packageQuestions(pkg.id).then(setQuestions, (e: Error) => { setProblem(e.message); });
  }, [pkg.id]);
  useEffect(reload, [reload]);

  if (!questions) return <p className="subtitle">{problem ?? t("common.loading")}</p>;
  return <QuestionList questions={questions} onChanged={() => { reload(); onChanged(); }} />;
}
