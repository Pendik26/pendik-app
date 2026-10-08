import { Link, useLocation } from "react-router-dom";
import { useExamPlan } from "../../hooks/useExamPlan";
import { studyBlocks } from "../../lib/blocks";
import { countdownText, focusBlockId, plannableBlocks } from "../../lib/examPlan";
import { planStatus } from "../../lib/todayPlan";
import { BodyIcon, CalendarIcon, FlameIcon, MapIcon, TimerIcon } from "../icons";
import { TodayPlanList } from "./PlanParts";
import { useI18n } from "../../i18n/useI18n";
import type { Translate } from "../../i18n/i18n";

// "What should I do now?" answered in one place: the next thing on today's plan, with a Start
// button, and the rest of the day's list under it. Home leads with it, and every study session
// ends with its smaller sibling, NextUp.

function greeting(t: Translate, now = new Date()): string {
  const h = now.getHours();
  return t(h < 5 ? "today.late" : h < 12 ? "today.morning" : h < 18 ? "today.afternoon" : "today.evening");
}

/** First visit (or never chosen): which block is the student in? Sets the plan and Home. */
export function BlockPicker({ current, onPick }: { current: string; onPick: (blockId: string) => void }) {
  const blocks = plannableBlocks();
  const { t } = useI18n();
  return (
    <div className="block-picker" role="group" aria-label={t("home.yourBlock")}>
      <p className="block-picker-title">{t("today.whichBlock")}</p>
      <p className="block-picker-hint">{t("today.whichBlockHint")}</p>
      <div className="block-picker-options">
        {blocks.map((b) => (
          <button
            key={b.id}
            type="button"
            className={b.id === current ? "block-picker-option is-on" : "block-picker-option"}
            aria-pressed={b.id === current}
            onClick={() => { onPick(b.id); }}
          >
            <strong>{t("admin.blockN", { block: b.id })}</strong>
            <span>{(studyBlocks.find((s) => s.id === b.id)?.label ?? "").replace(/^Block [\d.]+:\s*/, "")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The top of Home: greeting, streak and countdown, the next step and today's list. Home owns
 * the current-block setting and passes it down, so picking a block updates both at once.
 */
export function TodayHero({ streak, firstVisit, current, onPickBlock }: { streak: number; firstVisit: boolean; current: string; onPickBlock: (blockId: string) => void }) {
  // focusBlockId reads the stored block; `current` is that same value, so this follows a pick.
  const { t, language } = useI18n();
  const blockId = current || focusBlockId();
  const needsBlock = !current && plannableBlocks().length > 1;
  const today = new Date().toLocaleDateString(language === "id" ? "id-ID" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today-head">
        <div>
          <p className="today-date">{today}</p>
          <h1 className="today-title" id="today-title">
            {firstVisit ? t("today.welcome") : greeting(t)}
          </h1>
        </div>
        {streak > 0 && (
          <span className="today-chip today-chip-streak" title={t("today.streakHint")}>
            <FlameIcon />
            {t("today.streak", { count: streak })}
          </span>
        )}
      </div>
      {needsBlock && <BlockPicker current={current} onPick={onPickBlock} />}
      {blockId && !needsBlock && <TodayCard blockId={blockId} />}
    </section>
  );
}

function TodayCard({ blockId }: { blockId: string }) {
  const p = useExamPlan(blockId);
  const { t } = useI18n();
  const status = p.plan ? planStatus(p.plan, p.progress) : null;
  const next = status?.next ?? null;
  const allDone = status !== null && status.total > 0 && status.done === status.total;

  return (
    <div className="today-card">
      <div className="today-card-meta">
        <Link to={`/plan/${blockId}`} className="today-chip" title={t("today.openPlan")}>
          <CalendarIcon />
          {t("admin.blockN", { block: blockId })} · {countdownText(p.daysLeft, t)}
        </Link>
        <span className="today-chip" title={t("today.readyHint")}>
          {t("today.ready", { percent: Math.round(p.readiness.readiness) })}
        </span>
        {status && status.total > 0 && (
          <span className="today-progress" aria-label={t("today.doneOf", { done: status.done, total: status.total })}>
            <span className="today-progress-bar" style={{ width: `${(status.done / status.total) * 100}%` }} />
          </span>
        )}
      </div>

      {!p.plan ? (
        <p className="today-loading">{t("today.working")}</p>
      ) : next ? (
        <div className="today-next">
          <div className="today-next-text">
            <span className="today-kicker">
              {t("today.upNext", { minutes: Math.max(1, next.minutes) })}
              {status && status.total > 1 && ` · ${t("today.doneToday", { done: status.done, total: status.total })}`}
            </span>
            <h2 className="today-next-title">{next.title}</h2>
            <p className="today-next-detail">{next.detail}</p>
          </div>
          <Link to={next.to} className="btn today-start">
            {t("exam.start")}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      ) : (
        <div className="today-next today-next-done">
          <div className="today-next-text">
            <span className="today-kicker">{allDone ? t("today.allDone") : t("today.nothingPlanned")}</span>
            <h2 className="today-next-title">{allDone ? t("today.wellDone") : t("today.free")}</h2>
            <p className="today-next-detail">{t("today.keepGoing")}</p>
          </div>
          <div className="today-extras">
            <Link to={`/exam/${blockId}`} className="btn btn-secondary">
              <TimerIcon />
              {t("today.mockExam")}
            </Link>
            <Link to="/atlas" className="btn btn-secondary">
              <BodyIcon />
              {t("nav.atlas")}
            </Link>
            <Link to="/map" className="btn btn-secondary">
              <MapIcon />
              {t("nav.map")}
            </Link>
          </div>
        </div>
      )}

      {p.plan && p.plan.items.length > 1 && (
        <details className="today-list">
          <summary>
            {t("today.wholePlan")}
            {status && status.minutesLeft > 0 && <span> · {t("today.minutesLeft", { minutes: status.minutesLeft })}</span>}
          </summary>
          <TodayPlanList plan={p.plan} progress={p.progress} />
          <Link to={`/plan/${blockId}`} className="today-plan-link">
            {t("today.changePlan")}
          </Link>
        </details>
      )}
    </div>
  );
}

/**
 * The end of a study session: what's next on today's plan (not this page), or a way home.
 * Shown on finished flashcard, image occlusion, quiz and exam screens.
 */
export function NextUp() {
  const blockId = focusBlockId();
  return blockId ? <NextUpFor blockId={blockId} /> : null;
}

function NextUpFor({ blockId }: { blockId: string }) {
  const { pathname } = useLocation();
  const p = useExamPlan(blockId);
  const { t } = useI18n();
  if (!p.plan) return null;
  const status = planStatus(p.plan, p.progress, pathname);
  return (
    <div className="next-up" role="region" aria-label={t("today.upNextLabel")}>
      {status.next ? (
        <>
          <div className="next-up-text">
            <span className="today-kicker">
              {t("today.nextOnPlan", { done: status.done, total: status.total })}
            </span>
            <strong>{status.next.title}</strong>
            <span>{status.next.detail}</span>
          </div>
          <Link to={status.next.to} className="btn next-up-go">
            {t("exam.continue")}
            <span aria-hidden="true"> →</span>
          </Link>
        </>
      ) : (
        <>
          <div className="next-up-text">
            <span className="today-kicker">{t("today.plan")}</span>
            <strong>{status.total > 0 ? t("today.everything") : t("today.nothingElse")}</strong>
          </div>
          <Link to="/" className="btn btn-secondary next-up-go">
            {t("today.backHome")}
          </Link>
        </>
      )}
    </div>
  );
}
