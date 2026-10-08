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
import { useI18n } from "../i18n/useI18n";
import type { MessageKey, Translate } from "../i18n/i18n";

const KIND_NAMES: Record<StudyKind, [MessageKey, MessageKey]> = {
  cards: ["progress.card", "progress.cards"],
  labels: ["progress.label", "progress.labels"],
  questions: ["progress.question", "progress.questions"],
  chapters: ["progress.chapter", "progress.chapters"],
  exams: ["progress.mock", "progress.mocks"],
};

const subjectName = (key: string, t: Translate) =>
  key.startsWith("block:") ? t("progress.blockExams", { block: key.slice(6) }) : (allSubjects().find((s) => s.key === key)?.label ?? key) + ` (${key.split("/")[0]})`;

function WeekTile({ label, now, before }: { label: string; now: number; before: number }) {
  const { t } = useI18n();
  const diff = now - before;
  return (
    <div className="week-tile">
      <span className="stat-label">{label}</span>
      <span className="week-tile-value">{now.toLocaleString()}</span>
      <span className={`week-tile-delta${diff > 0 ? " up" : diff < 0 ? " down" : ""}`}>
        {diff === 0 ? t("progress.sameAsLast") : t("progress.vsLast", { diff: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString()}` })}
      </span>
    </div>
  );
}

function WeekStrip({ thisWeek, lastWeek }: { thisWeek: WeekSummary; lastWeek: WeekSummary }) {
  const { t } = useI18n();
  return (
    <div className="week-strip" aria-label={t("progress.weekCompare")}>
      <WeekTile label={t("progress.reviews")} now={thisWeek.reviews} before={lastWeek.reviews} />
      <WeekTile label={t("progress.questionsTitle")} now={thisWeek.questions} before={lastWeek.questions} />
      <WeekTile label={t("progress.chaptersTitle")} now={thisWeek.chapters} before={lastWeek.chapters} />
      <WeekTile label={t("progress.daysStudied")} now={thisWeek.activeDays} before={lastWeek.activeDays} />
    </div>
  );
}

export function Progress() {
  const { t } = useI18n();
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
    const list = milestones(gatherMilestoneInput(), t);
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
  }, [occlusion.ids, version, t]);

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
      <h1>{t("progress.title")}</h1>
      <p className="subtitle">{t("progress.subtitle")}</p>

      {focus && (
        <ReadinessSummary br={focus} blockLabel={blockById(focus.blockId)?.label ?? t("drive.block", { block: focus.blockId })} daysLeft={focusDays} phase={phaseFor(focusDays)}>
          <Link to={`/plan/${focus.blockId}`} className="btn">
            {t("progress.todayPlan")}
          </Link>
          <AskAlfondButton question={t("progress.askQuestion")}>
            {t("progress.ask")}
          </AskAlfondButton>
        </ReadinessSummary>
      )}

      <div className="streak-stats progress-streaks">
        <div className="stat-tile">
          <span className="stat-label">{t("progress.currentStreak")}</span>
          <span className="stat-value">{streakCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">{t("progress.longestStreak")}</span>
          <span className="stat-value">{longestCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">{t("progress.studyDays")}</span>
          <span className="stat-value">{studyDaysCount}</span>
        </div>
      </div>

      <h2 className="progress-heading">{t("progress.thisWeek")}</h2>
      <WeekStrip thisWeek={data.week.thisWeek} lastWeek={data.week.lastWeek} />

      <h2 className="progress-heading">{t("progress.subjects")}</h2>
      {data.blocks.map((b) => (
        <div key={b.blockId} className="progress-block">
          <h3 className="block-section-heading">
            {studyBlocks.find((s) => s.id === b.blockId)?.label ?? t("drive.block", { block: b.blockId })}
            <span className="progress-block-score">{t("today.ready", { percent: Math.round(b.readiness) })}</span>
          </h3>
          <ul className="subject-progress-list">
            {b.subjects.map((s) => (
              <SubjectProgressRow key={s.key} s={s} />
            ))}
          </ul>
          <MockSummary br={b} />
        </div>
      ))}

      <h2 className="progress-heading">{t("progress.trends")}</h2>
      <div className="progress-trends">
        <div className="plan-card plan-card-wide">
          <h3>{t("progress.dailyTitle")}</h3>
          <p className="plan-card-note">{t("progress.last30")}</p>
          <DailyBars
            data={data.series.map((d) => {
              const date = parseDay(d.date);
              return {
                key: d.date,
                short: date.toLocaleDateString(t("drive.dateLocale"), { day: "numeric", month: "short" }),
                label: date.toLocaleDateString(t("drive.dateLocale"), { weekday: "short", day: "numeric", month: "short" }),
                value: d.reviews,
              };
            })}
            unit={t("progress.reviewsUnit")}
            caption={t("progress.dailyCaption")}
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
                <h3>{t("progress.mocksTitle", { block: b.blockId })}</h3>
                <ScoreTrend
                  points={b.mocks.map((m) => ({ date: new Date(m.date), value: m.percent, label: `${new Date(m.date).toLocaleDateString(t("drive.dateLocale"), { day: "numeric", month: "short" })}${m.paper ? `: ${m.paper}` : ""}` }))}
                  target={target}
                  projection={projection !== null && exam ? { date: exam, value: projection } : null}
                  caption={t("progress.mocksCaption", { block: b.blockId })}
                />
              </div>
            );
          })}
        {data.quizzes.length > 0 && (
          <div className="plan-card plan-card-wide">
            <h3>{t("progress.quizScores")}</h3>
            <ul className="quiz-trends">
              {data.quizzes.map(({ key, attempts }) => {
                const last = attempts.at(-1);
                if (!last) return null;
                return (
                  <li key={key}>
                    <Link to={`/quizzes/${key}`} className="quiz-trend-row">
                      <SubjectBadge id={key.split("/")[1]} label={subjectLabel(key)} />
                      <span className="quiz-trend-name">
                        {subjectLabel(key)} <small>{t("drive.block", { block: key.split("/")[0] })}</small>
                      </span>
                      <ScoreSparkline history={attempts} />
                      <span className="quiz-trend-last">
                        {Math.round((last.score / last.total) * 100)}%<small> {t("progress.last")}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <h2 className="progress-heading">{t("progress.activity")}</h2>
      <div className="heatmap-wrapper">
        <ActivityHeatmap days={data.activityDays} intensity={data.intensity} selected={selectedDay} onSelect={(d) => { setSelectedDay((cur) => (cur === d ? null : d)); }} />
        <p className="heatmap-note">
          {data.bestTime ? `${t("progress.bestTime", { time: data.bestTime })} ` : ""}
          {t("progress.tapDay")}
        </p>
        {selectedDay && (
          <div className="day-detail" aria-live="polite">
            <strong>{parseDay(selectedDay).toLocaleDateString(t("drive.dateLocale"), { weekday: "long", day: "numeric", month: "long" })}</strong>
            {detail.length === 0 ? (
              <p>{data.activityDays.includes(selectedDay) ? t("progress.studiedBefore") : t("progress.nothing")}</p>
            ) : (
              <ul>
                {detail.map(({ subject, counts }) => (
                  <li key={subject}>
                    <span>{subjectName(subject, t)}</span>
                    <span>
                      {(Object.entries(counts) as [StudyKind, number][])
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => t(entry(KIND_NAMES, k)[n === 1 ? 0 : 1], { count: n }))
                        .join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <h2 className="progress-heading">{t("progress.weakSpots")}</h2>
      <div className="plan-card">
        <WeakSpotsPanel spots={data.spots} labelNames={occlusion.labels} subjectLabel={subjectLabel} />
      </div>

      <h2 className="progress-heading">{t("progress.milestones")}</h2>
      <div className="plan-card">
        <MilestoneList list={data.milestones} next={data.next} />
      </div>

    </section>
  );
}
