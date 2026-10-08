import { Link } from "react-router-dom";
import { groupByBlock } from "../lib/blocks";
import { buildSubjectOverviews } from "../lib/subjectOverview";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";

/** Every subject, by block: each card opens the subject's page with all its material. */
export function SubjectsIndex() {
  const groups = groupByBlock(buildSubjectOverviews());
  return (
    <section className="page">
      <h1>Subjects</h1>
      <p className="subtitle">Everything for one subject in one place: flashcards, quizzes, the ebook, summary, slides and labs.</p>
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((s) => (
              <Link key={s.key} to={`/subjects/${s.key}`} className="nav-card">
                <SubjectCover subjectKey={s.key} />
                <div className="nav-card-header">
                  <SubjectBadge id={s.id} label={s.label} />
                  <h2>{s.label}</h2>
                </div>
                <p>{s.facets.map((f) => f.label).join(" · ")}</p>
              </Link>
            ))}
            {upcoming.map((u) => (
              <UpcomingSubjectCard key={u.id} id={u.id} label={u.label} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
