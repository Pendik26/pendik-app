import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PulseLine } from "../components/PulseLine";
import { useAccount } from "../hooks/useAccount";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { errorText } from "../i18n/errorText";
import { useI18n } from "../i18n/useI18n";
import { STORAGE_KEYS } from "../lib/storage";
import {
  embedUrl, initials, lecturerGroups, listDocs, listEvents, listGroups, listLecturers, reportWrongNumber, sectionEvents,
  suggestLecturer, whatsappLink, wibNow, type Lecturer, type ScheduleDoc, type ScheduleEvent, type SessionKind,
} from "../lib/schedule";

type Tab = "tutor" | "sl" | "lectures" | "lecturers";
const TABS: Tab[] = ["tutor", "sl", "lectures", "lecturers"];

/** Loads something once when the tab opens; the page keeps its own copy so switching tabs doesn't refetch. */
function useLoaded<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => { if (live) setState({ data, error: null, loading: false }); },
      (e: Error) => { if (live) setState({ data: null, error: errorText(e), loading: false }); },
    );
    return () => { live = false; };
    // `load` is a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return { ...state, retry: () => { setAttempt((n) => n + 1); } };
}

function Failed({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="schedule-failed" role="alert">
      <p>{t("schedule.loadFailed")}: {message}</p>
      <button type="button" className="btn btn-small" onClick={retry}>{t("common.retry")}</button>
    </div>
  );
}

function Loading() {
  const { t } = useI18n();
  return <div className="route-loading" role="status" aria-label={t("app.loadingPage")}><PulseLine /></div>;
}

function Phones({ phones }: { phones: string[] }) {
  const { t } = useI18n();
  return (
    <ul className="schedule-phones">
      {phones.map((p) => (
        <li key={p}>
          <a className="schedule-wa" href={whatsappLink(p)} target="_blank" rel="noopener noreferrer" aria-label={`${t("schedule.contact")} ${p}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 18.9L4 20Z" /><path d="M9 9.5c.3 2 2.2 4 4.5 4.5l1.3-1.2-1.6-1-.9.6c-.8-.3-1.6-1.1-1.9-1.9l.6-.9-1-1.6L9 9.5Z" /></svg>
            WhatsApp
          </a>
          <span className="schedule-phone">{p}</span>
        </li>
      ))}
    </ul>
  );
}

function SessionCard({ event, lecturer, highlight }: { event: ScheduleEvent; lecturer: Lecturer | undefined; highlight?: boolean }) {
  const { t, language } = useI18n();
  const day = new Date(`${event.date}T00:00:00Z`);
  const locale = t("schedule.dateLocale");
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" }).format(day);
  const cancelled = event.cancelledNote !== null;
  const tag = [event.kind === "sl" ? "SL" : t("schedule.tabTutor"), event.code, event.phase].filter(Boolean).join(" · ");
  return (
    <article className={`schedule-card${highlight ? " is-next" : ""}${cancelled ? " is-cancelled" : ""}`} lang={language}>
      <time className="schedule-date" dateTime={event.date}>
        <span>{part({ weekday: "short" }).replace(".", "").toUpperCase()}</span>
        <strong>{part({ day: "numeric" })}</strong>
        <span>{part({ month: "short" }).replace(".", "").toUpperCase()}</span>
      </time>
      <div className="schedule-body">
        <span className="schedule-tag">{tag}</span>
        <h3>{event.title}</h3>
        {event.subtitle && <p className="schedule-sub">{event.subtitle}</p>}
        <p className="schedule-time">{event.start}–{event.end} WIB</p>
        {cancelled && <p className="schedule-cancelled">{t("schedule.cancelled")}: {event.cancelledNote}</p>}
        {lecturer && (
          <div className="schedule-lecturer">
            <span className="schedule-avatar" aria-hidden="true">{initials(lecturer.name)}</span>
            <span>{lecturer.name}</span>
            <Phones phones={lecturer.phones} />
          </div>
        )}
      </div>
    </article>
  );
}

/** Tutorial and skills-lab sessions of the student's group. */
function Sessions({ kind }: { kind: SessionKind }) {
  const { t } = useI18n();
  const events = useLoaded(listEvents);
  const groups = useLoaded(listGroups);
  const lecturers = useLoaded(listLecturers);
  const [chosen, setGroup] = useLocalStorage<string>(STORAGE_KEYS.scheduleGroup, "");
  const { user } = useAccount();
  // Until the student picks one, the tutorial group the admin set for them is used.
  const group = chosen || ((groups.data ?? []).includes(user?.classGroup ?? "") ? (user?.classGroup ?? "") : "");

  const now = wibNow();
  const mine = useMemo(() => (events.data ?? []).filter((e) => e.kind === kind && e.group === group), [events.data, kind, group]);
  const sections = useMemo(() => sectionEvents(mine, now), [mine, now.date, now.time]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(() => new Map((lecturers.data ?? []).map((l) => [l.id, l])), [lecturers.data]);

  if (events.loading || groups.loading) return <Loading />;
  if (events.error) return <Failed message={events.error} retry={events.retry} />;
  if (groups.error) return <Failed message={groups.error} retry={groups.retry} />;
  const all = groups.data ?? [];
  if (all.length === 0) return <EmptyState title={t("schedule.noGroups")} />;

  const picker = (
    <label className="schedule-group">
      <span>{t("schedule.group")}</span>
      <select className="form-input" value={group} onChange={(e) => { setGroup(e.target.value); }}>
        {!all.includes(group) && <option value="">{t("schedule.pickGroup")}</option>}
        {all.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </label>
  );
  if (!all.includes(group)) return <div>{picker}<p className="account-note">{t("schedule.pickGroupHint")}</p></div>;

  const nothing = !sections.next && sections.thisWeek.length + sections.nextWeek.length + sections.later.length === 0;
  const list = (title: string, items: ScheduleEvent[]) =>
    items.length > 0 && (
      <section className="schedule-section">
        <h2>{title}</h2>
        {items.map((e) => <SessionCard key={e.id} event={e} lecturer={e.lecturerId ? people.get(e.lecturerId) : undefined} />)}
      </section>
    );

  return (
    <div>
      {picker}
      {nothing ? (
        <div className="schedule-empty">
          <p>{kind === "sl" ? t("schedule.emptySl") : t("schedule.emptyTutor")}</p>
          <p className="account-note">{t("schedule.officialNote")}</p>
        </div>
      ) : (
        <>
          {sections.next && (
            <section className="schedule-section">
              <h2>{t("schedule.next")}</h2>
              <SessionCard event={sections.next} lecturer={sections.next.lecturerId ? people.get(sections.next.lecturerId) : undefined} highlight />
            </section>
          )}
          {list(t("schedule.thisWeek"), sections.thisWeek)}
          {list(t("schedule.nextWeek"), sections.nextWeek)}
          {list(t("schedule.later"), sections.later)}
          <p className="account-note">{t("schedule.officialNote")}</p>
        </>
      )}
    </div>
  );
}

/** The official lecture timetable PDFs for the student's class. */
function Lectures() {
  const { t } = useI18n();
  const docs = useLoaded(listDocs);
  const { user } = useAccount();
  if (docs.loading) return <Loading />;
  if (docs.error) return <Failed message={docs.error} retry={docs.retry} />;
  // The server already hides the other class's PDFs from students; this only orders by block.
  const rows: ScheduleDoc[] = docs.data ?? [];
  if (rows.length === 0) return <EmptyState title={t("schedule.noDocs")} />;
  return (
    <div>
      <p className="account-note">{t("schedule.lectureHint")}</p>
      {rows.map((d) => {
        const embed = embedUrl(d.url);
        return (
          <section key={d.id} className="schedule-section">
            <h2>{t("schedule.block", { block: d.block })}{d.track && user?.role === "admin" ? ` · ${d.track}` : ""}</h2>
            <p className="schedule-sub">{d.title}</p>
            <a className="btn btn-small" href={d.url} target="_blank" rel="noopener noreferrer">{t("schedule.openPdf")}</a>
            <p className="account-note">{t("schedule.openPdfHint")}</p>
            {embed && <iframe className="pdf-frame schedule-pdf" src={embed} title={d.title} referrerPolicy="no-referrer" loading="lazy" />}
          </section>
        );
      })}
    </div>
  );
}

type Panel = "wrong" | "suggest" | null;

/** "Wrong number" and "Suggest a lecturer": a short note an admin reads and acts on. */
function ReportForm({ panel, lecturers, onClose }: { panel: Exclude<Panel, null>; lecturers: Lecturer[]; onClose: () => void }) {
  const { t } = useI18n();
  const [lecturerId, setLecturerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (panel === "wrong") await reportWrongNumber(lecturerId, phone, note);
      else await suggestLecturer(name, phone, note);
      setSent(true);
    } catch (err) {
      setProblem(errorText(err));
    }
    setBusy(false);
  };

  return (
    <form className="schedule-form account-card" onSubmit={(e) => { void submit(e); }}>
      <h2>{panel === "wrong" ? t("schedule.reportTitle") : t("schedule.suggestTitle")}</h2>
      {panel === "wrong" ? (
        <label className="account-field">
          <span>{t("schedule.reportLecturer")}</span>
          <select className="form-input" required value={lecturerId} onChange={(e) => { setLecturerId(e.target.value); }}>
            <option value="">{t("schedule.chooseLecturer")}</option>
            {lecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      ) : (
        <label className="account-field">
          <span>{t("schedule.name")}</span>
          <input className="form-input" required maxLength={120} value={name} onChange={(e) => { setName(e.target.value); }} />
        </label>
      )}
      <label className="account-field">
        <span>{panel === "wrong" ? t("schedule.correctNumber") : t("schedule.phone")}</span>
        <input className="form-input" inputMode="tel" maxLength={40} value={phone} onChange={(e) => { setPhone(e.target.value); }} />
      </label>
      <label className="account-field">
        <span>{t("schedule.note")}</span>
        <textarea className="form-input" rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); }} />
      </label>
      {problem && <p className="account-error" role="alert">{problem}</p>}
      {sent && <p className="account-note" role="status">{t("schedule.sent")}</p>}
      <div className="schedule-form-actions">
        <button type="submit" className="btn btn-small" disabled={busy || sent}>{busy ? t("schedule.sending") : t("schedule.send")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>{sent ? t("common.close") : t("common.cancel")}</button>
      </div>
    </form>
  );
}

/** Every lecturer with their WhatsApp numbers, searchable, A to Z. */
function Lecturers() {
  const { t } = useI18n();
  const lecturers = useLoaded(listLecturers);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const groups = useMemo(() => lecturerGroups(lecturers.data ?? [], query), [lecturers.data, query]);
  if (lecturers.loading) return <Loading />;
  if (lecturers.error) return <Failed message={lecturers.error} retry={lecturers.retry} />;
  const all = lecturers.data ?? [];

  return (
    <div>
      <div className="schedule-search">
        <input
          type="search" className="form-input" value={query} placeholder={t("schedule.lecturerSearch")}
          aria-label={t("schedule.lecturerSearchLabel")} onChange={(e) => { setQuery(e.target.value); }}
        />
      </div>
      <div className="schedule-report-buttons">
        <button type="button" className="btn btn-secondary" disabled={all.length === 0} onClick={() => { setPanel(panel === "wrong" ? null : "wrong"); }}>{t("schedule.wrongNumber")}</button>
        <button type="button" className="btn btn-secondary" onClick={() => { setPanel(panel === "suggest" ? null : "suggest"); }}>{t("schedule.suggest")}</button>
      </div>
      {panel && <ReportForm key={panel} panel={panel} lecturers={all} onClose={() => { setPanel(null); }} />}

      {all.length === 0 ? <p className="account-note">{t("schedule.noLecturersYet")}</p>
        : groups.length === 0 ? <p className="account-note">{t("schedule.noLecturers")}</p>
        : groups.map((g) => (
          <section key={g.letter} className="schedule-section">
            <h2 className="schedule-letter">{g.letter}</h2>
            <ul className="schedule-people">
              {g.people.map((l) => (
                <li key={l.id}>
                  <span className="schedule-avatar" aria-hidden="true">{initials(l.name)}</span>
                  <div>
                    <strong>{l.name}</strong>
                    {l.phones.length > 0 ? <Phones phones={l.phones} /> : <span className="account-note">{t("schedule.noNumber")}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

export function Schedule() {
  const { t } = useI18n();
  const { tab } = useParams();
  if (!TABS.includes(tab as Tab)) return <Navigate to="/schedule/tutor" replace />;
  const active = tab as Tab;
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "admin-tab active" : "admin-tab");
  return (
    <section className="page schedule-page">
      <h1>{t("schedule.title")}</h1>
      <nav className="admin-tabs" aria-label={t("schedule.tabs")}>
        <NavLink to="/schedule/tutor" className={link}>{t("schedule.tabTutor")}</NavLink>
        <NavLink to="/schedule/sl" className={link}>{t("schedule.tabSl")}</NavLink>
        <NavLink to="/schedule/lectures" className={link}>{t("schedule.tabLecture")}</NavLink>
        <NavLink to="/schedule/lecturers" className={link}>{t("schedule.tabLecturers")}</NavLink>
      </nav>
      {active === "tutor" && <Sessions kind="tutor" />}
      {active === "sl" && <Sessions kind="sl" />}
      {active === "lectures" && <Lectures />}
      {active === "lecturers" && <Lecturers />}
    </section>
  );
}
