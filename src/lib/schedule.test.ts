import { describe, expect, it } from "vitest";
import { embedUrl, initials, isOver, lecturerGroups, sectionEvents, weekStart, whatsappLink, wibNow, type ScheduleEvent } from "./schedule";

const ev = (date: string, start: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: `${date}-${start}`, kind: "sl", group: "INTER B", block: "1.2", date, start, end: "09:30", code: null,
  phase: null, title: "Limb Examination", subtitle: null, lecturerId: null, cancelledNote: null, ...extra,
});

describe("time", () => {
  it("reads the clock in WIB", () => {
    expect(wibNow(new Date("2026-10-14T18:00:00Z"))).toEqual({ date: "2026-10-15", time: "01:00" });
  });
  it("starts the week on Monday", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12"); // a Wednesday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
  it("counts a session as over once it has ended", () => {
    expect(isOver({ date: "2026-10-14", end: "09:30" }, { date: "2026-10-14", time: "09:30" })).toBe(true);
    expect(isOver({ date: "2026-10-14", end: "09:30" }, { date: "2026-10-14", time: "09:29" })).toBe(false);
  });
});

describe("sectionEvents", () => {
  const now = { date: "2026-10-14", time: "14:40" }; // Wednesday
  it("puts the next session on top and sorts the rest into weeks", () => {
    const events = [
      ev("2026-10-22", "07:50"),
      ev("2026-10-15", "07:50", { cancelledNote: "Tidak ada SL (Responsi 2)" }),
      ev("2026-10-19", "07:50"),
      ev("2026-10-14", "07:50"), // already over
      ev("2026-11-05", "07:50"),
    ];
    const s = sectionEvents(events, now);
    expect(s.next?.date).toBe("2026-10-19"); // Thursday's is cancelled, so it can't be "next"
    expect(s.thisWeek.map((e) => e.date)).toEqual(["2026-10-15"]);
    expect(s.nextWeek.map((e) => e.date)).toEqual(["2026-10-22"]);
    expect(s.later.map((e) => e.date)).toEqual(["2026-11-05"]);
  });
  it("is empty when nothing is coming", () => {
    expect(sectionEvents([ev("2026-10-01", "07:50")], now)).toEqual({ next: null, thisWeek: [], nextWeek: [], later: [] });
  });
});

describe("lecturers", () => {
  const list = [
    { id: "1", name: "Dr. Adi Prayitno, drg., M.", phones: [] },
    { id: "2", name: "Abdurahman Laqif, dr., Sp.OG", phones: [] },
    { id: "3", name: "Muthmainah, dr. MNeurosci PhD", phones: [] },
  ];
  it("links WhatsApp without the plus", () => {
    expect(whatsappLink("+628179555799")).toBe("https://wa.me/628179555799");
  });
  it("makes initials from the name, not the title", () => {
    expect(initials("Abdurahman Laqif, dr., Sp.OG")).toBe("AL");
    expect(initials("Dr. Adi Prayitno, drg., M.")).toBe("AP");
  });
  it("groups by first letter and finds by any part of the name", () => {
    expect(lecturerGroups(list, "").map((g) => g.letter)).toEqual(["A", "M"]);
    expect(lecturerGroups(list, "sp og")).toEqual([]);
    expect(lecturerGroups(list, "sp.og")[0]?.people[0]?.id).toBe("2");
  });
});

describe("embedUrl", () => {
  it("previews a Drive file in the page", () => {
    expect(embedUrl("https://drive.google.com/file/d/1AbC_-xyz/view?usp=sharing")).toBe("https://drive.google.com/file/d/1AbC_-xyz/preview");
    expect(embedUrl("https://drive.google.com/open?id=1AbC_-xyz")).toBe("https://drive.google.com/file/d/1AbC_-xyz/preview");
  });
  it("leaves other links to open in a new tab", () => {
    expect(embedUrl("https://example.com/timetable.pdf")).toBeNull();
  });
});
