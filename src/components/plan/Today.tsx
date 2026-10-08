import { Link, useLocation } from "react-router-dom";
import { useExamPlan } from "../../hooks/useExamPlan";
import { studyBlocks } from "../../lib/blocks";
import { countdownText, focusBlockId, plannableBlocks } from "../../lib/examPlan";
import { planStatus } from "../../lib/todayPlan";
import { BodyIcon, CalendarIcon, FlameIcon, MapIcon, TimerIcon } from "../icons";
import { TodayPlanList } from "./PlanParts";

// "What should I do now?" answered in one place: the next thing on today's plan, with a Start
// button, and the rest of the day's list under it. Home leads with it, and every study session
// ends with its smaller sibling, NextUp.

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Studying late." : h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

/** First visit (or never chosen): which block is the student in? Sets the plan and Home. */
export function BlockPicker({ current, onPick }: { current: string; onPick: (blockId: string) => void }) {
  const blocks = plannableBlocks();
  return (
    <div className="block-picker" role="group" aria-label="Your block">
      <p className="block-picker-title">Which block are you in?</p>
      <p className="block-picker-hint">Home, your daily plan and the exam countdown follow it. You can change it any time in Account.</p>
      <div className="block-picker-options">
        {blocks.map((b) => (
          <button
            key={b.id}
            type="button"
            className={b.id === current ? "block-picker-option is-on" : "block-picker-option"}
            aria-pressed={b.id === current}
            onClick={() => { onPick(b.id); }}
          >
            <strong>Block {b.id}</strong>
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
  const blockId = current || focusBlockId();
  const needsBlock = !current && plannableBlocks().length > 1;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today-head">
        <div>
          <p className="today-date">{today}</p>
          <h1 className="today-title" id="today-title">
            {firstVisit ? "Welcome. Let's get you studying." : greeting()}
          </h1>
        </div>
        {streak > 0 && (
          <span className="today-chip today-chip-streak" title="Days in a row you've studied">
            <FlameIcon />
            {streak}-day streak
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
  const status = p.plan ? planStatus(p.plan, p.progress) : null;
  const next = status?.next ?? null;
  const allDone = status !== null && status.total > 0 && status.done === status.total;

  return (
    <div className="today-card">
      <div className="today-card-meta">
        <Link to={`/plan/${blockId}`} className="today-chip" title="Open the exam plan">
          <CalendarIcon />
          Block {blockId} · {countdownText(p.daysLeft)}
        </Link>
        <span className="today-chip" title="How ready you are for this block's exam">
          {Math.round(p.readiness.readiness)}% ready
        </span>
        {status && status.total > 0 && (
          <span className="today-progress" aria-label={`${status.done} of ${status.total} done today`}>
            <span className="today-progress-bar" style={{ width: `${(status.done / status.total) * 100}%` }} />
          </span>
        )}
      </div>

      {!p.plan ? (
        <p className="today-loading">Working out today's plan…</p>
      ) : next ? (
        <div className="today-next">
          <div className="today-next-text">
            <span className="today-kicker">
              Up next · about {Math.max(1, next.minutes)} min
              {status && status.total > 1 && ` · ${status.done}/${status.total} done today`}
            </span>
            <h2 className="today-next-title">{next.title}</h2>
            <p className="today-next-detail">{next.detail}</p>
          </div>
          <Link to={next.to} className="btn today-start">
            Start
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      ) : (
        <div className="today-next today-next-done">
          <div className="today-next-text">
            <span className="today-kicker">{allDone ? "All done for today" : "Nothing planned"}</span>
            <h2 className="today-next-title">{allDone ? "Well done. That's today's plan finished." : "You're free today."}</h2>
            <p className="today-next-detail">Keep going if you like: a mock exam, or explore the body in 3D.</p>
          </div>
          <div className="today-extras">
            <Link to={`/exam/${blockId}`} className="btn btn-secondary">
              <TimerIcon />
              Mock exam
            </Link>
            <Link to="/atlas" className="btn btn-secondary">
              <BodyIcon />
              3D anatomy
            </Link>
            <Link to="/map" className="btn btn-secondary">
              <MapIcon />
              Knowledge map
            </Link>
          </div>
        </div>
      )}

      {p.plan && p.plan.items.length > 1 && (
        <details className="today-list">
          <summary>
            Today's whole plan
            {status && status.minutesLeft > 0 && <span> · about {status.minutesLeft} min left</span>}
          </summary>
          <TodayPlanList plan={p.plan} progress={p.progress} />
          <Link to={`/plan/${blockId}`} className="today-plan-link">
            Change your exam date or daily minutes
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
  if (!p.plan) return null;
  const status = planStatus(p.plan, p.progress, pathname);
  return (
    <div className="next-up" role="region" aria-label="Up next">
      {status.next ? (
        <>
          <div className="next-up-text">
            <span className="today-kicker">
              Up next on today's plan · {status.done}/{status.total} done
            </span>
            <strong>{status.next.title}</strong>
            <span>{status.next.detail}</span>
          </div>
          <Link to={status.next.to} className="btn next-up-go">
            Continue
            <span aria-hidden="true"> →</span>
          </Link>
        </>
      ) : (
        <>
          <div className="next-up-text">
            <span className="today-kicker">Today's plan</span>
            <strong>{status.total > 0 ? "That's everything for today." : "Nothing else planned today."}</strong>
          </div>
          <Link to="/" className="btn btn-secondary next-up-go">
            Back to Home
          </Link>
        </>
      )}
    </div>
  );
}
