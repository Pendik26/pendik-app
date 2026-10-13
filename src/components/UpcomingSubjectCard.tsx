import { SubjectBadge } from "./SubjectBadge";
import { useI18n } from "../i18n/useI18n";

export function UpcomingSubjectCard({ id, label }: { id: string; label: string }) {
  const { t } = useI18n();
  return (
    <div className="nav-card nav-card-upcoming">
      <div className="nav-card-header">
        <SubjectBadge id={id} label={label} />
        <h2>{label}</h2>
      </div>
      <p>{t("lib.comingSoon")}</p>
    </div>
  );
}
