import { Link } from "react-router-dom";
import { useI18n } from "../i18n/useI18n";
import { moduleSubjects, modulesByBlockSubject } from "../lib/content";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import { DriveKind } from "../components/drive/DriveParts";
import { useDrive, useDriveOpened } from "../hooks/useDrive";
import { countFiles, filesUnder, folderAt, isNew, subjectFolderPath, updatedAgo } from "../lib/drive";

/** The class Google Drive, for signed-in students: a way in, and how much is there. */
function DriveCard() {
  const { t } = useI18n();
  const drive = useDrive();
  const { opened } = useDriveOpened();
  const total = drive.status === "ready" ? countFiles(drive.tree.root) : null;
  const fresh = drive.status === "ready" ? filesUnder(drive.tree.root).filter((f) => isNew(f, opened)).length : 0;
  return (
    <Link to="/drive" className="drive-card">
      <DriveKind kind="folder" />
      <span>
        <strong>{t("drive.title")}</strong>
        <small>
          {total !== null && drive.status === "ready"
              ? `${t("drive.cardLive", { count: total, when: updatedAgo(drive.tree.updatedAt, undefined, t) })}${fresh > 0 ? ` ${t("drive.newThisWeekCount", { count: fresh })}` : ""}`
              : t("drive.cardIntro")}
        </small>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/** How many files a subject has in the class Drive, once it's loaded. */
function useDriveCount(): (blockId: string, subjectId: string) => number | null {
  const drive = useDrive();
  return (blockId, subjectId) => {
    if (drive.status !== "ready") return null;
    const path = subjectFolderPath(drive.tree.root, blockId, subjectId);
    const folder = path && folderAt(drive.tree.root, path);
    return folder ? countFiles(folder) : null;
  };
}

export function Modules() {
  const { t } = useI18n();
  const groups = groupByBlock(moduleSubjects);
  const driveCount = useDriveCount();

  if (groups.length === 0) {
    return (
      <section className="page">
        <h1>{t("modules.title")}</h1>
        <p className="subtitle">{t("modules.none")}</p>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>{t("modules.title")}</h1>
      <p className="subtitle">{t("modules.intro")}</p>
      <DriveCard />
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((subject) => {
              const pdfs = modulesByBlockSubject.get(`${block.id}/${subject.id}`) ?? [];
              const inDrive = driveCount(block.id, subject.id);
              return (
                <Link key={subject.id} to={`/modules/${block.id}/${subject.id}`} className="nav-card">
                  <SubjectCover subjectKey={`${block.id}/${subject.id}`} />
                  <div className="nav-card-header">
                    <SubjectBadge id={subject.id} label={subject.label} />
                    <h2>{subject.label}</h2>
                  </div>
                  <p>
                    {t("modules.pdfCount", { count: pdfs.length })}
                    {inDrive !== null && ` · ${t("modules.inDrive", { count: inDrive })}`}
                  </p>
                </Link>
              );
            })}
            {subjects.length === 0 &&
              upcoming.map((u) => <UpcomingSubjectCard key={u.id} id={u.id} label={u.label} />)}
          </div>
        </div>
      ))}
    </section>
  );
}
