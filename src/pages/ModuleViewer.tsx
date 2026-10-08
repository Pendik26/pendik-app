import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { DriveFileView, DriveKind, NewPill, OpenedMark } from "../components/drive/DriveParts";
import { useDrive, useDriveOpened } from "../hooks/useDrive";
import { modulesByBlockSubject, moduleSubjects, type ModulePdf } from "../lib/content";
import { blockById } from "../lib/blocks";
import { driveHref, fileGroups, fileTitle, folderAt, isNew, niceName, subjectFolderPath, waitingFolders } from "../lib/drive";

/** Linked folders under a subject's folder read at once when its page opens. */
const MAX_LINKED_LOADS = 6;
import type { DriveFile } from "../lib/driveTypes";
import { groupModules } from "../lib/moduleSections";
import { subjectHueStyle } from "../lib/subjectStyle";
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

/** On phones the list sits above the viewer: bring the chosen file into view. */
function revealViewer(id: string) {
  if (window.matchMedia("(max-width: 720px)").matches) {
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

export function ModuleViewer() {
  const { blockId = "", subjectId = "" } = useParams();
  const block = blockById(blockId);
  const subject = moduleSubjects.find((s) => s.id === subjectId && s.blockId === blockId);
  const pdfs = modulesByBlockSubject.get(`${blockId}/${subjectId}`) ?? [];
  const groups = groupModules(pdfs);
  const ordered = groups ? groups.flatMap((g) => g.sections.flatMap((s) => s.pdfs)) : pdfs;
  // "pdf:{url}" or "drive:{id}".
  const [selectedKey, setSelectedKey] = useState<string>();

  const drive = useDrive();
  const { opened, markOpened } = useDriveOpened();
  const drivePath = drive.status === "ready" ? subjectFolderPath(drive.tree.root, blockId, subjectId) : null;
  const driveFolder = drive.status === "ready" && drivePath ? folderAt(drive.tree.root, drivePath) : null;
  const driveGroups = driveFolder ? fileGroups(driveFolder) : [];
  // Linked folders (shortcuts) inside the subject's folder load on demand: read the first few
  // here, so the subject's Drive files are all listed.
  const loadFolder = drive.status === "ready" ? drive.loadFolder : null;
  const waitingKeys = driveFolder ? waitingFolders(driveFolder).slice(0, MAX_LINKED_LOADS).map(({ folder }) => folder.deferred ?? "") : [];
  const waitingKey = waitingKeys.join(",");
  useEffect(() => {
    if (!loadFolder || !waitingKey) return;
    for (const key of waitingKey.split(",")) loadFolder(key);
  }, [loadFolder, waitingKey]);
  const driveFiles = driveGroups.flatMap((g) => g.files);

  const label = subject?.label ?? (driveFolder ? niceName(driveFolder.name) : null);
  if (!block || !label) {
    return (
      <section className="page">
        <p>{block && drive.status === "loading" ? "Loading…" : "Unknown module subject."}</p>
        <Link to="/modules">Back to modules</Link>
      </section>
    );
  }

  const currentPdf = ordered.find((p) => `pdf:${p.url}` === selectedKey);
  const currentDrive = driveFiles.find((f) => `drive:${f.id}` === selectedKey);
  // Nothing chosen yet: the first cleaned PDF, else the first Drive file.
  const fallbackPdf = !currentPdf && !currentDrive ? ordered.at(0) : undefined;
  const shownPdf = currentPdf ?? fallbackPdf;
  const shownDrive = currentDrive ?? (!shownPdf ? driveFiles.at(0) : undefined);

  /** Opens the Drive file before or after the one shown, if there is one. */
  const stepDrive = (dir: -1 | 1) => {
    const i = shownDrive ? driveFiles.indexOf(shownDrive) : -1;
    const target = i >= 0 ? driveFiles.at(i + dir) : undefined;
    return target && i + dir >= 0 ? () => { setSelectedKey(`drive:${target.id}`); } : undefined;
  };

  const pdfList = (list: ModulePdf[]) => (
    <ol>
      {list.map((pdf) => (
        <li key={pdf.url}>
          <button
            type="button"
            className={pdf.url === shownPdf?.url ? "ebook-toc-link active" : "ebook-toc-link"}
            onClick={() => {
              setSelectedKey(`pdf:${pdf.url}`);
              revealViewer("module-viewer");
            }}
          >
            {pdf.name}
          </button>
        </li>
      ))}
    </ol>
  );

  const driveList = (files: DriveFile[]) => (
    <ol>
      {files.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            className={file.id === shownDrive?.id ? "ebook-toc-link drive-toc-link active" : "ebook-toc-link drive-toc-link"}
            onClick={() => {
              setSelectedKey(`drive:${file.id}`);
              revealViewer("drive-viewer");
            }}
          >
            <DriveKind kind={file.kind} />
            <span className="drive-toc-name">{fileTitle(file.name)}</span>
            {isNew(file, opened) ? <NewPill /> : opened.has(file.id) && <OpenedMark />}
          </button>
        </li>
      ))}
    </ol>
  );

  const driveSection = (
      <div className="ebook-toc-section drive-toc">
        <p className="ebook-toc-group">
          Class Drive <span className="drive-live-tag">live</span>
        </p>
        {drive.status === "loading" && <p className="ebook-toc-empty">Loading…</p>}
        {drive.status === "error" && <p className="ebook-toc-empty">{drive.message}</p>}
        {drive.status === "ready" &&
          (driveGroups.length === 0 ? (
            <p className="ebook-toc-empty">Nothing for this subject in the class Drive yet.</p>
          ) : (
            driveGroups.map((g) => (
              <div key={g.path.join("/")} className="ebook-toc-part">
                {g.label && <p className="ebook-toc-sublabel">{g.label}</p>}
                {driveList(g.files)}
              </div>
            ))
          ))}
        {drive.status === "ready" && (
          <Link to={driveHref(drivePath ?? [])} className="drive-toc-browse">
            Browse the class Drive →
          </Link>
        )}
      </div>
    );

  return (
    <section className="page ebook-page subject-tinted" style={subjectHueStyle(subjectId) as CSSProperties}>
      <SubjectTrail blockId={blockId} subjectId={subjectId} current="modules" />

      {pdfs.length === 0 && !driveSection ? (
        <p>No PDFs yet for this subject — drop one into its module folder.</p>
      ) : (
        <div className="ebook-layout">
          <nav className="ebook-toc" aria-label="Module list">
            <h2 className="ebook-toc-title">{label}</h2>
            <p className="ebook-toc-subhead">{block.label}</p>
            {driveSection}
            {pdfs.length > 0 && driveSection && <p className="ebook-toc-group drive-toc-offline">Cleaned PDFs (work offline)</p>}
            {groups
              ? groups.map((group) => (
                  <div key={group.id} className="ebook-toc-section">
                    <p className="ebook-toc-group">{group.label}</p>
                    {group.sections.map((section) => (
                      <div key={section.id} className="ebook-toc-part">
                        {section.label && <p className="ebook-toc-sublabel">{section.label}</p>}
                        {section.pdfs.length > 0 ? (
                          pdfList(section.pdfs)
                        ) : (
                          <p className="ebook-toc-empty">To be added</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              : pdfList(pdfs)}
          </nav>

          <div className="ebook-content">
            {shownDrive ? (
              <DriveFileView
                key={shownDrive.id}
                file={shownDrive}
                position={driveFiles.length > 1 ? `${driveFiles.indexOf(shownDrive) + 1} of ${driveFiles.length}` : undefined}
                onPrev={stepDrive(-1)}
                onNext={stepDrive(1)}
                onShown={(f) => { markOpened(f.id); }}
              />
            ) : shownPdf ? (
              <div className="pdf-viewer" id="module-viewer">
                <div className="pdf-viewer-bar">
                  <p>{shownPdf.name}</p>
                  <a href={shownPdf.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    Open in new tab
                    <ExternalIcon />
                  </a>
                </div>
                <iframe src={shownPdf.url} title={shownPdf.name} className="pdf-frame" />
              </div>
            ) : (
              <p className="drive-empty">Pick a file from the list.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
