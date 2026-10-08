import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendarFile";
import { daysUntil, phaseFor, phaseTimeline } from "./examPlan";
import { milestones, nextMilestone, type MilestoneInput } from "./milestones";
import { deckStats, projectScore, quizStats, scoreBlock, scoreSubject, type BlockReadiness, type SubjectReadiness } from "./readiness";
import { bestStudyTime, dailySeries, weekComparison } from "./studyStats";
import { buildTodayPlan, planProgress, planStatus } from "./todayPlan";
import { mergeEntry } from "./syncMerge";
import type { StudyLog } from "./activity";

const day = (offset: number, base = new Date(2026, 9, 4)) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);

describe("exam phases", () => {
  it("moves from learning to mocks to the exam", () => {
    expect(phaseFor(null)).toBe("no-date");
    expect(phaseFor(30)).toBe("learn");
    expect(phaseFor(14)).toBe("strengthen");
    expect(phaseFor(4)).toBe("strengthen");
    expect(phaseFor(3)).toBe("mock");
    expect(phaseFor(1)).toBe("final");
    expect(phaseFor(0)).toBe("exam-day");
    expect(phaseFor(-1)).toBe("past");
    expect(daysUntil("2026-10-14", new Date(2026, 9, 4, 22, 30))).toBe(10);
  });

  it("lays the phases out before the exam date", () => {
    const steps = phaseTimeline("2026-11-30");
    expect(steps.map((s) => s.phase)).toEqual(["learn", "strengthen", "mock", "final"]);
    expect(steps[1].from!.getDate()).toBe(16);
    expect(steps[3].from!.getDate()).toBe(29);
  });
});

describe("readiness", () => {
  it("scores a deck by how established its cards are", () => {
    const stats = deckStats(["a", "b", "c", "d"], {
      a: { interval: 21, easeFactor: 2.5, dueDate: "2099-01-01", reps: 4, lapses: 0 },
      b: { interval: 6, easeFactor: 2.5, dueDate: "2000-01-01", reps: 2, lapses: 1 },
    });
    expect(stats).toMatchObject({ total: 4, seen: 2, mastered: 1, due: 1 });
    expect(stats.strength).toBeCloseTo((1 + 6 / 21) / 4);
  });

  it("weights quiz accuracy by how much of the bank has been covered", () => {
    const q = quizStats(100, [{ score: 25, total: 25, date: "x", missedIds: [] }], 0);
    expect(q.accuracy).toBe(1);
    expect(q.coverage).toBe(0.25);
    const s = scoreSubject({ quiz: q });
    expect(s.quiz).toBeCloseTo(50);
    expect(s.readiness).toBeCloseTo(50);
  });

  it("re-weights over the parts a subject has, and lets mocks count for the block", () => {
    const s = scoreSubject({ cards: { total: 10, seen: 10, mastered: 10, due: 0, strength: 1 }, reading: { chapters: 4, done: 0 } });
    expect(s.readiness).toBeCloseTo((0.35 * 100) / 0.5);
    expect(scoreBlock([40, 60], [])).toBe(50);
    expect(scoreBlock([40, 60], [10, 90, 70])).toBeCloseTo(50 * 0.7 + 80 * 0.3);
  });

  it("projects the mock trend to the exam date", () => {
    const mocks = [
      { date: day(0).toISOString(), percent: 50 },
      { date: day(10).toISOString(), percent: 60 },
    ];
    expect(projectScore(mocks, day(20))).toBeCloseTo(70, 0);
    expect(projectScore(mocks.slice(0, 1), day(20))).toBeNull();
    expect(projectScore([...mocks, { date: day(11).toISOString(), percent: 100 }], day(400))).toBe(100);
  });
});

function subject(key: string, readiness: number, parts: Partial<SubjectReadiness> = {}): SubjectReadiness {
  return { key, label: key.split("/")[1], blockId: key.split("/")[0], parts: {}, readiness, ...parts };
}

const block = (subjects: SubjectReadiness[]): BlockReadiness => ({ blockId: "9.9", subjects, mocks: [], readiness: 0, weakest: null });

describe("today's plan", () => {
  const anatomy = subject("9.9/anatomy", 30, {
    cards: { total: 200, seen: 50, mastered: 10, due: 40, strength: 0.2 },
    quiz: { bank: 100, attempts: [], accuracy: null, coverage: 0, retry: 6 },
  });
  const histology = subject("9.9/histology", 70, { cards: { total: 100, seen: 100, mastered: 60, due: 10, strength: 0.7 } });

  it("puts due reviews first, then spreads new cards over the days before strengthening", () => {
    const plan = buildTodayPlan(block([histology, anatomy]), "learn", 44, 120, day(0));
    expect(plan.items[0].id).toBe("due-cards:9.9/anatomy");
    expect(plan.items.map((i) => i.id)).toContain("retry:9.9/anatomy");
    const fresh = plan.items.find((i) => i.id === "new-cards:9.9/anatomy")!;
    expect(fresh.target).toBe(Math.ceil(150 / 30));
    expect(plan.items.reduce((m, i) => m + i.minutes, 0)).toBeLessThanOrEqual(120 + 5);
  });

  it("keeps due reviews when time is short and says how many didn't fit", () => {
    const plan = buildTodayPlan(block([anatomy]), "learn", 44, 10, day(0));
    expect(plan.items[0].id).toBe("due-cards:9.9/anatomy");
    expect(plan.items[0].target).toBe(25);
    expect(plan.overflow).toBeGreaterThan(0);
  });

  it("schedules a mock in the mock phase even past the minutes, and nothing new", () => {
    const plan = buildTodayPlan(block([anatomy]), "mock", 2, 30, day(0));
    expect(plan.items.some((i) => i.kind === "exams")).toBe(true);
    expect(plan.items.some((i) => i.id.startsWith("new-"))).toBe(false);
  });

  it("ticks items off from the study log, sharing one count in order", () => {
    const plan = buildTodayPlan(block([anatomy]), "learn", 44, 120, day(0));
    const log: StudyLog = { days: { [plan.date]: { "9.9/anatomy": { cards: 45 } } }, hours: {} };
    const done = planProgress(plan, log);
    expect(done["due-cards:9.9/anatomy"]).toBe(40);
    expect(done["new-cards:9.9/anatomy"]).toBe(5);
  });

  it("names the next unfinished item, skipping the page already open, with the minutes left", () => {
    const plan = buildTodayPlan(block([anatomy]), "learn", 44, 120, day(0));
    const log: StudyLog = { days: { [plan.date]: { "9.9/anatomy": { cards: 40 } } }, hours: {} };
    const status = planStatus(plan, planProgress(plan, log));
    expect(status.done).toBe(1);
    expect(status.total).toBe(plan.items.length);
    expect(status.next?.id).toBe(plan.items[1].id);
    const elsewhere = planStatus(plan, planProgress(plan, log), plan.items[1].to.split("?")[0]);
    expect(elsewhere.next?.id).not.toBe(plan.items[1].id);
    expect(status.minutesLeft).toBeLessThanOrEqual(plan.items.reduce((m, i) => m + i.minutes, 0));
  });
});

describe("study stats", () => {
  const log: StudyLog = {
    days: {
      "2026-10-04": { "1.2/anatomy": { cards: 30, labels: 10 }, "block:1.2": { exams: 1, questions: 100 } },
      "2026-09-30": { "1.2/anatomy": { cards: 5 } },
      "2026-09-26": { "1.2/anatomy": { cards: 12, questions: 25 } },
    },
    hours: { "20": 30, "21": 25, "8": 5 },
  };

  it("counts reviews per day and this week against last", () => {
    const series = dailySeries(log, 10, new Date(2026, 9, 4));
    expect(series.at(-1)).toMatchObject({ date: "2026-10-04", reviews: 40, exams: 1 });
    const { thisWeek, lastWeek } = weekComparison(log, new Date(2026, 9, 4));
    expect(thisWeek).toMatchObject({ reviews: 45, activeDays: 2, exams: 1 });
    expect(lastWeek).toMatchObject({ reviews: 12, questions: 25, activeDays: 1 });
  });

  it("names the best two-hour study window once there's enough data", () => {
    expect(bestStudyTime(log)).toBe("8–10 pm");
    expect(bestStudyTime({ days: {}, hours: { "9": 3 } })).toBeNull();
  });

  it("merges two devices' logs by keeping the larger count", () => {
    const merged = mergeEntry(
      { key: "medicine:studylog", value: { days: { d: { s: { cards: 5, labels: 2 } } }, hours: { "9": 4 } }, updatedAt: 1 },
      { key: "medicine:studylog", value: { days: { d: { s: { cards: 3 }, t: { questions: 9 } } }, hours: { "9": 6 } }, updatedAt: 2 },
    );
    expect(merged.value).toEqual({ days: { d: { s: { cards: 5, labels: 2 }, t: { questions: 9 } } }, hours: { "9": 6 } });
  });
});

describe("milestones", () => {
  const base: MilestoneInput = { studyDays: 3, longestStreak: 3, reviews: 80, mastered: 0, quizzes: 1, perfectQuiz: false, mocks: 0, bestMock: 0, booksFinished: 0, decksMastered: 0 };
  it("marks what's earned and picks the closest next one", () => {
    const list = milestones(base);
    expect(list.find((m) => m.id === "first-day")!.earned).toBe(true);
    expect(list.find((m) => m.id === "perfect")!.earned).toBe(false);
    expect(nextMilestone(list)!.id).toBe("reviews-100");
  });
});

describe("calendar file", () => {
  it("has a session a day until the exam, then the exam", () => {
    const ics = buildCalendar({ blockLabel: "Block 1.2; Integument, Bones", examDate: "2026-10-08", time: "19:30", minutes: 60, url: "https://x/plan/1.2", today: new Date(2026, 9, 4) });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain("DTSTART:20261004T193000");
    expect(ics).toContain("DTEND:20261004T203000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261008");
    expect(ics).toContain(String.raw`SUMMARY:Exam: Block 1.2\; Integument\, Bones`);
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
