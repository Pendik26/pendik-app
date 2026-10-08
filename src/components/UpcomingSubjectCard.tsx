import { SubjectBadge } from "./SubjectBadge";

export function UpcomingSubjectCard({ id, label }: { id: string; label: string }) {
  return (
    <div className="nav-card nav-card-upcoming">
      <div className="nav-card-header">
        <SubjectBadge id={id} label={label} />
        <h2>{label}</h2>
      </div>
      <p>Content coming soon.</p>
    </div>
  );
}
