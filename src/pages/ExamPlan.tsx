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
import { useI18n } from "../i18n/useI18n";

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
  const { t } = useI18n();
  return (
    <section className="page">
      <h1>{t("nav.plan")}</h1>
      <p className="subtitle">{t("xplan.nothing")}</p>
    </section>
  );
}

function BlockPlan({ blockId }: { blockId: string }) {
  const { t } = useI18n();
  const p = useExamPlan(blockId);
  const blocks = plannableBlocks();
  const shortLabel = t("drive.block", { block: blockId });
  const label = blockById(blockId)?.label ?? shortLabel;
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
          <h1>{t("nav.plan")}</h1>
          <p className="subtitle">{t("xplan.subtitle")}</p>
        </div>
      </div>

      {blocks.length > 1 && (
        <nav className="plan-tabs" aria-label={t("xplan.blocks")}>
          {blocks.map((b) => (
            <Link key={b.id} to={`/plan/${b.id}`} className={b.id === blockId ? "plan-tab active" : "plan-tab"} aria-current={b.id === blockId ? "page" : undefined}>
              {t("drive.block", { block: b.id })}
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
                  t,
                }),
                `exam-plan-block-${blockId}.ics`,
              );
            }}
          >
            <CalendarIcon />
            {t("xplan.addCalendar")}
          </button>
        )}
        <AskAlfondButton question={t("xplan.askQuestion", { block: shortLabel })}>
          {t("xplan.ask")}
        </AskAlfondButton>
      </ReadinessSummary>

      <div className="plan-grid">
        <div className="plan-card plan-card-today">
          <h2>{t("progress.todayPlan")}</h2>
          {p.plan ? <TodayPlanList plan={p.plan} progress={p.progress} onRebuild={p.rebuild} /> : <p className="plan-empty">{t("xplan.working")}</p>}
        </div>

        <div className="plan-card">
          <h2>{t("xplan.settings")}</h2>
          <div className="plan-settings">
            <label className="account-field">
              <span>{t("xplan.examDate")}</span>
              <input
                type="date"
                className="form-input"
                value={p.exam.date ?? ""}
                onChange={(e) => { p.update({ date: e.target.value || undefined }); }}
              />
              <small>
                {p.exam.source === "official" ? (
                  t("xplan.dateOfficial")
                ) : p.exam.source === "deck" ? (
                  t("xplan.dateDeck")
                ) : p.exam.source === "mine" && official ? (
                  <>
                    {t("xplan.dateMine")}{" "}
                    <button type="button" className="link-btn" onClick={() => { p.update({ date: undefined }); }}>
                      {t("xplan.useOfficial")}
                    </button>
                  </>
                ) : p.exam.source === "mine" ? (
                  t("xplan.dateMineSynced")
                ) : (
                  t("xplan.dateUnset")
                )}
              </small>
            </label>
            <label className="account-field">
              <span>{t("xplan.minutes")}</span>
              <select className="form-select" value={p.minutes} onChange={(e) => { p.update({ minutes: Number(e.target.value) }); }}>
                {MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? t("xplan.minutesN", { count: m }) : m === 60 ? t("xplan.hour") : t("xplan.hours", { count: m / 60 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="account-field">
              <span>{t("xplan.target")}</span>
              <select className="form-select" value={target} onChange={(e) => { p.update({ target: Number(e.target.value) }); }}>
                {[50, 60, 65, 70, 75, 80, 85, 90].map((score) => (
                  <option key={score} value={score}>
                    {score}%
                  </option>
                ))}
              </select>
            </label>
            <label className="account-field">
              <span>{t("xplan.usualTime")}</span>
              <input type="time" className="form-input" value={p.settings.time ?? DEFAULT_TIME} onChange={(e) => { p.update({ time: e.target.value || undefined }); }} />
              <small>{t("xplan.forCalendar")}</small>
            </label>
          </div>
        </div>

        {p.exam.date && (
          <div className="plan-card plan-card-wide">
            <h2>{t("xplan.phases")}</h2>
            <PhaseTimeline examDate={p.exam.date} phase={p.phase} />
          </div>
        )}

        <div className="plan-card plan-card-wide">
          <h2>{t("xplan.bySubject")}</h2>
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
          <h2>{t("phase.mock")}</h2>
          {p.readiness.mocks.length > 0 ? (
            <>
              <p className="plan-card-note">
                {projection !== null
                  ? t("xplan.projection", { score: Math.round(projection), target })
                  : p.readiness.mocks.length === 1
                    ? t("xplan.oneMore")
                    : t("xplan.targetIs", { target })}
              </p>
              <ScoreTrend
                points={p.readiness.mocks.map((m) => ({
                  date: new Date(m.date),
                  value: m.percent,
                  label: `${new Date(m.date).toLocaleDateString(t("drive.dateLocale"), { day: "numeric", month: "short" })}${m.paper ? `: ${m.paper}` : ""}`,
                }))}
                target={target}
                projection={projection !== null && examDay ? { date: examDay, value: projection } : null}
                caption={t("xplan.mocksCaption", { block: shortLabel, target })}
              />
            </>
          ) : (
            <p className="plan-empty">
              {t("xplan.noMocks")} <Link to={`/exam/${blockId}`}>{t("xplan.sitOne")}</Link> {t("xplan.noMocksAfter", { target })}
            </p>
          )}
        </div>

        <div className="plan-card plan-card-wide">
          <h2>{t("progress.weakSpots")}</h2>
          <WeakSpotsPanel spots={spots} labelNames={p.occlusion.labels} subjectLabel={subjectLabel} />
        </div>

        <div className="plan-card">
          <h2>{t("xplan.yourClass")}</h2>
          <ClassCompare blockId={blockId} readiness={p.readiness.readiness} />
        </div>
      </div>
    </section>
  );
}
