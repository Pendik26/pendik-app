import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { STORAGE_KEYS } from "../lib/storage";
import { useOcclusionIds } from "../hooks/useOcclusionIds";
import { getActivityDays, getCurrentStreak, getLongestStreak, getStudyLog, type StudyKind } from "../lib/activity";
import { blockById, studyBlocks } from "../lib/blocks";
import { quizBanks } from "../lib/content";
import { daysUntil, examDateFor, focusBlockId, plannableBlocks, phaseFor, parseDay } from "../lib/examPlan";
import { blockReadiness, projectScore } from "../lib/readiness";
import { bestStudyTime, dailySeries, dayDetail, dayIntensity, weekComparison, type WeekSummary } from "../lib/studyStats";
import { weakSpots } from "../lib/weakSpots";
import { gatherMilestoneInput, milestones, nextMilestone } from "../lib/milestones";
import { allSubjects } from "../lib/routeMeta";
import { STORAGE_UPDATED_EVENT } from "../lib/storage";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { ScoreSparkline } from "../components/ScoreSparkline";
import { SubjectBadge } from "../components/SubjectBadge";
import { DailyBars, ScoreTrend } from "../components/plan/charts";
import { AskAlfondButton, MilestoneList, MockSummary, ReadinessSummary, SubjectProgressRow, WeakSpotsPanel } from "../components/plan/PlanParts";
import { useCountUp } from "../hooks/useCountUp";
import type { QuizAttempt } from "../types/content";
import { readJSON } from "../lib/storage";
import { entry } from "../lib/records";

const KIND_NAMES: Record<StudyKind, [string, string]> = {
  cards: ["card", "cards"],
  labels: ["label", "labels"],
  questions: ["question", "questions"],
  chapters: ["chapter", "chapters"],
  exams: ["mock exam", "mock exams"],
};

const subjectName = (key: string) =>
  key.startsWith("block:") ? `Block ${key.slice(6)} exams` : (allSubjects().find((s) => s.key === key)?.label ?? key) + ` (${key.split("/")[0]})`;

function WeekTile({ label, now, before }: { label: string; now: number; before: number }) {
  const diff = now - before;
  return (
    <div className="week-tile">
      <span className="stat-label">{label}</span>
      <span className="week-tile-value">{now.toLocaleString()}</span>
      <span className={`week-tile-delta${diff > 0 ? " up" : diff < 0 ? " down" : ""}`}>
        {diff === 0 ? "same as last week" : `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString()} vs last week`}
      </span>
    </div>
  );
}

function WeekStrip({ thisWeek, lastWeek }: { thisWeek: WeekSummary; lastWeek: WeekSummary }) {
  return (
    <div className="week-strip" aria-label="This week compared with last week">
      <WeekTile label="Reviews" now={thisWeek.reviews} before={lastWeek.reviews} />
      <WeekTile label="Questions" now={thisWeek.questions} before={lastWeek.questions} />
      <WeekTile label="Chapters" now={thisWeek.chapters} before={lastWeek.chapters} />
      <WeekTile label="Days studied" now={thisWeek.activeDays} before={lastWeek.activeDays} />
    </div>
  );
}

export function Progress() {
  const occlusion = useOcclusionIds();
  const [version, setVersion] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => { setVersion((v) => v + 1); };
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    return () => { window.removeEventListener(STORAGE_UPDATED_EVENT, refresh); };
  }, []);

  const data = useMemo(() => {
    const activityDays = getActivityDays();
    const log = getStudyLog();
    const focus = focusBlockId();
    const blocks = plannableBlocks()
      .map((b) => blockReadiness(b.id, occlusion.ids))
      .sort((a, b) => (a.blockId === focus ? -1 : b.blockId === focus ? 1 : a.blockId.localeCompare(b.blockId)));
    const allKeys = blocks.flatMap((b) => b.subjects.map((s) => s.key));
    const list = milestones(gatherMilestoneInput());
    return {
      activityDays,
      log,
      focus,
      blocks,
      series: dailySeries(log, 30),
      week: weekComparison(log),
      bestTime: bestStudyTime(log),
      intensity: dayIntensity(log),
      spots: weakSpots(allKeys),
      milestones: list,
      next: nextMilestone(list),
      quizzes: [...quizBanks.keys()]
        .map((key) => ({ key, attempts: readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(key), []) }))
        .filter((q) => q.attempts.length > 0),
    };
    // version: re-read when the account's progress is loaded again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occlusion.ids, version]);

  const streakCount = useCountUp(getCurrentStreak(data.activityDays));
  const longestCount = useCountUp(getLongestStreak(data.activityDays));
  const studyDaysCount = useCountUp(data.activityDays.length);

  const focus = data.blocks.at(0);
  const focusExam = focus ? examDateFor(focus.blockId).date : null;
  const focusDays = focusExam ? daysUntil(focusExam) : null;
  const detail = selectedDay ? dayDetail(data.log, selectedDay) : [];
  const subjectLabel = (key: string) => allSubjects().find((s) => s.key === key)?.label ?? key;

  return (
    <section className="page progress-page">
      <h1>Progress</h1>
      <p className="subtitle">
        Everything you've studied, saved in your account.
      </p>

      {focus && (
        <ReadinessSummary br={focus} blockLabel={blockById(focus.blockId)?.label ?? `Block ${focus.blockId}`} daysLeft={focusDays} phase={phaseFor(focusDays)}>
          <Link to={`/plan/${focus.blockId}`} className="btn">
            Today's plan
          </Link>
          <AskAlfondButton question="Looking at my progress on this page, what should I focus on this week, and why? Be specific about subjects and topics.">
            Ask Alfond about my progress
          </AskAlfondButton>
        </ReadinessSummary>
      )}

      <div className="streak-stats progress-streaks">
        <div className="stat-tile">
          <span className="stat-label">Current streak</span>
          <span className="stat-value">{streakCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Longest streak</span>
          <span className="stat-value">{longestCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Study days</span>
          <span className="stat-value">{studyDaysCount}</span>
        </div>
      </div>

      <h2 className="progress-heading">This week</h2>
      <WeekStrip thisWeek={data.week.thisWeek} lastWeek={data.week.lastWeek} />

      <h2 className="progress-heading">Subjects</h2>
      {data.blocks.map((b) => (
        <div key={b.blockId} className="progress-block">
          <h3 className="block-section-heading">
            {studyBlocks.find((s) => s.id === b.blockId)?.label ?? `Block ${b.blockId}`}
            <span className="progress-block-score">{Math.round(b.readiness)}% ready</span>
          </h3>
          <ul className="subject-progress-list">
            {b.subjects.map((s) => (
              <SubjectProgressRow key={s.key} s={s} />
            ))}
          </ul>
          <MockSummary br={b} />
        </div>
      ))}

      <h2 className="progress-heading">Trends</h2>
      <div className="progress-trends">
        <div className="plan-card plan-card-wide">
          <h3>Cards and labels reviewed a day</h3>
          <p className="plan-card-note">The last 30 days.</p>
          <DailyBars
            data={data.series.map((d) => {
              const date = parseDay(d.date);
              return {
                key: d.date,
                short: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
                label: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
                value: d.reviews,
              };
            })}
            unit="reviews"
            caption="Cards and image-occlusion labels reviewed each day over the last 30 days"
          />
        </div>
        {data.blocks
          .filter((b) => b.mocks.length > 0)
          .map((b) => {
            const date = examDateFor(b.blockId).date;
            const exam = date && daysUntil(date) >= 0 ? parseDay(date) : null;
            const projection = exam ? projectScore(b.mocks, exam) : null;
            const target = readJSON<{ target?: number }>(STORAGE_KEYS.examPlan(b.blockId), {}).target ?? 70;
            return (
              <div key={b.blockId} className="plan-card plan-card-wide">
                <h3>Block {b.blockId} mock exams</h3>
                <ScoreTrend
                  points={b.mocks.map((m) => ({ date: new Date(m.date), value: m.percent, label: `${new Date(m.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${m.paper ? `: ${m.paper}` : ""}` }))}
                  target={target}
                  projection={projection !== null && exam ? { date: exam, value: projection } : null}
                  caption={`Mock exam scores for Block ${b.blockId}`}
                />
              </div>
            );
          })}
        {data.quizzes.length > 0 && (
          <div className="plan-card plan-card-wide">
            <h3>Quiz scores</h3>
            <ul className="quiz-trends">
              {data.quizzes.map(({ key, attempts }) => {
                const last = attempts.at(-1);
                if (!last) return null;
                return (
                  <li key={key}>
                    <Link to={`/quizzes/${key}`} className="quiz-trend-row">
                      <SubjectBadge id={key.split("/")[1]} label={subjectLabel(key)} />
                      <span className="quiz-trend-name">
                        {subjectLabel(key)} <small>Block {key.split("/")[0]}</small>
                      </span>
                      <ScoreSparkline history={attempts} />
                      <span className="quiz-trend-last">
                        {Math.round((last.score / last.total) * 100)}%<small> last</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <h2 className="progress-heading">Activity</h2>
      <div className="heatmap-wrapper">
        <ActivityHeatmap days={data.activityDays} intensity={data.intensity} selected={selectedDay} onSelect={(d) => { setSelectedDay((cur) => (cur === d ? null : d)); }} />
        <p className="heatmap-note">
          {data.bestTime ? `You study most around ${data.bestTime}. ` : ""}
          Tap a day to see what you studied.
        </p>
        {selectedDay && (
          <div className="day-detail" aria-live="polite">
            <strong>{parseDay(selectedDay).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</strong>
            {detail.length === 0 ? (
              <p>{data.activityDays.includes(selectedDay) ? "You studied this day (before detailed records began)." : "Nothing recorded."}</p>
            ) : (
              <ul>
                {detail.map(({ subject, counts }) => (
                  <li key={subject}>
                    <span>{subjectName(subject)}</span>
                    <span>
                      {(Object.entries(counts) as [StudyKind, number][])
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => `${n} ${entry(KIND_NAMES, k)[n === 1 ? 0 : 1]}`)
                        .join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <h2 className="progress-heading">Weak spots</h2>
      <div className="plan-card">
        <WeakSpotsPanel spots={data.spots} labelNames={occlusion.labels} subjectLabel={subjectLabel} />
      </div>

      <h2 className="progress-heading">Milestones</h2>
      <div className="plan-card">
        <MilestoneList list={data.milestones} next={data.next} />
      </div>

    </section>
  );
}
