import { Link, Navigate, useParams } from "react-router-dom";
import { ScoreTrend } from "../components/plan/charts";
import {
  AskAlfondButton,
  ClassCompare,
  MockSummary,
  PhaseTimeline,
  ReadinessSummary,
  SubjectProgressRow,
  TodayPlanList,
  WeakSpotsPanel,
} from "../components/plan/PlanParts";
import { CalendarIcon } from "../components/icons";
import { useExamPlan } from "../hooks/useExamPlan";
import { blockById } from "../lib/blocks";
import { buildCalendar } from "../lib/calendarFile";
import { DEFAULT_TARGET, DEFAULT_TIME, focusBlockId, parseDay, plannableBlocks } from "../lib/examPlan";
import { projectScore } from "../lib/readiness";
import { weakSpots } from "../lib/weakSpots";

const MINUTE_CHOICES = [20, 30, 45, 60, 90, 120, 180, 240];

function downloadCalendar(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** /plan and /plan/:blockId: one block's exam plan. */
export function ExamPlan() {
  const { blockId } = useParams();
  const focus = focusBlockId();
  if (!blockId) return focus ? <Navigate to={`/plan/${focus}`} replace /> : <NoBlocks />;
  if (!plannableBlocks().some((b) => b.id === blockId)) return <Navigate to="/plan" replace />;
  return <BlockPlan blockId={blockId} />;
}

function NoBlocks() {
  return (
    <section className="page">
      <h1>Exam plan</h1>
      <p className="subtitle">There's no study material to plan for yet.</p>
    </section>
  );
}

function BlockPlan({ blockId }: { blockId: string }) {
  const p = useExamPlan(blockId);
  const blocks = plannableBlocks();
  const label = blockById(blockId)?.label ?? `Block ${blockId}`;
  const shortLabel = `Block ${blockId}`;
  const target = p.settings.target ?? DEFAULT_TARGET;
  const spots = weakSpots(p.readiness.subjects.map((s) => s.key));
  const subjectLabel = (key: string) => p.readiness.subjects.find((s) => s.key === key)?.label ?? key;
  const examDay = p.exam.date ? parseDay(p.exam.date) : null;
  const projection = examDay && p.daysLeft !== null && p.daysLeft >= 0 ? projectScore(p.readiness.mocks, examDay) : null;
  const official = blockById(blockId)?.examDate;

  return (
    <section className="page plan-page">
      <div className="plan-page-head">
        <div>
          <h1>Exam plan</h1>
          <p className="subtitle">What to study each day until the exam, built from your own progress.</p>
        </div>
      </div>

      {blocks.length > 1 && (
        <nav className="plan-tabs" aria-label="Blocks">
          {blocks.map((b) => (
            <Link key={b.id} to={`/plan/${b.id}`} className={b.id === blockId ? "plan-tab active" : "plan-tab"} aria-current={b.id === blockId ? "page" : undefined}>
              Block {b.id}
            </Link>
          ))}
        </nav>
      )}

      <ReadinessSummary br={p.readiness} blockLabel={label} daysLeft={p.daysLeft} phase={p.phase}>
        {p.exam.date && p.daysLeft !== null && p.daysLeft > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const examDate = p.exam.date;
              if (!examDate) return;
              downloadCalendar(
                buildCalendar({
                  blockLabel: label,
                  examDate,
                  time: p.settings.time ?? DEFAULT_TIME,
                  minutes: p.minutes,
                  url: `${window.location.origin}/plan/${blockId}`,
                }),
                `exam-plan-block-${blockId}.ics`,
              );
            }}
          >
            <CalendarIcon />
            Add to calendar
          </button>
        )}
        <AskAlfondButton question={`Using my exam plan on this page, make me a day-by-day study plan for the next 7 days for ${shortLabel}. Focus on my weakest subjects and topics.`}>
          Plan my week with Alfond
        </AskAlfondButton>
      </ReadinessSummary>

      <div className="plan-grid">
        <div className="plan-card plan-card-today">
          <h2>Today's plan</h2>
          {p.plan ? <TodayPlanList plan={p.plan} progress={p.progress} onRebuild={p.rebuild} /> : <p className="plan-empty">Working it out…</p>}
        </div>

        <div className="plan-card">
          <h2>Settings</h2>
          <div className="plan-settings">
            <label className="account-field">
              <span>Exam date</span>
              <input
                type="date"
                className="form-input"
                value={p.exam.date ?? ""}
                onChange={(e) => { p.update({ date: e.target.value || undefined }); }}
              />
              <small>
                {p.exam.source === "official" ? (
                  "The official date for this block."
                ) : p.exam.source === "deck" ? (
                  "From the date you set on the old study plan."
                ) : p.exam.source === "mine" && official ? (
                  <>
                    Your own date.{" "}
                    <button type="button" className="link-btn" onClick={() => { p.update({ date: undefined }); }}>
                      Use the official date
                    </button>
                  </>
                ) : p.exam.source === "mine" ? (
                  "Your own date; it syncs with your account."
                ) : (
                  "Set when your block exam is."
                )}
              </small>
            </label>
            <label className="account-field">
              <span>Study time a day</span>
              <select className="form-select" value={p.minutes} onChange={(e) => { p.update({ minutes: Number(e.target.value) }); }}>
                {MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="account-field">
              <span>Target score</span>
              <select className="form-select" value={target} onChange={(e) => { p.update({ target: Number(e.target.value) }); }}>
                {[50, 60, 65, 70, 75, 80, 85, 90].map((t) => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </select>
            </label>
            <label className="account-field">
              <span>Usual study time</span>
              <input type="time" className="form-input" value={p.settings.time ?? DEFAULT_TIME} onChange={(e) => { p.update({ time: e.target.value || undefined }); }} />
              <small>For the calendar file.</small>
            </label>
          </div>
        </div>

        {p.exam.date && (
          <div className="plan-card plan-card-wide">
            <h2>Phases</h2>
            <PhaseTimeline examDate={p.exam.date} phase={p.phase} />
          </div>
        )}

        <div className="plan-card plan-card-wide">
          <h2>Readiness by subject</h2>
          <ul className="subject-progress-list">
            {[...p.readiness.subjects]
              .sort((a, b) => a.readiness - b.readiness)
              .map((s) => (
                <SubjectProgressRow key={s.key} s={s} />
              ))}
          </ul>
          <MockSummary br={p.readiness} />
        </div>

        <div className="plan-card plan-card-wide">
          <h2>Mock exams</h2>
          {p.readiness.mocks.length > 0 ? (
            <>
              <p className="plan-card-note">
                {projection !== null
                  ? `At this rate you'd score about ${Math.round(projection)}% on exam day; your target is ${target}%.`
                  : p.readiness.mocks.length === 1
                    ? "One more timed mock on another day and this shows where your scores are heading."
                    : `Your target is ${target}%.`}
              </p>
              <ScoreTrend
                points={p.readiness.mocks.map((m) => ({
                  date: new Date(m.date),
                  value: m.percent,
                  label: `${new Date(m.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${m.paper ? `: ${m.paper}` : ""}`,
                }))}
                target={target}
                projection={projection !== null && examDay ? { date: examDay, value: projection } : null}
                caption={`Mock exam scores for ${shortLabel}, with the ${target}% target`}
              />
            </>
          ) : (
            <p className="plan-empty">
              No timed mocks yet. <Link to={`/exam/${blockId}`}>Sit one</Link> to see your score trend against your {target}% target; the plan schedules them in the last days.
            </p>
          )}
        </div>

        <div className="plan-card plan-card-wide">
          <h2>Weak spots</h2>
          <WeakSpotsPanel spots={spots} labelNames={p.occlusion.labels} subjectLabel={subjectLabel} />
        </div>

        <div className="plan-card">
          <h2>Your class</h2>
          <ClassCompare blockId={blockId} readiness={p.readiness.readiness} />
        </div>
      </div>
    </section>
  );
}
