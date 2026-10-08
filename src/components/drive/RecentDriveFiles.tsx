import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DriveKind } from "./DriveParts";
import { DriveIcon } from "../icons";
import { useDrive, useDriveOpened } from "../../hooks/useDrive";
import { useI18n } from "../../i18n/useI18n";
import { allFiles, fileTitle, placeLabel } from "../../lib/drive";

/** Class Drive files shown on Home. */
const SHOWN = 4;

/** Home's "Recently opened" Class Drive files, newest first. Renders nothing until there are some. */
export function RecentDriveFiles() {
  const { t } = useI18n();
  const drive = useDrive();
  const { recent } = useDriveOpened();
  const files = useMemo(() => {
    if (drive.status !== "ready") return [];
    const byId = new Map(allFiles(drive.tree.root).map((f) => [f.file.id, f]));
    return recent.flatMap((id) => byId.get(id) ?? []).slice(0, SHOWN);
  }, [drive, recent]);
  if (files.length === 0) return null;

  return (
    <div className="dashboard-section">
      <h2 className="section-heading">
        <DriveIcon />
        {t("drive.recentlyOpened")}
      </h2>
      <div className="continue-list">
        {files.map(({ file, path }) => {
          const params = new URLSearchParams(path.map((name) => ["f", name]));
          params.set("file", file.id);
          return (
            <Link key={file.id} to={`/drive?${params.toString()}`} className="continue-item">
              <DriveKind kind={file.kind} />
              <span className="continue-item-body">
                <span className="continue-item-title">{fileTitle(file.name)}</span>
                <span className="continue-item-detail">{placeLabel(path, t)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
