import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import { QuestionList } from "../../components/admin/QuestionList";
import {
  deletePackage,
  listAllPackages,
  listDeletedPackages,
  packageQuestions,
  restorePackage,
  setPackageStatus,
  updatePackage,
  type AdminQuestion,
} from "../../lib/admin";
import { loadExamRecords, type PackageSummary } from "../../lib/exams";
import { distinct, filterPackages, NO_FILTER, type PackageFilter } from "../../lib/packageFilter";

/** Every package, drafts included: find, publish, rename, time limit, and its questions. */
export function AdminPackages() {
  const { t, language } = useI18n();
  const day = (iso: string) => new Date(iso).toLocaleDateString(language === "id" ? "id-ID" : "en-GB", { dateStyle: "medium" });
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<PackageFilter>(NO_FILTER);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(() => {
    (showDeleted ? listDeletedPackages() : listAllPackages()).then(setPackages, (e: Error) => { setProblem(errorText(e)); });
    void loadExamRecords().catch(() => undefined);
  }, [showDeleted]);
  useEffect(reload, [reload]);

  const shown = useMemo(() => filterPackages(packages ?? [], filter), [packages, filter]);
  const blocks = useMemo(() => distinct((packages ?? []).map((p) => p.block)), [packages]);
  const sources = useMemo(() => distinct((packages ?? []).map((p) => p.source)), [packages]);
  const years = useMemo(() => distinct((packages ?? []).map((p) => p.year)).reverse(), [packages]);
  const set = <K extends keyof PackageFilter>(key: K, value: PackageFilter[K]) => { setFilter((f) => ({ ...f, [key]: value })); };

  const act = async (work: () => Promise<void>) => {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(errorText(e));
    }
    reload();
  };

  if (!packages) return <p className="subtitle">{problem ?? t("common.loading")}</p>;

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <div className="admin-toolbar">
        <input className="form-input" type="search" placeholder={t("admin.searchPackages")} value={filter.text}
          onChange={(e) => { set("text", e.target.value); }} />
        <select className="form-input admin-select" aria-label={t("admin.status")} value={filter.status}
          onChange={(e) => { set("status", e.target.value as PackageFilter["status"]); }}>
          <option value="">{t("admin.anyStatus")}</option>
          <option value="published">{t("admin.published")}</option>
          <option value="draft">{t("admin.draft")}</option>
        </select>
        <select className="form-input admin-select" aria-label={t("admin.mode")} value={filter.mode}
          onChange={(e) => { set("mode", e.target.value as PackageFilter["mode"]); }}>
          <option value="">{t("admin.anyMode")}</option>
          <option value="exam">{t("exam.modeExam")}</option>
          <option value="practice">{t("exam.modePractice")}</option>
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterBlock")} value={filter.block}
          onChange={(e) => { set("block", e.target.value); }}>
          <option value="">{t("admin.anyBlock")}</option>
          {blocks.map((b) => <option key={b} value={b}>{t("admin.blockN", { block: b })}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterSource")} value={filter.source}
          onChange={(e) => { set("source", e.target.value); }}>
          <option value="">{t("admin.anySource")}</option>
          {sources.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterYear")} value={filter.year}
          onChange={(e) => { set("year", e.target.value); }}>
          <option value="">{t("admin.anyYear")}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="admin-check">
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setPackages(null); setOpen(null); setShowDeleted(e.target.checked); }} />
          {t("admin.showDeleted")}
        </label>
      </div>
      {packages.length > 0 && <p className="account-note">{t("admin.packagesShown", { shown: shown.length, total: packages.length })}</p>}
      {packages.length === 0 && <p className="account-note">{showDeleted ? t("admin.noDeletedPackages") : t("admin.noPackages")}</p>}
      {packages.length > 0 && shown.length === 0 && <p className="account-note">{t("admin.noPackagesMatch")}</p>}
      <ul className="admin-list">
        {shown.map((p) => (
          <li key={p.id} className="account-card admin-package">
            <div className="admin-package-head">
              <div>
                <strong>{p.title}</strong>
                <small>
                  {[p.block && t("admin.blockN", { block: p.block }), p.mode === "exam" ? t("exam.modeExam") : t("exam.modePractice"),
                    p.source, p.year, t("exam.formatCount", { count: p.questionCount }), p.timeLimitMinutes && `${p.timeLimitMinutes} min`,
                    p.mode === "exam" && p.trackBest && t("admin.tracksBest"), p.createdAt && t("admin.createdOn", { date: day(p.createdAt) })]
                    .filter(Boolean).join(" · ")}
                </small>
              </div>
              <span className={`admin-state admin-state-${p.status === "published" ? "active" : "none"}`}>
                {p.status === "published" ? t("admin.published") : t("admin.draft")}
              </span>
            </div>
            {showDeleted ? (
              <div className="admin-actions">
                <button type="button" className="btn btn-link" onClick={() => void act(() => restorePackage(p.id))}>{t("admin.restore")}</button>
              </div>
            ) : (
            <div className="admin-actions">
              <button type="button" className="btn btn-link"
                onClick={() => {
                  const publishing = p.status !== "published";
                  const question = publishing
                    ? t("admin.publishConfirm", { title: p.title, count: p.questionCount, who: p.track === "IUP" ? t("track.iup") : p.track === "REGULER" ? t("track.reguler") : t("track.both") })
                    : t("admin.unpublishConfirm", { title: p.title });
                  if (window.confirm(question)) void act(() => setPackageStatus(p.id, publishing ? "published" : "draft"));
                }}>
                {p.status === "published" ? t("admin.unpublish") : t("admin.publish")}
              </button>
              <button type="button" className="btn btn-link"
                onClick={() => {
                  const title = window.prompt(t("admin.examTitle"), p.title);
                  if (title?.trim()) void act(() => updatePackage(p.id, { title: title.trim() }));
                }}>
                {t("admin.rename")}
              </button>
              <button type="button" className="btn btn-link" aria-expanded={editing === p.id}
                onClick={() => { setEditing((e) => (e === p.id ? null : p.id)); }}>
                {t("admin.editDetails")}
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
            )}
            {editing === p.id && (
              <PackageDetails pkg={p} blocks={blocks} sources={sources}
                onSave={(patch) => void act(async () => { await updatePackage(p.id, patch); setEditing(null); })}
                onCancel={() => { setEditing(null); }} />
            )}
            {open === p.id && <PackageQuestions pkg={p} onChanged={reload} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Block, type and year of a package, changed in place. */
function PackageDetails({ pkg, blocks, sources, onSave, onCancel }: {
  pkg: PackageSummary;
  blocks: string[];
  sources: string[];
  onSave: (patch: { block: string; source: string | null; year: number | null }) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [block, setBlock] = useState(pkg.block ?? "");
  const [source, setSource] = useState(pkg.source ?? "");
  const [year, setYear] = useState(pkg.year ? String(pkg.year) : "");
  const blockOk = /^[0-9]+\.[0-9]+$/.test(block.trim());
  const yearOk = year === "" || /^(19|20|21)[0-9]{2}$/.test(year);
  const id = `pkg-${pkg.id}`;
  return (
    <div className="admin-form admin-package-details">
      <div className="admin-pair">
        <label className="account-field">
          <span>{t("admin.packageBlock")}</span>
          <input className="form-input" list={`${id}-blocks`} value={block} aria-invalid={!blockOk} onChange={(e) => { setBlock(e.target.value); }} />
        </label>
        <label className="account-field">
          <span>{t("admin.packageType")}</span>
          <input className="form-input" list={`${id}-sources`} value={source} placeholder={t("admin.packageTypeHint")} onChange={(e) => { setSource(e.target.value); }} />
        </label>
        <label className="account-field">
          <span>{t("admin.packageYear")}</span>
          <input className="form-input" inputMode="numeric" maxLength={4} value={year} placeholder="2025" aria-invalid={!yearOk}
            onChange={(e) => { setYear(e.target.value.replace(/[^0-9]/g, "")); }} />
        </label>
        <datalist id={`${id}-blocks`}>{blocks.map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id={`${id}-sources`}>{sources.map((x) => <option key={x} value={x} />)}</datalist>
      </div>
      {!yearOk && <p className="account-error">{t("admin.yearHint")}</p>}
      <div className="account-row">
        <button type="button" className="btn btn-small" disabled={!blockOk || !yearOk}
          onClick={() => { onSave({ block: block.trim(), source: source.trim() || null, year: year ? Number(year) : null }); }}>
          {t("common.save")}
        </button>
        <button type="button" className="btn btn-link" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

function PackageQuestions({ pkg, onChanged }: { pkg: PackageSummary; onChanged: () => void }) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    packageQuestions(pkg.id).then(setQuestions, (e: Error) => { setProblem(errorText(e)); });
  }, [pkg.id]);
  useEffect(reload, [reload]);

  if (!questions) return <p className="subtitle">{problem ?? t("common.loading")}</p>;
  const deleted = questions.filter((q) => q.deleted).length;
  return (
    <>
      {deleted > 0 && <p className="account-note">{t("admin.packageHasDeleted", { count: deleted })}</p>}
      <QuestionList questions={questions} onChanged={() => { reload(); onChanged(); }} />
    </>
  );
}
