import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import { applyHeldSync, listSyncRuns, searchDriveFiles, setFileHidden, syncStep, type AdminDriveFile, type SyncRunRow } from "../../lib/admin";

/** The class Drive sync: run it now, look at past runs, let a held run go ahead, hide files. */
export function AdminDrive() {
  const { t, language } = useI18n();
  const [runs, setRuns] = useState<SyncRunRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(() => {
    listSyncRuns().then(setRuns, (e: Error) => { setProblem(e.message); });
  }, []);
  useEffect(reload, [reload]);

  const syncNow = async () => {
    setSyncing(true);
    setProblem(null);
    try {
      // Each call does part of the walk; keep calling while the run is going.
      for (let call = 1; call <= 60; call++) {
        const r = await syncStep();
        setProgress(t("admin.syncProgress", { files: r.filesFound, folders: r.remaining }));
        if (r.status !== "running") break;
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    setSyncing(false);
    setProgress(null);
    reload();
  };

  const when = (iso: string) => new Date(iso).toLocaleString(language === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <div className="admin-toolbar">
        <button type="button" className="btn btn-small" disabled={syncing} onClick={() => void syncNow()}>
          {syncing ? t("admin.syncing") : t("admin.syncNow")}
        </button>
        {progress && <span className="account-note" role="status">{progress}</span>}
      </div>
      <p className="account-note">{t("admin.syncHint")}</p>

      {runs && runs.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.started")}</th>
                <th>{t("admin.status")}</th>
                <th>{t("admin.files")}</th>
                <th>{t("admin.changes")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.started_at)} <small>({r.started_by === "schedule" ? t("admin.bySchedule") : t("admin.byAdmin")})</small></td>
                  <td>
                    <span className={`admin-state admin-state-${r.status === "done" ? "active" : r.status === "running" ? "none" : "locked"}`}>{t(statusKey[r.status])}</span>
                    {r.status === "held" && <small> · {heldReason(r, t)}</small>}
                    {r.error && <small> · {r.error}</small>}
                  </td>
                  <td>{r.files_found}</td>
                  <td>{t("admin.syncChanges", { added: r.files_added, updated: r.files_updated, missing: r.files_missing })}</td>
                  <td>
                    {r.status === "held" && (
                      <button type="button" className="btn btn-link"
                        onClick={() => {
                          if (!window.confirm(t("admin.applyConfirm"))) return;
                          applyHeldSync(r.id).then(reload, (e: Error) => { setProblem(e.message); });
                        }}>
                        {t("admin.apply")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {runs && runs.length === 0 && <p className="account-note">{t("admin.noSyncsYet")}</p>}

      <HiddenFiles />
    </div>
  );
}

const statusKey = { running: "admin.runRunning", done: "admin.runDone", failed: "admin.runFailed", held: "admin.runHeld" } as const;

function heldReason(r: SyncRunRow, t: ReturnType<typeof useI18n>["t"]): string {
  const n = r.notes as { reason?: string; unseen?: number; live?: number; skippedFolders?: number };
  return n.reason === "incomplete"
    ? t("admin.heldIncomplete", { count: n.skippedFolders ?? 0 })
    : t("admin.heldTooMany", { unseen: n.unseen ?? 0, live: n.live ?? 0 });
}

function HiddenFiles() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(true);
  const [files, setFiles] = useState<AdminDriveFile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const search = useCallback(() => {
    searchDriveFiles(query, onlyHidden).then(setFiles, (e: Error) => { setProblem(e.message); });
  }, [query, onlyHidden]);
  useEffect(() => {
    const id = window.setTimeout(search, 300);
    return () => { window.clearTimeout(id); };
  }, [search]);

  return (
    <div className="dashboard-section">
      <h2 className="section-heading">{t("admin.hideFiles")}</h2>
      <p className="account-note">{t("admin.hideHint")}</p>
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <div className="admin-toolbar">
        <input className="form-input" type="search" placeholder={t("admin.searchFiles")} value={query} onChange={(e) => { setQuery(e.target.value); }} />
        <label className="admin-check">
          <input type="checkbox" checked={onlyHidden} onChange={(e) => { setOnlyHidden(e.target.checked); }} />
          {t("admin.onlyHidden")}
        </label>
      </div>
      <ul className="admin-list">
        {(files ?? []).map((f) => (
          <li key={f.id} className="admin-file">
            <span>
              <strong>{f.title}</strong>
              <small>{f.folder_path.join(" / ")}{f.missing_since ? ` · ${t("admin.missing")}` : ""}</small>
            </span>
            <button type="button" className="btn btn-link"
              onClick={() => { setFileHidden(f.id, !f.hidden_at).then(search, (e: Error) => { setProblem(e.message); }); }}>
              {f.hidden_at ? t("admin.show") : t("admin.hide")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
