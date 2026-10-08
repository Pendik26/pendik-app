import { englishT, type Translate } from "../i18n/i18n";
import { PHASE_INFO, parseDay, phaseFor } from "./examPlan";

// The exam plan as a calendar file (.ics) for Google Calendar, Apple Calendar or Outlook: a daily
// study session from today until the exam, named after the phase it's in, and the exam itself.

export interface CalendarInput {
  blockLabel: string;
  examDate: string;
  /** "HH:MM", local. */
  time: string;
  minutes: number;
  url: string;
  today?: Date;
  t?: Translate;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dayStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const escapeText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** Lines longer than 75 octets are folded, as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildCalendar({ blockLabel, examDate, time, minutes, url, today = new Date(), t = englishT }: CalendarInput): string {
  const exam = parseDay(examDate);
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(time) ? time : "19:00").split(":").map(Number);
  const created = new Date();
  const uidBase = `${examDate}-${blockLabel.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`;
  const events: string[][] = [];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let d = new Date(start); d < exam; d.setDate(d.getDate() + 1)) {
    const daysLeft = Math.round((exam.getTime() - d.getTime()) / 86_400_000);
    const info = PHASE_INFO[phaseFor(daysLeft)];
    const begin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
    const end = new Date(begin.getTime() + minutes * 60_000);
    events.push([
      "BEGIN:VEVENT",
      `UID:study-${dayStamp(d)}-${uidBase}@pendik`,
      `DTSTAMP:${stamp(created)}`,
      `DTSTART:${stamp(begin)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(t("calendar.study", { phase: t(info.name), days: daysLeft }))}`,
      `DESCRIPTION:${escapeText(`${t(info.focus)}\n${t("calendar.todayPlan", { url })}`)}`,
      "END:VEVENT",
    ]);
  }
  const next = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate() + 1);
  events.push([
    "BEGIN:VEVENT",
    `UID:exam-${uidBase}@pendik`,
    `DTSTAMP:${stamp(created)}`,
    `DTSTART;VALUE=DATE:${dayStamp(exam)}`,
    `DTEND;VALUE=DATE:${dayStamp(next)}`,
    `SUMMARY:${escapeText(t("calendar.exam", { block: blockLabel }))}`,
    "END:VEVENT",
  ]);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pendik//Exam plan//EN", "CALSCALE:GREGORIAN", ...events.flat(), "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}
