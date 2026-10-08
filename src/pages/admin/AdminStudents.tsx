import { useCallback, useEffect, useMemo, useState } from "react";
import type { Track } from "../../context/accountContextValue";
import { useAccount } from "../../hooks/useAccount";
import { useI18n } from "../../i18n/useI18n";
import {
  accountAction,
  activateAccounts,
  addToRoster,
  listRoster,
  parseRosterLines,
  removeFromRoster,
  setRole,
  setTrack,
  type RosterEntry,
} from "../../lib/admin";

const stateKey = { none: "admin.stateNone", active: "admin.stateActive", locked: "admin.stateLocked" } as const;

const trackFrom = (value: string): Track | null => (value === "IUP" || value === "REGULER" ? value : null);

/** The class roster and each student's account: add students, activate, lock, reset, roles. */
export function AdminStudents() {
  const { t } = useI18n();
  const { user } = useAccount();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paste, setPaste] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pasteTrack, setPasteTrack] = useState<Track | null>(null);
  const [trackFilter, setTrackFilter] = useState<"all" | Track | "none">("all");

  const reload = useCallback(() => {
    listRoster().then(setRoster, (e: Error) => { setProblem(e.message); });
  }, []);
  useEffect(reload, [reload]);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      setNote(await work());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
    reload();
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster ?? []).filter((r) =>
      (trackFilter === "all" || (trackFilter === "none" ? r.track === null : r.track === trackFilter)) &&
      (!q || r.studentId.toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q) || (r.classGroup ?? "").toLowerCase().includes(q)));
  }, [roster, query, trackFilter]);
  const inactiveSelected = [...selected].filter((id) => roster?.find((r) => r.studentId === id)?.account === "none");
  const parsed = parseRosterLines(paste, String(new Date().getFullYear()), pasteTrack);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      {note && <p className="account-success" role="status">{note}</p>}

      <div className="admin-toolbar">
        <input className="form-input" type="search" placeholder={t("admin.searchStudents")} value={query} onChange={(e) => { setQuery(e.target.value); }} />
        <select className="form-input admin-select" aria-label={t("track.label")} value={trackFilter}
          onChange={(e) => { setTrackFilter(e.target.value as typeof trackFilter); }}>
          <option value="all">{t("track.all")}</option>
          <option value="IUP">{t("track.iup")}</option>
          <option value="REGULER">{t("track.reguler")}</option>
          <option value="none">{t("track.none")}</option>
        </select>
        <button type="button" className="btn btn-small" disabled={busy || inactiveSelected.length === 0}
          onClick={() => void run(async () => {
            const { results } = await activateAccounts(inactiveSelected);
            setSelected(new Set());
            const failed = results.filter((r) => !r.ok);
            return failed.length
              ? `${t("admin.activated", { count: results.length - failed.length })} ${failed.map((f) => `${f.student_id}: ${f.message ?? ""}`).join("; ")}`
              : t("admin.activated", { count: results.length });
          })}>
          {t("admin.activateSelected", { count: inactiveSelected.length })}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { setShowAdd((v) => !v); }}>{t("admin.addStudents")}</button>
      </div>

      {showAdd && (
        <div className="account-card admin-add">
          <p className="account-note">{t("admin.addHint")}</p>
          <label className="admin-inline-field">
            <span>{t("admin.pasteTrack")}</span>
            <select className="form-input admin-select" value={pasteTrack ?? ""} onChange={(e) => { setPasteTrack(trackFrom(e.target.value)); }}>
              <option value="">{t("track.none")}</option>
              <option value="IUP">{t("track.iup")}</option>
              <option value="REGULER">{t("track.reguler")}</option>
            </select>
          </label>
          <textarea className="form-input admin-textarea" rows={6} value={paste} onChange={(e) => { setPaste(e.target.value); }} placeholder={"2601001, Nama Lengkap, A, 2026"} />
          {parsed.problems.length > 0 && <ul className="admin-problems">{parsed.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button type="button" className="btn btn-small" disabled={busy || parsed.rows.length === 0}
            onClick={() => void run(async () => {
              await addToRoster(parsed.rows);
              setPaste("");
              return t("admin.addedToRoster", { count: parsed.rows.length });
            })}>
            {t("admin.addCount", { count: parsed.rows.length })}
          </button>
        </div>
      )}

      {!roster ? (
        <p className="subtitle">{t("common.loading")}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th><span className="sr-only">{t("admin.select")}</span></th>
                <th>{t("admin.studentId")}</th>
                <th>{t("admin.name")}</th>
                <th>{t("track.label")}</th>
                <th>{t("admin.class")}</th>
                <th>{t("admin.account")}</th>
                <th>{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.studentId}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.studentId)} onChange={() => { toggle(r.studentId); }} aria-label={r.fullName} />
                  </td>
                  <td className="admin-mono">{r.studentId}</td>
                  <td>{r.fullName}{r.role === "admin" && <span className="admin-pill">{t("account.roleAdmin")}</span>}</td>
                  <td>
                    <select className="form-input admin-select" aria-label={t("admin.trackOf", { name: r.fullName })} value={r.track ?? ""} disabled={busy}
                      onChange={(e) => { const next = trackFrom(e.target.value); void run(async () => { await setTrack(r.studentId, next); return null; }); }}>
                      <option value="">{t("track.none")}</option>
                      <option value="IUP">{t("track.iup")}</option>
                      <option value="REGULER">{t("track.reguler")}</option>
                    </select>
                  </td>
                  <td>{[r.classGroup, r.cohort].filter(Boolean).join(" · ")}</td>
                  <td>
                    <span className={`admin-state admin-state-${r.account}`}>{t(stateKey[r.account])}</span>
                    {r.account === "active" && r.mustChangePassword && <small> · {t("admin.firstPassword")}</small>}
                    {r.googleLinked && <small> · Google</small>}
                  </td>
                  <td className="admin-actions">
                    {r.account === "none" ? (
                      <>
                        <button type="button" className="btn btn-link" disabled={busy}
                          onClick={() => void run(async () => { await activateAccounts([r.studentId]); return t("admin.activated", { count: 1 }); })}>
                          {t("admin.activate")}
                        </button>
                        <button type="button" className="btn btn-link" disabled={busy}
                          onClick={() => { if (window.confirm(t("admin.removeConfirm", { name: r.fullName }))) void run(async () => { await removeFromRoster(r.studentId); return null; }); }}>
                          {t("admin.remove")}
                        </button>
                      </>
                    ) : r.userId && r.userId !== user?.id ? (
                      <>
                        <button type="button" className="btn btn-link" disabled={busy}
                          onClick={() => void run(async () => { await accountAction(r.account === "locked" ? "unlock" : "lock", r.userId ?? ""); return null; })}>
                          {r.account === "locked" ? t("admin.unlock") : t("admin.lock")}
                        </button>
                        <button type="button" className="btn btn-link" disabled={busy}
                          onClick={() => { if (window.confirm(t("admin.resetConfirm", { name: r.fullName }))) void run(async () => { await accountAction("reset", r.userId ?? ""); return t("admin.resetDone"); }); }}>
                          {t("admin.resetPassword")}
                        </button>
                        <button type="button" className="btn btn-link" disabled={busy}
                          onClick={() => void run(async () => { await setRole(r.userId ?? "", r.role === "admin" ? "student" : "admin"); return null; })}>
                          {r.role === "admin" ? t("admin.makeStudent") : t("admin.makeAdmin")}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="account-note">{t("admin.rosterCount", { shown: shown.length, total: roster.length })}</p>
        </div>
      )}
    </div>
  );
}
