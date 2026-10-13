import { Link } from "react-router-dom";
import { ebookMeta, ebookPdfs, ebookSubjects, keyOf } from "../lib/content";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { useChosenBlock } from "../hooks/useChosenBlock";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import type { ReadingPosition } from "../types/content";
import { useI18n } from "../i18n/useI18n";

export function EbookSubjects() {
  const chosenBlock = useChosenBlock();
  const groups = groupByBlock(ebookSubjects, chosenBlock);
  const { t } = useI18n();

  return (
    <section className="page">
      <h1>{t("lib.ebooksTitle")}</h1>
      <p className="subtitle">{t("lib.ebooksIntro")}</p>
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((subject) => {
              const meta = ebookMeta.get(keyOf(subject));
              if (!meta) return null;
              const pdfs = ebookPdfs.get(keyOf(subject)) ?? [];
              const position = readJSON<ReadingPosition | null>(
                STORAGE_KEYS.ebookPosition(keyOf(subject)),
                null,
              );
              const chapterIndex = position
                ? meta.chapters.findIndex((c) => c.id === position.chapterId)
                : -1;
              const completedCount = readJSON<string[]>(
                STORAGE_KEYS.ebookCompleted(keyOf(subject)),
                [],
              ).length;

              const parts: string[] = [];
              if (meta.chapters.length > 0) {
                parts.push(
                  completedCount > 0
                    ? t("lib.chaptersDone", { done: completedCount, count: meta.chapters.length })
                    : t("lib.chapters", { count: meta.chapters.length }),
                );
              }
              if (pdfs.length > 0) parts.push(pdfs.length === 1 ? t("lib.onePdf") : t("lib.pdfs", { count: pdfs.length }));
              if (meta.resources?.length) parts.push(t("lib.links", { count: meta.resources.length }));

              return (
                <Link key={subject.id} to={`/ebooks/${block.id}/${subject.id}`} className="nav-card">
                  <SubjectCover subjectKey={`${block.id}/${subject.id}`} />
                  <div className="nav-card-header">
                    <SubjectBadge id={subject.id} label={meta.title} />
                    <h2>{meta.title}</h2>
                  </div>
                  <p>{meta.description}</p>
                  <p className="nav-card-meta">
                    {parts.join(" · ")}
                    {chapterIndex >= 0 && <> · {t("lib.resumeAt", { n: chapterIndex + 1 })}</>}
                  </p>
                </Link>
              );
            })}
            {upcoming.map((u) => (
              <UpcomingSubjectCard key={u.id} id={u.id} label={u.label} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
