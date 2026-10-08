import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "../../hooks/useAccount";
import { askAlfondAbout } from "../../lib/alfond";
import { fetchClassReadiness, reportReadiness, type ClassReadiness } from "../../lib/classReadiness";
import { countdownText, PHASE_INFO, parseDay, phaseTimeline, type Phase } from "../../lib/examPlan";
import { entry } from "../../lib/records";
import type { Milestone } from "../../lib/milestones";
import type { BlockReadiness, SubjectReadiness } from "../../lib/readiness";
import type { PlanItem, TodayPlan } from "../../lib/todayPlan";
import type { WeakSpots } from "../../lib/weakSpots";
import { AlfondIcon, CheckIcon } from "../icons";
import { SubjectBadge } from "../SubjectBadge";
import { useI18n } from "../../i18n/useI18n";
import type { Translate } from "../../i18n/i18n";

const pct = (n: number) => `${Math.round(n)}%`;
const fmtDay = (d: Date, t: Translate) => d.toLocaleDateString(t("drive.dateLocale"), { weekday: "short", day: "numeric", month: "short" });

/** The big readiness ring with its number inside. */
export function ReadinessRing({ value, size = 112, label }: { value: number; size?: number; label: string }) {
  const { t } = useI18n();
  const stroke = size / 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="readiness-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${t("today.ready", { percent: Math.round(clamped) })}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="readiness-ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="readiness-ring-fill"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="readiness-ring-value" aria-hidden="true">
        {Math.round(clamped)}
        <small>%</small>
      </span>
    </div>
  );
}

/** Block · readiness · countdown · weakest subject, at the top of Progress and the exam plan. */
export function ReadinessSummary({
  br,
  blockLabel,
  daysLeft,
  phase,
  children,
}: {
  br: BlockReadiness;
  blockLabel: string;
  daysLeft: number | null;
  phase: Phase;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="readiness-summary">
      <ReadinessRing value={br.readiness} label={blockLabel} />
      <div className="readiness-summary-body">
        <span className="readiness-summary-block">{blockLabel}</span>
        <p className="readiness-summary-line">
          <strong>{t("today.ready", { percent: Math.round(br.readiness) })}</strong>
          <span aria-hidden="true"> · </span>
          <span>{countdownText(daysLeft, t)}</span>
          {br.weakest && (
            <>
              <span aria-hidden="true"> · </span>
              <span>
                {t("xplan.weakest")} <Link to={`/subjects/${br.weakest.key}`}>{br.weakest.label}</Link>
              </span>
            </>
          )}
        </p>
        <p className="readiness-summary-phase">
          <span className={`phase-chip phase-${phase}`}>{t(entry(PHASE_INFO, phase).name)}</span> {t(entry(PHASE_INFO, phase).focus)}
        </p>
        {children && <div className="readiness-summary-actions">{children}</div>}
      </div>
    </div>
  );
}

function Meter({ label, value, detail, to }: { label: string; value: number; detail: string; to?: string }) {
  const body = (
    <>
      <span className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-detail">{detail}</span>
      </span>
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="meter" aria-label={`${label}: ${detail}`}>
      {body}
    </Link>
  ) : (
    <span className="meter" aria-label={`${label}: ${detail}`}>
      {body}
    </span>
  );
}

/** One subject: its readiness and a meter per kind of study, each linking to it. */
export function SubjectProgressRow({ s }: { s: SubjectReadiness }) {
  const { t } = useI18n();
  const [, id] = s.key.split("/");
  return (
    <li className="subject-progress">
      <Link to={`/subjects/${s.key}`} className="subject-progress-head">
        <SubjectBadge id={id} label={s.label} />
        <span className="subject-progress-name">{s.label}</span>
        <span className="subject-progress-score">{pct(s.readiness)}</span>
      </Link>
      <div className="subject-progress-meters">
        {s.cards && (
          <Meter
            label={t("xplan.cards")}
            value={(s.cards.mastered / s.cards.total) * 100}
            detail={`${t("xplan.mastered", { done: s.cards.mastered, total: s.cards.total })}${s.cards.due ? ` · ${t("xplan.due", { count: s.cards.due })}` : ""}`}
            to={`/flashcards/${s.key}`}
          />
        )}
        {s.labels && (
          <Meter
            label={t("xplan.labels")}
            value={(s.labels.mastered / s.labels.total) * 100}
            detail={`${t("xplan.mastered", { done: s.labels.mastered, total: s.labels.total })}${s.labels.due ? ` · ${t("xplan.due", { count: s.labels.due })}` : ""}`}
            to={`/occlusion/${s.key}`}
          />
        )}
        {s.quiz && (
          <Meter
            label={t("xplan.quiz")}
            value={(s.quiz.accuracy ?? 0) * 100}
            detail={
              s.quiz.accuracy === null
                ? t("xplan.notTried")
                : `${t("xplan.right", { percent: pct(s.quiz.accuracy * 100) })} · ${t("xplan.ofBank", { percent: pct(s.quiz.coverage * 100) })}${s.quiz.retry ? ` · ${t("xplan.toRetry", { count: s.quiz.retry })}` : ""}`
            }
            to={`/quizzes/${s.key}`}
          />
        )}
        {s.reading && (
          <Meter label={t("xplan.reading")} value={(s.reading.done / s.reading.chapters) * 100} detail={t("xplan.chapters", { done: s.reading.done, total: s.reading.chapters })} to={`/ebooks/${s.key}`} />
        )}
      </div>
    </li>
  );
}

/** Mock exams for a block, as a meter row under its subjects. */
export function MockSummary({ br }: { br: BlockReadiness }) {
  const { t } = useI18n();
  const best = br.mocks.reduce((m, a) => Math.max(m, a.percent), 0);
  const latest = br.mocks.at(-1);
  return (
    <div className="mock-summary">
      <Meter
        label={t("phase.mock")}
        value={latest?.percent ?? 0}
        detail={latest ? t("xplan.mockDetail", { latest: pct(latest.percent), best: pct(best), count: br.mocks.length }) : t("xplan.noneTaken")}
        to={`/exam/${br.blockId}`}
      />
    </div>
  );
}

function PlanRow({ item, done }: { item: PlanItem; done: number }) {
  const { t } = useI18n();
  const complete = done >= item.target;
  const partial = !complete && done > 0;
  return (
    <li className={`plan-item${complete ? " done" : ""}`}>
      <span className="plan-check" aria-hidden="true">
        {complete ? <CheckIcon /> : null}
      </span>
      <Link to={item.to} className="plan-item-body">
        <span className="plan-item-title">{item.title}</span>
        <span className="plan-item-detail">
          {item.detail}
          {partial && ` · ${t("xplan.partDone", { done, total: item.target })}`}
        </span>
      </Link>
      <span className="plan-item-time">{complete ? t("xplan.done") : t("xplan.aboutMin", { minutes: item.minutes })}</span>
      <span className="sr-only">{complete ? `${t("xplan.done")}.` : partial ? t("xplan.partDoneLong", { done, total: item.target }) : t("xplan.notStarted")}</span>
    </li>
  );
}

/** Today's plan as a checklist that ticks itself off. */
export function TodayPlanList({ plan, progress, limit, onRebuild }: { plan: TodayPlan; progress: Record<string, number>; limit?: number; onRebuild?: () => void }) {
  const { t } = useI18n();
  const items = limit ? plan.items.slice(0, limit) : plan.items;
  const doneCount = plan.items.filter((i) => (progress[i.id] ?? 0) >= i.target).length;
  const minutes = plan.items.reduce((m, i) => m + i.minutes, 0);
  if (plan.items.length === 0) {
    return <p className="plan-empty">{plan.phase === "past" ? t("xplan.over") : t("xplan.nothingLeft")}</p>;
  }
  return (
    <div className="today-plan">
      <p className="today-plan-meta">
        {doneCount === plan.items.length ? (
          <strong>{t("xplan.allDone")}</strong>
        ) : (
          <>
            <strong>
              {doneCount}/{plan.items.length}
            </strong>{" "}
            {t("xplan.doneMeta", { minutes, budget: plan.budget })}
          </>
        )}
        {plan.overflow > 0 && ` · ${t("xplan.overflow", { count: plan.overflow })}`}
      </p>
      <ul className="plan-list">
        {items.map((item) => (
          <PlanRow key={item.id} item={item} done={progress[item.id] ?? 0} />
        ))}
      </ul>
      {limit && plan.items.length > limit && <p className="plan-more">{t("xplan.more", { count: plan.items.length - limit })}</p>}
      {onRebuild && (
        <button type="button" className="link-btn" onClick={onRebuild}>
          {t("xplan.redo")}
        </button>
      )}
    </div>
  );
}

/** The phases as a strip, with today marked. */
export function PhaseTimeline({ examDate, phase }: { examDate: string; phase: Phase }) {
  const { t } = useI18n();
  const steps = phaseTimeline(examDate);
  return (
    <ol className="phase-timeline">
      {steps.map((s) => (
        <li key={s.phase} className={`phase-step${s.phase === phase ? " current" : ""}`}>
          <span className="phase-step-name">{t(PHASE_INFO[s.phase].name)}</span>
          <span className="phase-step-dates">
            {s.from ? fmtDay(s.from, t) : t("xplan.until")}
            {s.from && s.from.getTime() !== s.to.getTime() ? ` – ${fmtDay(s.to, t)}` : s.from ? "" : ` ${fmtDay(s.to, t)}`}
          </span>
          {s.phase === phase && <span className="sr-only">({t("xplan.youAreHere")})</span>}
        </li>
      ))}
      <li className={`phase-step phase-step-exam${phase === "exam-day" ? " current" : ""}`}>
        <span className="phase-step-name">{t("exam.modeExam")}</span>
        <span className="phase-step-dates">{fmtDay(parseDay(examDate), t)}</span>
      </li>
    </ol>
  );
}

/** Named weak spots, each with a drill. */
export function WeakSpotsPanel({ spots, labelNames, subjectLabel }: { spots: WeakSpots; labelNames: Record<string, string>; subjectLabel: (key: string) => string }) {
  const { t } = useI18n();
  const empty = spots.topics.length === 0 && spots.questions.length === 0 && spots.labels.length === 0;
  if (empty) return <p className="plan-empty">{t("xplan.noWeak")}</p>;
  return (
    <div className="weak-spots">
      {spots.topics.length > 0 && (
        <section>
          <h3>{t("xplan.weakTopics")}</h3>
          <ul className="weak-list">
            {spots.topics.map((topic) => (
              <li key={`${topic.subject}:${topic.tag}`}>
                <span className="weak-name">
                  {topic.tag} <small>{subjectLabel(topic.subject)}</small>
                </span>
                <span className="weak-stat">
                  {t("xplan.weakCards", { weak: topic.weak, total: topic.total })}
                </span>
                <Link to={topic.to} className="weak-drill">
                  {t("xplan.drill")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {spots.questions.length > 0 && (
        <section>
          <h3>{t("xplan.weakQuestions")}</h3>
          <ul className="weak-list">
            {spots.questions.map((q) => (
              <li key={`${q.subject}:${q.id}`}>
                <span className="weak-name weak-question">
                  {q.question} <small>{subjectLabel(q.subject)}</small>
                </span>
                <span className="weak-stat">
                  {t("xplan.missedTimes", { count: q.misses })}
                </span>
              </li>
            ))}
          </ul>
          <div className="weak-actions">
            {spots.questionDrills.map((d) => (
              <Link key={d.subject} to={d.to} className="btn btn-secondary">
                {t("xplan.drillQuestions", { count: d.count, subject: subjectLabel(d.subject) })}
              </Link>
            ))}
          </div>
        </section>
      )}
      {spots.labels.length > 0 && (
        <section>
          <h3>{t("xplan.weakLabels")}</h3>
          <ul className="weak-chips">
            {spots.labels.map((l) => (
              <li key={`${l.subject}:${l.id}`}>
                <Link to={`/occlusion/${l.subject}`}>{labelNames[l.id] ?? t("xplan.aLabel")}</Link>
                <small>{l.lapses}×</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function MilestoneList({ list, next }: { list: Milestone[]; next: Milestone | null }) {
  const { t } = useI18n();
  const earned = list.filter((m) => m.earned);
  return (
    <div className="milestones">
      {next?.progress && (
        <div className="milestone-next">
          <span className="milestone-next-label">{t("xplan.nextUp")}</span>
          <strong>{next.title}</strong>
          <span className="meter-track" aria-hidden="true">
            <span className="meter-fill" style={{ width: `${(next.progress.have / next.progress.need) * 100}%` }} />
          </span>
          <small>
            {next.progress.have.toLocaleString()} / {next.progress.need.toLocaleString()} · {next.detail}
          </small>
        </div>
      )}
      <ul className="milestone-list">
        {list.map((m) => (
          <li key={m.id} className={m.earned ? "earned" : ""} title={m.detail}>
            <span className="milestone-badge" aria-hidden="true">
              {m.earned ? <CheckIcon /> : null}
            </span>
            <span>{m.title}</span>
            <span className="sr-only">{m.earned ? `(${t("xplan.earned")})` : `(${t("xplan.notYet")})`}</span>
          </li>
        ))}
      </ul>
      <p className="milestone-count">
        {t("xplan.earnedCount", { count: earned.length, total: list.length })}
      </p>
    </div>
  );
}

/** You against your class, for signed-in students; quiet until there's an average to show. */
export function ClassCompare({ blockId, readiness }: { blockId: string; readiness: number }) {
  const { t } = useI18n();
  const { status } = useAccount();
  const [data, setData] = useState<ClassReadiness | null>(null);
  useEffect(() => {
    if (status !== "signed-in") return;
    let live = true;
    void reportReadiness(blockId, readiness).then(() => fetchClassReadiness(blockId)).then((d) => {
        if (live) setData(d);
      });
    return () => {
      live = false;
    };
  }, [status, blockId, readiness]);
  if (status !== "signed-in") {
    return (
      <p className="plan-empty">
        <Link to="/account">{t("auth.signIn")}</Link> {t("xplan.signInCompare")}
      </p>
    );
  }
  if (!data) return <p className="plan-empty">{t("xplan.checkingClass")}</p>;
  if (data.average === null) {
    return (
      <p className="plan-empty">
        {data.cohort ? t("xplan.averageLaterCohort", { cohort: data.cohort }) : t("xplan.averageLater")}
        {!data.cohort && (
          <>
            {" "}
            {t("xplan.setCohort")} <Link to="/account">{t("account.title")}</Link>.
          </>
        )}
      </p>
    );
  }
  const diff = Math.round(readiness - data.average);
  return (
    <div className="class-compare">
      <div className="class-compare-bar" aria-hidden="true">
        <span className="meter-track">
          <span className="meter-fill" style={{ width: `${Math.min(100, readiness)}%` }} />
        </span>
        <span className="class-compare-marker" style={{ left: `${Math.min(100, data.average)}%` }} />
      </div>
      <p>
        {t("board.you")} <strong>{pct(readiness)}</strong> · {data.cohort ? t("board.cohort", { cohort: data.cohort }) : t("board.everyone")} {t("xplan.averages")} <strong>{pct(data.average)}</strong>{" "}
        ({diff === 0 ? t("xplan.level") : diff > 0 ? t("xplan.ahead", { count: diff }) : t("xplan.behind", { count: -diff })}, {t("xplan.students", { count: data.count })})
      </p>
    </div>
  );
}

/** Sends a question about this page to Alfond (when the site's AI is on). */
export function AskAlfondButton({ question, children }: { question: string; children: ReactNode }) {
  const { config } = useAccount();
  const navigate = useNavigate();
  if (config?.ai !== true) return null;
  return (
    <button type="button" className="btn btn-secondary ask-alfond" onClick={() => { askAlfondAbout(question, () => navigate("/alfond")); }}>
      <AlfondIcon />
      {children}
    </button>
  );
}
