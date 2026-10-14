import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import {
  deleteLecturer, importLecturers, listLecturerReports, parseLecturerTable, resolveLecturerReport, saveLecturer,
} from "../../lib/admin";
import { listLecturers, type Lecturer, type LecturerReport } from "../../lib/schedule";
import type { DataContext } from "./AdminData";

/** The lecturer list (add, edit, import) and the students' notes about it: wrong numbers and suggested lecturers. */
export function AdminLecturers() {
  const { t } = useI18n();
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [reports, setReports] = useState<LecturerReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const setOpenReports = (useOutletContext() as DataContext | undefined)?.setOpenReports;

  const reload = useCallback(() => {
    Promise.all([listLecturers(), listLecturerReports()]).then(
      ([l, r]) => { setLecturers(l); setReports(r); setOpenReports?.(r.length); },
      (e: Error) => { setProblem(errorText(e)); },
    );
  }, [setOpenReports]);
  useEffect(reload, [reload]);

  /** Runs a change, then shows what it did (or why not) and reloads the lists. */
  const act = async (run: () => Promise<string | void>) => {
    setProblem(null);
    setMessage(null);
    try {
      const done = await run();
      if (done) setMessage(done);
      reload();
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  const [lecturerPaste, setLecturerPaste] = useState("");
  const parsedLecturers = parseLecturerTable(lecturerPaste);

  // Lecturers
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phones, setPhones] = useState("");
  const startEdit = (l: Lecturer | null) => {
    setEditing(l?.id ?? null);
    setName(l?.name ?? "");
    setPhones(l?.phones.join(", ") ?? "");
  };
  const submitLecturer = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await saveLecturer(name, phones.split(/[,\n;]/).map((p) => p.trim()).filter(Boolean), editing ?? undefined);
      startEdit(null);
    });
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      {message && <p className="account-note" role="status">{message}</p>}

      <h2>{t("schedule.adminLecturersHeading")}</h2>
      <p className="account-note">{t("schedule.adminLecturerHint")}</p>
      <form onSubmit={submitLecturer} className="admin-toolbar">
        <input className="form-input" required maxLength={120} value={name} placeholder={t("schedule.name")} aria-label={t("schedule.name")} onChange={(e) => { setName(e.target.value); }} />
        <input className="form-input" value={phones} placeholder={t("schedule.adminPhones")} aria-label={t("schedule.adminPhones")} onChange={(e) => { setPhones(e.target.value); }} />
        <button type="submit" className="btn btn-small">{editing ? t("schedule.adminSaveLecturer") : t("schedule.adminAddLecturer")}</button>
        {editing && <button type="button" className="btn btn-secondary btn-small" onClick={() => { startEdit(null); }}>{t("common.cancel")}</button>}
      </form>
      <details className="account-card">
        <summary>{t("schedule.adminImportLecturers")}</summary>
        <p className="account-note">{t("schedule.adminImportLecturersHint")}</p>
        <textarea className="form-input admin-textarea" rows={6} value={lecturerPaste} onChange={(e) => { setLecturerPaste(e.target.value); }} aria-label={t("schedule.adminImportLecturers")} />
        {parsedLecturers.problems.length > 0 && <ul className="admin-problems">{parsedLecturers.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <button
          type="button" className="btn btn-small" disabled={parsedLecturers.rows.length === 0}
          onClick={() => void act(async () => {
            const r = await importLecturers(parsedLecturers.rows);
            setLecturerPaste("");
            return `${t("schedule.adminImportedLecturers", { added: r.added, updated: r.updated })}${r.skipped.length ? ` ${t("schedule.adminImportSkipped", { names: r.skipped.join("; ") })}` : ""}`;
          })}
        >
          {t("schedule.adminImportCount", { count: parsedLecturers.rows.length })}
        </button>
      </details>
      {lecturers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {lecturers.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}<br /><small>{t("schedule.adminIdHint", { id: l.id })}</small></td>
                  <td>{l.phones.join(", ")}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => { startEdit(l); }}>{t("schedule.adminEdit")}</button>{" "}
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => { if (window.confirm(t("schedule.adminDeleteLecturer", { name: l.name }))) void act(() => deleteLecturer(l.id).then(() => undefined)); }}>{t("schedule.adminDelete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t("schedule.adminReportsHeading")}</h2>
      {reports.length === 0 ? <p className="account-note">{t("schedule.adminNoReports")}</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.kind === "wrong_number" ? t("schedule.adminKindWrong") : t("schedule.adminKindNew")}</td>
                  <td>{r.name}{r.phone ? ` · ${r.phone}` : ""}{r.note ? <><br /><small>{r.note}</small></> : null}</td>
                  <td><button type="button" className="btn btn-secondary btn-small" onClick={() => { void act(() => resolveLecturerReport(r.id).then(() => undefined)); }}>{t("schedule.adminDone")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
