import { Link } from "react-router-dom";
import { groupByBlock } from "../lib/blocks";
import { buildSubjectOverviews } from "../lib/subjectOverview";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import { useI18n } from "../i18n/useI18n";

/** Every subject, by block: each card opens the subject's page with all its material. */
export function SubjectsIndex() {
  const { t } = useI18n();
  const groups = groupByBlock(buildSubjectOverviews(t));
  return (
    <section className="page">
      <h1>{t("nav.subjects")}</h1>
      <p className="subtitle">{t("misc.subjectsIntro")}</p>
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
