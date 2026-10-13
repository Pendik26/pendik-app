import { Link } from "react-router-dom";
import { summarySubjects } from "../lib/content";
import { useChosenBlock } from "../hooks/useChosenBlock";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import { useI18n } from "../i18n/useI18n";

export function Summaries() {
  const chosenBlock = useChosenBlock();
  const groups = groupByBlock(summarySubjects, chosenBlock);
  const { t } = useI18n();

  return (
    <section className="page">
      <h1>{t("lib.summariesTitle")}</h1>
      <p className="subtitle">{t("lib.summariesIntro")}</p>
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((subject) => (
              <Link key={subject.id} to={`/summaries/${block.id}/${subject.id}`} className="nav-card">
                  <SubjectCover subjectKey={`${block.id}/${subject.id}`} />
                <div className="nav-card-header">
                  <SubjectBadge id={subject.id} label={subject.label} />
                  <h2>{subject.label}</h2>
                </div>
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
