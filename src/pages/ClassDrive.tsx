import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { HighlightText } from "../components/HighlightText";
import { DriveFileView, DriveKind, NewPill, OpenedMark } from "../components/drive/DriveParts";
import { RefreshIcon, SearchIcon } from "../components/icons";
import { useDrive, useDriveOpened } from "../hooks/useDrive";
import { useI18n } from "../i18n/useI18n";
import {
  allFiles,
  allFolders,
  changedAt,
  countFiles,
  fileFacts,
  fileTitle,
  filesUnder,
  folderAt,
  isNew,
  niceName,
  placeLabel,
  searchDrive,
  sortFiles,
  updatedAgo,
  waitingFolders,
  waitingOnPath,
  type DriveSort,
} from "../lib/drive";
import type { DriveFile, DriveFolder } from "../lib/driveTypes";

/** A search result: a folder or a file, with the folders it's in. */
type Hit = { kind: "folder"; folder: DriveFolder; path: string[] } | { kind: "file"; file: DriveFile; path: string[] };

/** Files shown under "New this week" at the top. */
const NEW_SHOWN = 6;

/** The time now, ticking each minute (for "updated 3 min ago"). */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => { setNow(Date.now()); }, 60_000);
    return () => { window.clearInterval(id); };
  }, []);
  return now;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function RowSkeleton() {
  return (
    <ul className="drive-skeleton" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} />
      ))}
    </ul>
  );
}

/** Everything in the class's Google Drive, folder by folder, for signed-in students. */
export function ClassDrive() {
  const { t } = useI18n();
  const drive = useDrive();
  const { opened, markOpened } = useDriveOpened();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const now = useMinuteClock();
  const searchRef = useRef<HTMLInputElement>(null);
  const [showAllNew, setShowAllNew] = useState(false);

  const urlPath = params.getAll("f");
  const fileId = params.get("file");
  const urlQuery = params.get("q") ?? "";
  const sort: DriveSort = params.get("sort") === "newest" ? "newest" : "name";
  // What's typed lives here, and reaches the URL (for Back and links) after a pause: binding the
  // box to the URL directly drops keystrokes, since navigation updates arrive as transitions.
  const [query, setQueryText] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQueryText(urlQuery);
  }
  const deferredQuery = useDeferredValue(query);

  const tree = drive.status === "ready" ? drive.tree : null;
  // A Drive whose top holds just one folder ("SEMESTER 1") opens inside it, until a second one
  // appears next to it.
  const home = useMemo(() => {
    const out: string[] = [];
    let at = tree?.root;
    while (at && at.files.length === 0 && at.folders.length === 1) {
      const only: DriveFolder | undefined = at.folders.at(0);
      if (!only) break;
      out.push(only.name);
      at = only;
    }
    return out;
  }, [tree]);
  const path = urlPath.length > 0 ? urlPath : home;
  const atHome = path.length === home.length && home.every((name, i) => path.at(i) === name);

  /** The page with some of its settings changed (folder, file, search, order). */
  const hrefWith = useCallback(
    (change: { path?: readonly string[]; file?: string | null; q?: string; sort?: DriveSort }) => {
      const next = new URLSearchParams();
      for (const name of change.path ?? path) next.append("f", name);
      const file = change.file === undefined ? fileId : change.file;
      if (file) next.set("file", file);
      const q = change.q ?? query;
      if (q) next.set("q", q);
      if ((change.sort ?? sort) === "newest") next.set("sort", "newest");
      const qs = next.toString();
      return qs ? `/drive?${qs}` : "/drive";
    },
    [path, fileId, query, sort],
  );

  const index = useMemo(() => {
    if (!tree) return null;
    const files = allFiles(tree.root);
    return {
      files,
      byId: new Map(files.map((f) => [f.file.id, f])),
      searchable: [
        ...allFolders(tree.root).map(({ folder, path: p }) => ({ item: { kind: "folder", folder, path: p } as Hit, name: folder.name, path: p.slice(0, -1) })),
        ...files.map(({ file, path: p }) => ({ item: { kind: "file", file, path: p } as Hit, name: fileTitle(file.name), path: p })),
      ],
    };
  }, [tree]);

  const folder = tree ? folderAt(tree.root, path) : null;
  // An archive's cohort folder on the way to here: read when it's first opened, then checked
  // once a visit. Until then the path below it can't be followed.
  const waiting = tree ? waitingOnPath(tree.root, path) : null;
  const pathKey = path.join("\u0000");
  const archiveAt = useMemo(() => {
    let at = tree?.root;
    let archive: string | null = null;
    let key: string | null = null;
    for (const name of path) {
      at = at?.folders.find((f) => f.name === name);
      if (!at) break;
      if (at.archive) archive = at.name;
      if (at.deferred) {
        key = at.deferred;
        break;
      }
    }
    return { archive, key };
    // path is a fresh array each render; its contents are what matter.
  }, [tree, pathKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadFolder = drive.status === "ready" ? drive.loadFolder : null;
  useEffect(() => {
    if (archiveAt.key && loadFolder) loadFolder(archiveAt.key);
  }, [archiveAt.key, loadFolder]);
  const cohortState = archiveAt.key && drive.status === "ready" ? drive.folderState(archiveAt.key) : null;
  const unopened = useMemo(() => (tree ? waitingFolders(tree.root).length : 0), [tree]);
  const selected = fileId && index ? index.byId.get(fileId) : undefined;
  const searching = deferredQuery.trim().length >= 2;
  const results = useMemo(() => (index && searching ? searchDrive(index.searchable, deferredQuery) : null), [index, searching, deferredQuery]);
  const newFiles = useMemo(
    () => (index ? index.files.filter(({ file }) => isNew(file, opened, now)).sort((a, b) => changedAt(b.file) - changedAt(a.file)) : []),
    [index, opened, now],
  );

  // The files in the list being looked at, in order: what ← and → step through.
  const shownFiles = useMemo((): { file: DriveFile; path: string[] }[] => {
    if (results) return results.matches.flatMap((m) => (m.item.kind === "file" ? [{ file: m.item.file, path: m.item.path }] : []));
    return folder ? sortFiles(folder.files, sort).map((file) => ({ file, path })) : [];
    // path is a fresh array each render; its contents are in the folder.
  }, [results, folder, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = selected ? shownFiles.findIndex((f) => f.file.id === selected.file.id) : -1;
  const prev = at > 0 ? shownFiles.at(at - 1) : undefined;
  const next = at >= 0 ? shownFiles.at(at + 1) : undefined;

  const open = useCallback(
    (target: { file: DriveFile; path: string[] } | undefined) => {
      if (!target) return;
      // From search results the file opens in its folder, with the search kept.
      navigate(hrefWith({ path: results ? path : target.path, file: target.file.id }), { replace: true });
    },
    [navigate, hrefWith, results, path],
  );
  const close = useCallback(() => { navigate(hrefWith({ file: null }), { replace: true }); }, [navigate, hrefWith]);

  // "/" finds a file; ← and → step through the list; Esc closes the viewer or clears the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        if (e.target === searchRef.current && query) setQueryText("");
        else if (selected && !isTyping(e.target)) close();
      } else if (selected && !isTyping(e.target) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const target = e.key === "ArrowLeft" ? prev : next;
        if (!target) return;
        open(target);
        // Keyboard focus follows the file that's open.
        window.setTimeout(() => {
          document.querySelector<HTMLElement>(`.drive-row[data-file="${CSS.escape(target.file.id)}"]`)?.focus({ preventScroll: false });
        }, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [selected, prev, next, open, close, query, hrefWith, setParams]);

  const setQuery = (q: string) => { setQueryText(q); };
  useEffect(() => {
    if (query === urlQuery) return;
    const timer = window.setTimeout(() => {
      setSyncedQuery(query);
      setParams(new URLSearchParams(hrefWith({ q: query }).split("?")[1] ?? ""), { replace: true });
    }, 250);
    return () => { window.clearTimeout(timer); };
  }, [query, urlQuery, hrefWith, setParams]);

  const total = tree ? countFiles(tree.root) : 0;
  const head = (
    <header className="drive-head">
      <div>
        <h1>{t("drive.title")}</h1>
        <p className="subtitle">
          {tree
            ? t("drive.introCount", { count: total })
            : t("drive.intro")}
          {newFiles.length > 0 && ` ${t("drive.newThisWeekCount", { count: newFiles.length })}`}
        </p>
      </div>
      {drive.status === "ready" && (
        <div className="drive-status">
          <span className={drive.problem ? "drive-live off" : "drive-live"}>
            <span className="drive-live-dot" aria-hidden="true" />
            {drive.refreshing ? t("drive.checking") : t("drive.updated", { when: updatedAgo(drive.tree.updatedAt, now, t) })}
          </span>
          <button
            type="button"
            className={drive.refreshing || cohortState?.loading ? "icon-btn drive-refresh spinning" : "icon-btn drive-refresh"}
            onClick={() => {
              drive.refresh();
              if (archiveAt.key) drive.loadFolder(archiveAt.key, true);
            }}
            disabled={drive.refreshing || cohortState?.loading}
            aria-label={t("drive.refreshLabel")}
            title={t("drive.refreshTitle")}
          >
            <RefreshIcon />
          </button>
        </div>
      )}
    </header>
  );

  if (drive.status !== "ready" || !index) {
    return (
      <section className="page drive-page">
        {head}
        {drive.status === "loading" && <RowSkeleton />}
        {drive.status === "error" && (
          <EmptyState title={t("drive.loadFailed")}>
            <p>{drive.message}</p>
            <button type="button" className="btn btn-secondary" onClick={drive.refresh}>
              {t("drive.tryAgain")}
            </button>
          </EmptyState>
        )}
      </section>
    );
  }

  const fileRow = (file: DriveFile, filePath: string[], ranges?: [number, number][]) => {
    const fresh = isNew(file, opened, now);
    return (
      <li key={file.id}>
        <Link
          to={hrefWith({ path: results ? path : filePath, file: file.id })}
          replace
          className={["drive-row", file.id === fileId && "active", fresh && "is-new"].filter(Boolean).join(" ")}
          aria-current={file.id === fileId ? "true" : undefined}
          data-file={file.id}
          onClick={() => {
            if (window.matchMedia("(max-width: 960px)").matches) {
              requestAnimationFrame(() => document.getElementById("drive-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }
          }}
        >
          <DriveKind kind={file.kind} />
          <span className="drive-row-main">
            <span className="drive-row-name">
              <HighlightText text={fileTitle(file.name)} ranges={ranges} />
            </span>
            <span className="drive-row-sub">{results ? placeLabel(filePath, t) : fileFacts(file, now, t)}</span>
          </span>
          {fresh ? <NewPill /> : opened.has(file.id) && <OpenedMark />}
        </Link>
      </li>
    );
  };

  const folderRow = (f: DriveFolder, folderPath: string[], ranges?: [number, number][], showPath = false) => {
    const files = filesUnder(f);
    const fresh = files.filter((file) => isNew(file, opened, now)).length;
    return (
      <li key={folderPath.join("/")}>
        <Link to={hrefWith({ path: folderPath, file: null, q: "" })} className="drive-row drive-row-folder">
          <DriveKind kind="folder" />
          <span className="drive-row-main">
            <span className="drive-row-name">
              <HighlightText text={f.name === f.name.toUpperCase() ? niceName(f.name) : f.name} ranges={showPath ? undefined : ranges} />
            </span>
            <span className="drive-row-sub">
              {showPath && `${placeLabel(folderPath.slice(0, -1), t)} · `}
              {f.deferred && !f.loaded
                ? t("drive.loadsWhenOpened")
                : f.archive
                  ? t("drive.linkedFolder", { folders: f.folders.length, files: f.files.length })
                  : files.length === 0
                    ? t("drive.empty")
                    : t("drive.fileCount", { count: files.length })}
            </span>
          </span>
          {fresh > 0 && <NewPill count={fresh} />}
          <span className="drive-row-chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      </li>
    );
  };

  const parent = path.slice(0, -1);
  const folderName = atHome ? t("drive.title") : niceName(path.at(-1) ?? "");
  // The trail starts below the home folder; its names would only repeat "Class Drive".
  const trail = path.map((name, i) => ({ name, i })).filter(({ i }) => i >= home.length || !path.slice(0, home.length).every((n, j) => n === home.at(j)));

  return (
    <section className="page drive-page">
      {head}

      <div className="drive-toolbar">
        <nav className="drive-crumbs" aria-label={t("drive.folderNav")}>
          {!atHome && (
            <Link to={hrefWith({ path: parent, file: null })} className="drive-up" aria-label={t("drive.upTo", { name: parent.length > home.length ? niceName(parent.at(-1) ?? "") : t("drive.title") })}>
              ‹
            </Link>
          )}
          <ol>
            <li>{atHome ? <span aria-current="page">{t("drive.title")}</span> : <Link to={hrefWith({ path: [], file: null })}>{t("drive.title")}</Link>}</li>
            {trail.map(({ name, i }) => (
              <li key={`${i}-${name}`}>
                {i === path.length - 1 ? <span aria-current="page">{niceName(name)}</span> : <Link to={hrefWith({ path: path.slice(0, i + 1), file: null })}>{niceName(name)}</Link>}
              </li>
            ))}
          </ol>
        </nav>
        <div className="drive-tools">
          <label className="drive-search">
            <SearchIcon />
            <span className="sr-only">{t("drive.searchLabel")}</span>
            <input
              ref={searchRef}
              type="search"
              placeholder={t("drive.searchPlaceholder")}
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              aria-keyshortcuts="/"
            />
            {!query && (
              <kbd className="drive-search-key" aria-hidden="true">
                /
              </kbd>
            )}
          </label>
          <div className="drive-sort" role="group" aria-label={t("drive.order")}>
            {(["name", "newest"] as const).map((s) => (
              <Link key={s} to={hrefWith({ sort: s })} replace className={sort === s ? "active" : undefined} aria-pressed={sort === s}>
                {s === "name" ? t("drive.sortName") : t("drive.sortNewest")}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {drive.problem && <p className="drive-note">{t("drive.staleNote", { when: updatedAgo(drive.tree.updatedAt, now, t), problem: drive.problem })}</p>}
      {!drive.tree.complete && <p className="drive-note">{t("drive.incomplete")}</p>}
      {!results && archiveAt.archive && (
        <p className="drive-note drive-note-info">
          <strong>{niceName(archiveAt.archive)}</strong> {t("drive.linkedNote")}
        </p>
      )}

      {!results && atHome && newFiles.length > 0 && (
        <section className="drive-fresh" aria-labelledby="drive-fresh-title">
          <h2 id="drive-fresh-title">{t("drive.newThisWeek")}</h2>
          <ul>
            {(showAllNew ? newFiles : newFiles.slice(0, NEW_SHOWN)).map(({ file, path: p }) => (
              <li key={file.id}>
                <Link to={hrefWith({ path: p, file: file.id })} className="drive-fresh-card">
                  <DriveKind kind={file.kind} />
                  <strong>{fileTitle(file.name)}</strong>
                  <small>{placeLabel(p, t)}</small>
                </Link>
              </li>
            ))}
          </ul>
          {newFiles.length > NEW_SHOWN && (
            <button type="button" className="btn-link drive-fresh-more" onClick={() => { setShowAllNew((v) => !v); }} aria-expanded={showAllNew}>
              {showAllNew ? t("drive.showFewer") : t("drive.showAll", { count: newFiles.length })}
            </button>
          )}
        </section>
      )}

      <div className={fileId ? "drive-layout has-file" : "drive-layout"}>
        <div className="drive-list">
          {results ? (
            <>
              {unopened > 0 && (
                <p className="drive-note drive-note-info">
                  {t("drive.unsearched", { count: unopened })}
                </p>
              )}
              <p className="drive-count" aria-live="polite">
                {results.total === 0
                  ? t("drive.noMatches", { query: deferredQuery.trim() })
                  : results.total > results.matches.length
                    ? t("drive.matchesShowing", { count: results.total, shown: results.matches.length })
                    : t("drive.matches", { count: results.total })}
              </p>
              {results.matches.length > 0 && (
                <ul aria-label={t("drive.matchesLabel")}>
                  {results.matches.map((m) =>
                    m.item.kind === "folder" ? folderRow(m.item.folder, m.item.path, m.ranges, true) : fileRow(m.item.file, m.item.path, m.ranges),
                  )}
                </ul>
              )}
            </>
          ) : waiting ? (
            cohortState?.problem && !cohortState.loading ? (
              <div className="drive-empty">
                <p>{t("drive.folderFailed", { problem: cohortState.problem })}</p>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => { drive.loadFolder(waiting.key, true); }}>
                  {t("drive.tryAgain")}
                </button>
              </div>
            ) : (
              <div aria-busy="true">
                <p className="drive-count" role="status">
                  {t("drive.readingFolder")}
                </p>
                <RowSkeleton />
              </div>
            )
          ) : !folder ? (
            <p className="drive-empty">
              {t("drive.folderGone")} <Link to="/drive">{t("drive.backToTop")}</Link>
            </p>
          ) : folder.folders.length === 0 && folder.files.length === 0 ? (
            <p className="drive-empty">{t("drive.nothingHere")}</p>
          ) : (
            <ul aria-label={folderName}>
              {folder.folders.map((f) => folderRow(f, [...path, f.name]))}
              {sortFiles(folder.files, sort).map((file) => fileRow(file, path))}
            </ul>
          )}
        </div>

        {selected ? (
          <DriveFileView
            key={selected.file.id}
            file={selected.file}
            position={at >= 0 && shownFiles.length > 1 ? t("drive.position", { at: at + 1, count: shownFiles.length }) : undefined}
            onPrev={prev && (() => { open(prev); })}
            onNext={next && (() => { open(next); })}
            onClose={close}
            onShown={(f) => { markOpened(f.id); }}
          />
        ) : (
          fileId && (
            <div className="drive-viewer-missing" id="drive-viewer">
              <p>{t("drive.fileGone")}</p>
              <button type="button" className="btn btn-secondary btn-small" onClick={close}>
                {t("drive.close")}
              </button>
            </div>
          )
        )}
      </div>
    </section>
  );
}
