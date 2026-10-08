import { useEffect, useState } from "react";
import { driveDownloadUrl, drivePreviewUrl, driveViewUrl, fileFacts, fileTitle, kindLabel } from "../../lib/drive";
import type { DriveFile, DriveFileKind } from "../../lib/driveTypes";

/** A small tag for what a row is: a folder, slides, a PDF, a recording… */
export function DriveKind({ kind }: { kind: DriveFileKind | "folder" }) {
  return (
    <span className={`drive-kind drive-kind-${kind}`} aria-hidden="true">
      {kind === "folder" ? (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ) : kind === "video" || kind === "audio" ? (
        <svg viewBox="0 0 24 24" width="15" height="15">
          <path d="M8 6.5v11l9-5.5z" fill="currentColor" />
        </svg>
      ) : (
        kindLabel(kind)
      )}
    </span>
  );
}

export function NewPill({ count }: { count?: number }) {
  return <span className="drive-new-pill">{count === undefined ? "New" : `${count} new`}</span>;
}

export function OpenedMark() {
  return (
    <span className="drive-opened" title="Opened">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Opened</span>
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One Drive file in Google's own viewer (slides, PDFs and recordings), with the way to the
 * files before and after it. Give it `key={file.id}` so each file starts out loading.
 */
export function DriveFileView({
  file,
  position,
  onPrev,
  onNext,
  onClose,
  onShown,
}: {
  file: DriveFile;
  /** "3 of 12" */
  position?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
  /** Called once the file is on screen (to mark it opened). */
  onShown?: (file: DriveFile) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const title = fileTitle(file.name);

  useEffect(() => {
    onShown?.(file);
    // Once per file: the parent keys this component by file id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="pdf-viewer drive-viewer" id="drive-viewer" aria-label={`Viewing ${title}`}>
      <div className="drive-viewer-bar">
        <div className="drive-viewer-title">
          <DriveKind kind={file.kind} />
          <p>
            <strong>{title}</strong>
            <small>{fileFacts(file)}</small>
          </p>
        </div>
        <div className="drive-viewer-actions">
          {(onPrev || onNext) && (
            <span className="drive-viewer-step">
              <button type="button" className="icon-btn" onClick={onPrev} disabled={!onPrev} aria-label="Previous file" title="Previous file (←)">
                <Icon d="M14.5 6l-6 6 6 6" />
              </button>
              {position && <span className="drive-viewer-pos">{position}</span>}
              <button type="button" className="icon-btn" onClick={onNext} disabled={!onNext} aria-label="Next file" title="Next file (→)">
                <Icon d="M9.5 6l6 6-6 6" />
              </button>
            </span>
          )}
          <a href={driveDownloadUrl(file.id)} className="icon-btn" aria-label="Download" title="Download" rel="noopener noreferrer">
            <Icon d="M12 4.5v10M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14" />
          </a>
          <a href={driveViewUrl(file.id)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small">
            Open in Drive
            <Icon d="M7 17 17 7M9 7h8v8" />
          </a>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the viewer" title="Close (Esc)">
              <Icon d="M6 6l12 12M18 6L6 18" />
            </button>
          )}
        </div>
      </div>
      <div className={loaded ? "drive-frame-wrap" : "drive-frame-wrap loading"}>
        {!loaded && (
          <p className="drive-frame-loading" role="status">
            <span className="drive-spinner" aria-hidden="true" />
            Opening {title}…
          </p>
        )}
        <iframe
          src={drivePreviewUrl(file.id)}
          title={title}
          className="pdf-frame"
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => { setLoaded(true); }}
        />
      </div>
    </section>
  );
}
