import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DriveKind } from "./DriveParts";
import { useDrive, useDriveOpened } from "../../hooks/useDrive";
import { useI18n } from "../../i18n/useI18n";
import { allFiles, fileTitle, placeLabel, updatedAgo } from "../../lib/drive";

/** Class Drive files shown on Home. */
const SHOWN = 4;

/** Home's "Recently opened" Class Drive files, newest first. Renders nothing until there are some. */
export function RecentDriveFiles() {
  const { t } = useI18n();
  const drive = useDrive();
  const { recent, openedAt } = useDriveOpened();
  // Read once when Home opens; "2 d ago" doesn't need to tick.
  const [now] = useState(() => Date.now());
  const files = useMemo(() => {
    if (drive.status !== "ready") return [];
    const byId = new Map(allFiles(drive.tree.root).map((f) => [f.file.id, f]));
    return recent.flatMap((id) => byId.get(id) ?? []).slice(0, SHOWN);
  }, [drive, recent]);
  if (files.length === 0) return null;

  return (
    <section className="home-section">
      <h2 className="home-heading">{t("drive.recentlyOpened")}</h2>
      <div className="row-list">
        {files.map(({ file, path }) => {
          const params = new URLSearchParams(path.map((name) => ["f", name]));
          params.set("file", file.id);
          return (
            <Link key={file.id} to={`/drive?${params.toString()}`} className="row-item">
              <DriveKind kind={file.kind} />
              <span className="row-item-body">
                <span className="row-item-title">{fileTitle(file.name)}</span>
                <span className="row-item-detail">
                  {[placeLabel(path, t), openedAt[file.id] && t("drive.openedWhen", { when: updatedAgo(openedAt[file.id], now, t) })].filter(Boolean).join(" · ")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
