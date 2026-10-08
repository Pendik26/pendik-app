import { useEffect, useState, type CSSProperties } from "react";
import { itemAt } from "../lib/arrays";
import { Link, Navigate, useParams } from "react-router-dom";
import { CheckIcon } from "../components/icons";
import { renderMarkdown } from "../lib/markdownHtml";
import { useHashScroll } from "../hooks/useHashScroll";
import { ebookChapterKeys, ebookMeta, ebookPdfs, loadEbookChapter, subjectKey } from "../lib/content";
import { readJSON, writeJSON, STORAGE_KEYS } from "../lib/storage";
import { logStudy, recordActivity } from "../lib/activity";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useReadingPrefs } from "../hooks/useReadingPrefs";
import { ReadingControls } from "../components/ReadingControls";
import { subjectHueStyle } from "../lib/subjectStyle";
import type { ReadingPosition } from "../types/content";
import { SubjectTrail } from "../components/SubjectTrail";

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        d="M7 17 17 7M9 7h8v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EbookReader() {
  const { blockId = "", subjectId = "", chapterId } = useParams();
  const key = subjectKey(blockId, subjectId);
  const meta = ebookMeta.get(key);
  const pdfs = ebookPdfs.get(key) ?? [];
  const hasChapters = (meta?.chapters.length ?? 0) > 0;

  const position = readJSON<ReadingPosition | null>(
    STORAGE_KEYS.ebookPosition(key),
    null,
  );
  const [completedChapters, setCompletedChapters] = useLocalStorage<string[]>(
    STORAGE_KEYS.ebookCompleted(key),
    [],
  );
  const [readingPrefs, setReadingPrefs] = useReadingPrefs();
  const isComplete = chapterId ? completedChapters.includes(chapterId) : false;

  const toggleComplete = () => {
    if (!chapterId) return;
    if (!completedChapters.includes(chapterId)) logStudy(key, "chapters");
    setCompletedChapters((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId],
    );
  };

  useEffect(() => {
    if (!meta) return;
    recordActivity();
    if (chapterId) {
      writeJSON<ReadingPosition>(STORAGE_KEYS.ebookPosition(key), {
        chapterId,
        scroll: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    // Scrolling to the top of a new chapter is ScrollManager's job (Back keeps the position).
  }, [key, chapterId, meta]);

  // Each chapter is its own chunk, fetched when opened (precached by the service worker).
  const chapterKey = chapterId ? `${key}/${chapterId}` : "";
  const [tocOpen, setTocOpen] = useState(false);
  // Picking a chapter folds the contents away again.
  const [tocChapter, setTocChapter] = useState(chapterId);
  if (tocChapter !== chapterId) {
    setTocChapter(chapterId);
    setTocOpen(false);
  }
  const [loaded, setLoaded] = useState<{ key: string; markdown?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!chapterKey || !ebookChapterKeys.includes(chapterKey)) return;
    let cancelled = false;
    loadEbookChapter(chapterKey).then(
      (markdown) => {
        if (!cancelled) setLoaded({ key: chapterKey, markdown });
      },
      () => {
        if (!cancelled) setLoaded({ key: chapterKey, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [chapterKey]);
  const current = loaded?.key === chapterKey ? loaded : null;
  useHashScroll(current?.markdown);

  if (!meta) {
    return (
      <section className="page">
        <p>Unknown ebook.</p>
        <Link to="/ebooks">Back to ebooks</Link>
      </section>
    );
  }

  if (!chapterId && hasChapters) {
    const resumeChapter = position?.chapterId ?? meta.chapters[0]?.id;
    return <Navigate to={`/ebooks/${blockId}/${subjectId}/${resumeChapter}`} replace />;
  }

  const chapterIndex = hasChapters ? meta.chapters.findIndex((c) => c.id === chapterId) : -1;
  const chapter = itemAt(meta.chapters, chapterIndex);
  const markdown = current?.markdown;
  // Undefined at either end of the book.
  const prevChapter = itemAt(meta.chapters, chapterIndex - 1);
  const nextChapter = itemAt(meta.chapters, chapterIndex + 1);

  if (hasChapters && (!chapter || !ebookChapterKeys.includes(chapterKey))) {
    return (
      <section className="page">
        <p>Unknown chapter.</p>
        <Link to="/ebooks">Back to ebooks</Link>
      </section>
    );
  }

  const sidebar = (
    <nav className={tocOpen ? "ebook-toc ebook-toc-collapsible is-open" : "ebook-toc ebook-toc-collapsible"} aria-label="Book contents">
      {/* Phones: the contents fold into one line, so each chapter starts at its text. */}
      <button type="button" className="ebook-toc-toggle" onClick={() => { setTocOpen((o) => !o); }} aria-expanded={tocOpen}>
        <span>{chapter ? `Chapter ${chapterIndex + 1} of ${meta.chapters.length}` : meta.title}</span>
        <span className="ebook-toc-toggle-hint">
          Contents <span aria-hidden="true">{tocOpen ? "▴" : "▾"}</span>
        </span>
      </button>
      <h2 className="ebook-toc-title">{meta.title}</h2>

      {hasChapters && (
        <ol>
          {meta.chapters.map((c, i) => (
            <li key={c.id}>
              <Link
                to={`/ebooks/${blockId}/${subjectId}/${c.id}`}
                className={c.id === chapterId ? "ebook-toc-link active" : "ebook-toc-link"}
                aria-current={c.id === chapterId ? "page" : undefined}
              >
                {i + 1}. {c.title}
                {completedChapters.includes(c.id) && (
                  <span className="ebook-toc-check" title="Completed">
                    <CheckIcon />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}

      {pdfs.length > 0 && (
        <div className="ebook-toc-section">
          <h3 className="ebook-toc-subhead">PDF</h3>
          <ul className="ebook-toc-flat">
            {pdfs.map((pdf) => (
              <li key={pdf.url}>
                <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="ebook-toc-link">
                  {pdf.name}
                  <ExternalIcon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta.resources && meta.resources.length > 0 && (
        <div className="ebook-toc-section">
          <h3 className="ebook-toc-subhead">Further reading</h3>
          <ul className="ebook-toc-flat">
            {meta.resources.map((res) => (
              <li key={res.url}>
                <a href={res.url} target="_blank" rel="noopener noreferrer" className="ebook-toc-link">
                  {res.title}
                  <ExternalIcon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );

  return (
    <section className="page ebook-page subject-tinted" style={subjectHueStyle(subjectId) as CSSProperties}>
      <SubjectTrail blockId={blockId} subjectId={subjectId} current="ebooks" />
      <div className="ebook-layout">
        {sidebar}

        <div className="ebook-content">
          {hasChapters && markdown ? (
            <>
              <ReadingControls prefs={readingPrefs} onChange={setReadingPrefs} />
              <div
                className="summary-content"
                style={{
                  fontSize: `${readingPrefs.fontScale}rem`,
                  fontFamily: readingPrefs.accessibleFont ? "var(--font-reading-accessible)" : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
              />
              <button
                type="button"
                className={isComplete ? "btn btn-secondary mark-complete-btn active" : "btn btn-secondary mark-complete-btn"}
                onClick={toggleComplete}
                aria-pressed={isComplete}
              >
                <CheckIcon />
                {isComplete ? "Completed" : "Mark chapter complete"}
              </button>
              <div className="ebook-nav">
                {prevChapter ? (
                  <Link
                    to={`/ebooks/${blockId}/${subjectId}/${prevChapter.id}`}
                    className="btn btn-secondary"
                  >
                    ← {prevChapter.title}
                  </Link>
                ) : (
                  <span />
                )}
                {nextChapter ? (
                  <Link to={`/ebooks/${blockId}/${subjectId}/${nextChapter.id}`} className="btn">
                    {nextChapter.title} →
                  </Link>
                ) : (
                  <span className="ebook-done">End of book</span>
                )}
              </div>
            </>
          ) : hasChapters && current?.failed ? (
            <p className="ebook-status">Couldn't load this chapter. Check your connection and try again.</p>
          ) : hasChapters ? (
            <p className="ebook-status" role="status">
              Loading chapter…
            </p>
          ) : pdfs.length > 0 ? (
            <div className="pdf-viewer">
              <div className="pdf-viewer-bar">
                <p>{meta.description}</p>
                <a href={pdfs[0].url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  Open in new tab
                  <ExternalIcon />
                </a>
              </div>
              <iframe
                src={pdfs[0].url}
                title={`${meta.title} PDF`}
                className="pdf-frame"
              />
            </div>
          ) : (
            <p>No content yet — drop a chapter or PDF into this subject's folder.</p>
          )}
        </div>
      </div>
    </section>
  );
}
