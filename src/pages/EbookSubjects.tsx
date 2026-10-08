import { Link } from "react-router-dom";
import { ebookMeta, ebookPdfs, ebookSubjects, keyOf } from "../lib/content";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import type { ReadingPosition } from "../types/content";

export function EbookSubjects() {
  const groups = groupByBlock(ebookSubjects);

  return (
    <section className="page">
      <h1>Ebooks</h1>
      <p className="subtitle">Chapter readers, reference PDFs, and curated links by subject.</p>
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
                    ? `${completedCount}/${meta.chapters.length} chapters complete`
                    : `${meta.chapters.length} chapters`,
                );
              }
              if (pdfs.length > 0) parts.push(pdfs.length === 1 ? "PDF" : `${pdfs.length} PDFs`);
              if (meta.resources?.length) parts.push(`${meta.resources.length} links`);

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
                    {chapterIndex >= 0 && <> · resume at chapter {chapterIndex + 1}</>}
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
