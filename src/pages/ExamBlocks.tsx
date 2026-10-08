import { Link } from "react-router-dom";
import { quizQuestionsInBlock } from "../lib/content";
import { studyBlocks } from "../lib/blocks";
import { buildExamFormat } from "../lib/examFormat";
import { bestScore, finishedAttempts, packagesForBlock, runningAttempt, useExamRecords } from "../lib/exams";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { SubjectBadge } from "../components/SubjectBadge";
import { useI18n } from "../i18n/useI18n";
import type { ExamAttempt } from "../types/content";

/** Every block's past papers and practice packages (from the server), and its pooled exam. */
export function ExamBlocks() {
  const { t } = useI18n();
  const records = useExamRecords();
  const running = runningAttempt(records);
  const runningPackage = running ? records.packages.find((p) => p.id === running.packageId) : undefined;

  return (
    <section className="page">
      <h1>{t("exam.title")}</h1>
      <p className="subtitle">{t("exam.subtitle")}</p>

      {running && (
        <Link to={`/exam/attempt/${running.id}`} className="exam-running-banner">
          <strong>{t("exam.inProgress")}</strong>
          <span>{runningPackage?.title ?? ""}</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      {studyBlocks.map((block) => {
        const packages = packagesForBlock(block.id, records);
        const pooled = buildExamFormat(quizQuestionsInBlock(block.id).length);
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
                return (
                  <Link key={p.id} to={`/exam/papers/${p.id}`} className="nav-card exam-package-card">
                    <span className={`exam-mode-tag exam-mode-tag-${p.mode}`}>
                      {p.mode === "exam" ? t("exam.modeExam") : t("exam.modePractice")}
                    </span>
                    <h3>{p.title}</h3>
                    <p>
                      {p.mode === "exam" && p.timeLimitMinutes
                        ? t("exam.formatTimed", { count: p.questionCount, minutes: p.timeLimitMinutes })
                        : t("exam.formatCount", { count: p.questionCount })}
                      {best !== null ? ` · ${t("exam.bestScore", { score: best })}` : taken > 0 ? ` · ${t("exam.takenTimes", { count: taken })}` : ""}
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
    </section>
  );
}
