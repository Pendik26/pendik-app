import { useCallback, useEffect, useState, type FormEvent } from "react";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import {
  clearScheduleGroup, deleteLecturer, importLecturers, parseLecturerTable, deleteScheduleDoc, listLecturerReports, resolveLecturerReport, saveLecturer,
  saveScheduleDoc, saveScheduleEvents,
} from "../../lib/admin";
import { listDocs, listGroups, listLecturers, type Lecturer, type LecturerReport, type ScheduleDoc } from "../../lib/schedule";

/** Fills in the schedule: sessions (pasted as JSON), lecturers, lecture PDFs, and students' notes. */
export function AdminSchedule() {
  const { t } = useI18n();
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [docs, setDocs] = useState<ScheduleDoc[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [reports, setReports] = useState<LecturerReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([listLecturers(), listDocs(), listGroups(), listLecturerReports()]).then(
      ([l, d, g, r]) => { setLecturers(l); setDocs(d); setGroups(g); setReports(r); },
      (e: Error) => { setProblem(errorText(e)); },
    );
  }, []);
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

  // Sessions
  const [json, setJson] = useState("");
  const importEvents = (e: FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setProblem(t("schedule.adminBadJson"));
      return;
    }
    void act(async () => {
      const r = await saveScheduleEvents(Array.isArray(parsed) ? parsed : [parsed]);
      setJson("");
      return t("schedule.adminSavedEvents", { count: r.saved });
    });
  };
  const [lecturerPaste, setLecturerPaste] = useState("");
  const parsedLecturers = parseLecturerTable(lecturerPaste);
  const [clearGroup, setClearGroup] = useState("");
  const [clearKind, setClearKind] = useState<"tutor" | "sl">("sl");

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

  // PDFs
  const [doc, setDoc] = useState({ title: "", url: "", block: "", track: "" });
  const submitDoc = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await saveScheduleDoc({ title: doc.title, url: doc.url, block: doc.block, track: doc.track === "IUP" || doc.track === "REGULER" ? doc.track : null });
      setDoc({ title: "", url: "", block: "", track: "" });
    });
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      {message && <p className="account-note" role="status">{message}</p>}

      <h2>{t("schedule.adminEventsHeading")}</h2>
      <p className="account-note">{t("schedule.adminEventsHint")}</p>
      <form onSubmit={importEvents} className="schedule-admin-form">
        <textarea className="form-input schedule-json" rows={8} value={json} spellCheck={false} placeholder={t("schedule.adminEventsPlaceholder")} onChange={(e) => { setJson(e.target.value); }} aria-label={t("schedule.adminEventsHeading")} />
        <button type="submit" className="btn btn-small" disabled={!json.trim()}>{t("schedule.adminSaveEvents")}</button>
      </form>

      {groups.length > 0 && (
        <div className="admin-toolbar">
          <strong>{t("schedule.adminClearHeading")}</strong>
          <select className="form-input admin-select" value={clearGroup} onChange={(e) => { setClearGroup(e.target.value); }} aria-label={t("schedule.group")}>
            <option value="">{t("schedule.group")}</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="form-input admin-select" value={clearKind} onChange={(e) => { setClearKind(e.target.value === "tutor" ? "tutor" : "sl"); }}>
            <option value="sl">{t("schedule.tabSl")}</option>
            <option value="tutor">{t("schedule.tabTutor")}</option>
          </select>
          <button
            type="button" className="btn btn-secondary btn-small" disabled={!clearGroup}
            onClick={() => {
              if (!window.confirm(t("schedule.adminClearConfirm", { kind: clearKind === "sl" ? t("schedule.tabSl") : t("schedule.tabTutor"), group: clearGroup }))) return;
              void act(async () => t("schedule.adminCleared", { count: (await clearScheduleGroup(clearGroup, clearKind)).deleted }));
            }}
          >
            {t("schedule.adminClear")}
          </button>
        </div>
      )}

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

      <h2>{t("schedule.adminDocsHeading")}</h2>
      <form onSubmit={submitDoc} className="admin-toolbar">
        <input className="form-input" required value={doc.title} placeholder={t("schedule.adminDocTitle")} aria-label={t("schedule.adminDocTitle")} onChange={(e) => { setDoc({ ...doc, title: e.target.value }); }} />
        <input className="form-input" required type="url" value={doc.url} placeholder={t("schedule.adminDocUrl")} aria-label={t("schedule.adminDocUrl")} onChange={(e) => { setDoc({ ...doc, url: e.target.value }); }} />
        <input className="form-input" required maxLength={10} value={doc.block} placeholder={t("schedule.adminDocBlock")} aria-label={t("schedule.adminDocBlock")} onChange={(e) => { setDoc({ ...doc, block: e.target.value }); }} />
        <select className="form-input admin-select" value={doc.track} aria-label={t("schedule.adminDocTrack")} onChange={(e) => { setDoc({ ...doc, track: e.target.value }); }}>
          <option value="">{t("schedule.adminDocBoth")}</option>
          <option value="IUP">IUP</option>
          <option value="REGULER">Reguler</option>
        </select>
        <button type="submit" className="btn btn-small">{t("schedule.adminAddDoc")}</button>
      </form>
      {docs.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{t("schedule.block", { block: d.block })}{d.track ? ` · ${d.track}` : ""}</td>
                  <td><a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a></td>
                  <td><button type="button" className="btn btn-secondary btn-small" onClick={() => { void act(() => deleteScheduleDoc(d.id).then(() => undefined)); }}>{t("schedule.adminDelete")}</button></td>
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
