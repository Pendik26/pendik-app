import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { quizQuestionsInBlock } from "../lib/content";
import { blockFirst, studyBlocks } from "../lib/blocks";
import { useChosenBlock } from "../hooks/useChosenBlock";
import { buildExamFormat } from "../lib/examFormat";
import { averageScore, bestScore, finishedAttempts, packagesForBlock, useExamRecords } from "../lib/exams";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { RadialGauge } from "../components/RadialGauge";
import { SubjectBadge } from "../components/SubjectBadge";
import { RunningAttemptBanner } from "../components/exam/RunningAttemptBanner";
import { useI18n } from "../i18n/useI18n";
import type { ExamAttempt } from "../types/content";

/** Every block's past papers and practice packages (from the server), and its pooled exam. */
export function ExamBlocks() {
  const { t } = useI18n();
  const records = useExamRecords();
  const chosenBlock = useChosenBlock();
  // Year and type (the paper's source, e.g. Block Test or Tryout) narrow the papers; the choices come from
  // the published papers themselves, so an empty combination is never offered.
  const [year, setYear] = useState("");
  const [source, setSource] = useState("");
  const years = useMemo(() => [...new Set(records.packages.flatMap((p) => (p.year ? [String(p.year)] : [])))].sort().reverse(), [records.packages]);
  const sources = useMemo(() => [...new Set(records.packages.flatMap((p) => (p.source ? [p.source] : [])))].sort((a, b) => a.localeCompare(b)), [records.packages]);
  const filtering = year !== "" || source !== "";
  const matches = (p: { year: number | null; source: string | null }) =>
    (year === "" || String(p.year) === year) && (source === "" || p.source === source);

  return (
    <section className="page">
      <h1>{t("exam.title")}</h1>
      <p className="subtitle">{t("exam.subtitle")}</p>

      <RunningAttemptBanner />

      {records.packages.some((p) => p.mode === "practice") && (
        <div className="card-grid dashboard-section">
          <Link to="/exam/practice" className="nav-card exam-package-card">
            <span className="exam-mode-tag exam-mode-tag-practice">{t("exam.modePractice")}</span>
            <h3>{t("bank.title")}</h3>
            <p>{t("bank.cardHint")}</p>
          </Link>
          <Link to="/exam/bookmarks" className="nav-card exam-package-card">
            <span className="exam-mode-tag">{t("bookmarks.tag")}</span>
            <h3>{t("bookmarks.title")}</h3>
            <p>{t("bookmarks.cardHint")}</p>
          </Link>
        </div>
      )}

      {(years.length > 1 || sources.length > 1) && (
        <div className="exam-filters" role="group" aria-label={t("exam.filters")}>
          {years.length > 1 && (
            <select className="form-input admin-select" aria-label={t("bank.years")} value={year} onChange={(e) => { setYear(e.target.value); }}>
              <option value="">{t("exam.allYears")}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {sources.length > 1 && (
            <select className="form-input admin-select" aria-label={t("exam.type")} value={source} onChange={(e) => { setSource(e.target.value); }}>
              <option value="">{t("exam.allTypes")}</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {filtering && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setYear(""); setSource(""); }}>{t("exam.clearFilters")}</button>
          )}
        </div>
      )}

      {blockFirst(studyBlocks, (b) => b.id, chosenBlock).map((block) => {
        const packages = packagesForBlock(block.id, records).filter(matches);
        // The pooled exam has no year or type, so it steps aside while those are being filtered.
        const pooled = buildExamFormat(filtering ? 0 : quizQuestionsInBlock(block.id).length);
        if (packages.length === 0 && pooled.questionCount === 0) return null;
        const lastPooled = readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(block.id), []).at(-1);
        return (
          <div key={block.id} className="dashboard-section">
            <h2 className="section-heading">
              <SubjectBadge id={block.id} label={block.label} />
              {block.label}
            </h2>
            <div className="card-grid">
              {packages.map((p) => {
                const best = p.trackBest ? bestScore(p.id, records) : null;
                const taken = finishedAttempts(p.id, records).length;
                // Exams show the best score, practice the average: a ring once there is one.
                const ring = p.mode === "exam" ? (p.trackBest ? best : null) : averageScore(p.id, records);
                return (
                  <Link key={p.id} to={`/exam/papers/${p.id}`} className="nav-card exam-package-card">
                    {ring !== null && (
                      <span className="exam-package-ring">
                        <RadialGauge percent={ring} size={44}
                          label={p.mode === "exam" ? t("exam.bestScore", { score: ring }) : t("exam.averageScore", { score: ring })} />
                        <span className="exam-package-ring-value" aria-hidden="true">{ring}</span>
                      </span>
                    )}
                    <span className={`exam-mode-tag exam-mode-tag-${p.mode}`}>
                      {p.mode === "exam" ? t("exam.modeExam") : t("exam.modePractice")}
                    </span>
                    <h3>{p.title}</h3>
                    <p>
                      {p.mode === "exam" && p.timeLimitMinutes
                        ? t("exam.formatTimed", { count: p.questionCount, minutes: p.timeLimitMinutes })
                        : t("exam.formatCount", { count: p.questionCount })}
                      {taken > 0 ? ` · ${t("exam.takenTimes", { count: taken })}` : ""}
                    </p>
                  </Link>
                );
              })}
              {pooled.questionCount > 0 && (
                <Link to={`/exam/${block.id}`} className="nav-card exam-package-card">
                  <span className="exam-mode-tag">{t("exam.pooled")}</span>
                  <h3>{t("exam.pooledTitle")}</h3>
                  <p>
                    {t("exam.formatTimed", { count: pooled.questionCount, minutes: Math.round(pooled.timeLimitSec / 60) })}
                    {lastPooled && ` · ${t("exam.lastScore", { score: lastPooled.score, total: lastPooled.total })}`}
                  </p>
                </Link>
              )}
            </div>
          </div>
        );
      })}
      {records.loaded && records.packages.length === 0 && <p className="account-note">{t("exam.noPapersYet")}</p>}
      {filtering && !records.packages.some(matches) && <p className="account-note">{t("exam.noneMatch")}</p>}
    </section>
  );
}
