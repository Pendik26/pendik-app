import { useEffect, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { renderMarkdown } from "../lib/markdownHtml";
import { useHashScroll } from "../hooks/useHashScroll";
import { subjectKey, summaries } from "../lib/content";
import { writeJSON, STORAGE_KEYS } from "../lib/storage";
import { useReadingPrefs } from "../hooks/useReadingPrefs";
import { ReadingControls } from "../components/ReadingControls";
import { subjectHueStyle } from "../lib/subjectStyle";
import { SubjectTrail } from "../components/SubjectTrail";

export function SummaryDetail() {
  const { blockId = "", subjectId = "" } = useParams();
  const key = subjectKey(blockId, subjectId);
  const markdown = summaries.get(key);
  useHashScroll(markdown);
  const [readingPrefs, setReadingPrefs] = useReadingPrefs();

  useEffect(() => {
    if (subjectId) {
      writeJSON(STORAGE_KEYS.lastRead(key), new Date().toISOString());
    }
  }, [key, subjectId]);

  if (!markdown) {
    return (
      <section className="page">
        <p>Unknown subject.</p>
        <Link to="/summaries">Back to summaries</Link>
      </section>
    );
  }

  return (
    <section className="page subject-tinted" style={subjectHueStyle(subjectId) as CSSProperties}>
      <SubjectTrail blockId={blockId} subjectId={subjectId} current="summaries" />
      <ReadingControls prefs={readingPrefs} onChange={setReadingPrefs} />
      <div
        className="summary-content"
        style={{
          fontSize: `${readingPrefs.fontScale}rem`,
          fontFamily: readingPrefs.accessibleFont ? "var(--font-reading-accessible)" : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
      />
    </section>
  );
}
