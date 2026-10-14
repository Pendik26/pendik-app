import { must, rpc } from "./db/client";

// The timetable the Schedule page shows: tutorial and skills-lab sessions per student group, the
// official lecture-schedule PDFs and the lecturer directory. The server holds them; the pure
// helpers here (grouping by week, phone links) are what the tests cover.

export type SessionKind = "tutor" | "sl";

export interface ScheduleEvent {
  id: string;
  kind: SessionKind;
  group: string;
  block: string | null;
  /** "YYYY-MM-DD" and "HH:MM", in Western Indonesia Time as printed on the official schedule. */
  date: string;
  start: string;
  end: string;
  code: string | null;
  phase: string | null;
  title: string;
  subtitle: string | null;
  lecturerId: string | null;
  cancelledNote: string | null;
}

export interface Lecturer {
  id: string;
  name: string;
  phones: string[];
}

export interface ScheduleDoc {
  id: string;
  block: string;
  track: "IUP" | "REGULER" | null;
  title: string;
  url: string;
}

export interface LecturerReport {
  id: string;
  kind: "wrong_number" | "new_lecturer";
  lecturer_id: string | null;
  name: string | null;
  phone: string | null;
  note: string | null;
  created_at: string;
}

export const listEvents = () => must(rpc<ScheduleEvent[]>("schedule_events"));
export const listGroups = () => must(rpc<string[]>("schedule_groups"));
export const listDocs = () => must(rpc<ScheduleDoc[]>("schedule_docs"));
export const listLecturers = () => must(rpc<Lecturer[]>("lecturers"));

export const reportWrongNumber = (lecturerId: string, phone: string, note: string) =>
  must(rpc("report_lecturer", { p_kind: "wrong_number", p_lecturer_id: lecturerId, p_phone: phone, p_note: note }));
export const suggestLecturer = (name: string, phone: string, note: string) =>
  must(rpc("report_lecturer", { p_kind: "new_lecturer", p_name: name, p_phone: phone, p_note: note }));

// ---------------------------------------------------------------------------------------------
// Time

/** The timetable is in WIB (UTC+7); "now" is read in that zone whatever the phone's zone is. */
const WIB_MS = 7 * 3_600_000;

/** The date ("YYYY-MM-DD") and time ("HH:MM") in WIB at a moment. */
export function wibNow(at: Date = new Date()): { date: string; time: string } {
  const iso = new Date(at.getTime() + WIB_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Monday of the week a date falls in, as "YYYY-MM-DD" (weeks run Monday to Sunday). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface ScheduleSections {
  /** The one session that is next (or running now), if it isn't cancelled. */
  next: ScheduleEvent | null;
  /** Everything else this week from now on, cancelled sessions included. */
  thisWeek: ScheduleEvent[];
  nextWeek: ScheduleEvent[];
  later: ScheduleEvent[];
}

/** Whether a session is over by the given WIB date and time. */
export function isOver(e: Pick<ScheduleEvent, "date" | "end">, now: { date: string; time: string }): boolean {
  return e.date < now.date || (e.date === now.date && e.end <= now.time);
}

/**
 * Splits upcoming sessions the way the page shows them: the next one on top, then the rest of
 * this week, next week and later. Past sessions are dropped, and the list is sorted by time.
 */
export function sectionEvents(events: ScheduleEvent[], now: { date: string; time: string }): ScheduleSections {
  const upcoming = events
    .filter((e) => !isOver(e, now))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const next = upcoming.find((e) => !e.cancelledNote) ?? null;
  const rest = upcoming.filter((e) => e !== next);
  const thisMonday = weekStart(now.date);
  const nextMonday = addDays(thisMonday, 7);
  const afterNext = addDays(thisMonday, 14);
  return {
    next,
    thisWeek: rest.filter((e) => e.date < nextMonday),
    nextWeek: rest.filter((e) => e.date >= nextMonday && e.date < afterNext),
    later: rest.filter((e) => e.date >= afterNext),
  };
}

// ---------------------------------------------------------------------------------------------
// Lecturers

/** A wa.me link for "+628123…" (the number without the plus, as WhatsApp wants). */
export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** Initials for the avatar: first letters of the first two name words, ignoring titles in front. */
export function initials(name: string): string {
  const words = name.replace(/^(dr\.?|prof\.?|drg\.?|ir\.?)\s+/i, "").split(/[\s,]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** Lecturers filtered by a search (any part of the name, ignoring case and dots), grouped under A, B, C… */
export function lecturerGroups(list: Lecturer[], query: string): { letter: string; people: Lecturer[] }[] {
  const flat = (s: string) => s.toLowerCase().replace(/[.,]/g, "");
  const q = flat(query.trim());
  const shown = list.filter((l) => !q || flat(l.name).includes(q));
  const byLetter = new Map<string, Lecturer[]>();
  for (const l of [...shown].sort((a, b) => flat(a.name).localeCompare(flat(b.name), "id"))) {
    const first = flat(l.name).replace(/^(dr|prof|drg|ir) /, "")[0]?.toUpperCase() ?? "#";
    const letter = /[A-Z]/.test(first) ? first : "#";
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), l]);
  }
  return [...byLetter].map(([letter, people]) => ({ letter, people }));
}

// ---------------------------------------------------------------------------------------------
// Schedule PDFs

/** The in-page preview address for a Google Drive file link; null for any other link. */
export function embedUrl(url: string): string | null {
  const m = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/.exec(url);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}
