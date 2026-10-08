import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { TodayHero } from "../components/plan/Today";
import {
  ebookMeta,
  ebookSubjects,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  quizQuestionsInBlock,
  quizSubjects,
  tips,
} from "../lib/content";
import { focusBlockId } from "../lib/examPlan";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { tipOfDay } from "../lib/tipOfDay";
import { getActivityDays, getCurrentStreak, getLongestStreak } from "../lib/activity";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { isDue } from "../lib/sm2";
import { subjectAccent, subjectHueStyle } from "../lib/subjectStyle";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { RadialGauge } from "../components/RadialGauge";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import { buildSubjectOverviews } from "../lib/subjectOverview";
import { AtomIcon, BodyIcon, CalendarIcon, FlaskIcon, LinkIcon, MapIcon, PlayCircleIcon, SearchIcon, TimerIcon } from "../components/icons";
import type { CardStateMap, ExamAttempt, QuizAttempt, ReadingPosition } from "../types/content";
import { packagesForBlock } from "../lib/exams";

interface ContinueItem {
  to: string;
  title: string;
  detail: string;
  subjectId: string;
  subjectLabel: string;
}


function buildContinueItems(): ContinueItem[] {
  const items: ContinueItem[] = [];

  const resumes = ebookSubjects
    .map((s) => {
      const meta = ebookMeta.get(keyOf(s));
      const position = readJSON<ReadingPosition | null>(STORAGE_KEYS.ebookPosition(keyOf(s)), null);
      return position && meta ? { s, meta, position } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.position.updatedAt.localeCompare(a.position.updatedAt));

  if (resumes[0]) {
    const { s, meta, position } = resumes[0];
    const chapter = meta.chapters.find((c) => c.id === position.chapterId);
    items.push({
      to: `/ebooks/${s.blockId}/${s.id}/${position.chapterId}`,
      title: `Continue "${meta.title}"`,
      detail: chapter ? chapter.title : "Resume reading",
      subjectId: s.id,
      subjectLabel: s.label,
    });
  }

  flashcardSubjects
    .map((s) => {
      const deck = flashcardDecks.get(keyOf(s)) ?? [];
      const stateMap = readJSON<CardStateMap>(STORAGE_KEYS.cardState(keyOf(s)), {});
      // Reviews only: a deck never opened isn't "due".
      const due = deck.filter((c) => {
        const state = stateMap[c.id];
        return state !== undefined && isDue(state);
      }).length;
      return { s, due };
    })
    .filter((x) => x.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, 2)
    .forEach(({ s, due }) => {
      items.push({
        to: `/flashcards/${s.blockId}/${s.id}`,
        title: `${due} card${due === 1 ? "" : "s"} due in ${s.label}`,
        detail: "Spaced-repetition review",
        subjectId: s.id,
        subjectLabel: s.label,
      });
    });

  const dueQuizSubjectIds = new Set<string>();
  quizSubjects
    .map((s) => ({
      s,
      due: readJSON<string[]>(STORAGE_KEYS.quizDue(keyOf(s)), []).length,
    }))
    .filter((x) => x.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, 2)
    .forEach(({ s, due }) => {
      dueQuizSubjectIds.add(keyOf(s));
      items.push({
        to: `/quizzes/${s.blockId}/${s.id}`,
        title: `${due} quiz question${due === 1 ? "" : "s"} due in ${s.label}`,
        detail: "Missed in a past attempt",
        subjectId: s.id,
        subjectLabel: s.label,
      });
    });

  quizSubjects
    .map((s) => {
      const history = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(keyOf(s)), []);
      const last = history.at(-1);
      return last ? { s, last } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && !dueQuizSubjectIds.has(keyOf(x.s)))
    .sort((a, b) => b.last.date.localeCompare(a.last.date))
    .slice(0, 2)
    .forEach(({ s, last }) => {
      items.push({
        to: `/quizzes/${s.blockId}/${s.id}`,
        title: `Retake ${s.label} quiz`,
        detail: `Last score ${last.score}/${last.total}`,
        subjectId: s.id,
        subjectLabel: s.label,
      });
    });

  return items.slice(0, 4);
}

/** Puts the student's current block (set on the Account page) first. */
function orderByCurrentBlock<T extends { block: { id: string } }>(groups: T[], currentBlock: string): T[] {
  if (!currentBlock) return groups;
  return [...groups.filter((g) => g.block.id === currentBlock), ...groups.filter((g) => g.block.id !== currentBlock)];
}

export function Home() {
  const [currentBlock, setCurrentBlock] = useLocalStorage<string>(STORAGE_KEYS.currentBlock, "");
  const tip = tipOfDay(tips);
  const activityDays = getActivityDays();
  const streak = getCurrentStreak(activityDays);
  const longest = getLongestStreak(activityDays);
  const hasActivity = activityDays.length > 0;

  const continueItems = buildContinueItems();
  const subjects = buildSubjectOverviews();
  const featuredId =
    subjects.length > 1
      ? subjects.reduce((top, s) => (s.activityScore > top.activityScore ? s : top), subjects[0]).key
      : null;
  // The student's block first; the others fold away under it.
  const focus = currentBlock || focusBlockId() || "";
  const groups = orderByCurrentBlock(groupByBlock(subjects), focus);
  const mine = groups.filter((g) => g.block.id === focus);
  const others = groups.filter((g) => g.block.id !== focus);
  const shownGroups = mine.length > 0 ? mine : groups;
  const foldedGroups = mine.length > 0 ? others : [];

  const blockSection = ({ block, subjects: blockSubjects, upcoming }: (typeof groups)[number]) => {
    const papers = packagesForBlock(block.id).length;
    const examPool = quizQuestionsInBlock(block.id).length;
    const examHistory = readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(block.id), []);
    const lastExam = examHistory.at(-1);
    return (
      <div key={block.id} className="dashboard-section block-section">
        <div className="block-section-head">
          <h2 className="section-heading">
            <AtomIcon />
            {block.label}
            {block.id === currentBlock && <span className="your-block-pill">Your block</span>}
          </h2>
          {papers > 0 ? (
            <Link to="/exam" className="block-exam-link">
              <TimerIcon />
              {papers === 1 ? "1 past paper" : `${papers} past papers`}
            </Link>
          ) : examPool > 0 && (
            <Link to={`/exam/${block.id}`} className="block-exam-link">
              <TimerIcon />
              {lastExam ? `Exam · last ${lastExam.score}/${lastExam.total}` : "Take the exam"}
            </Link>
          )}
        </div>
        <div className="subject-grid">
          {blockSubjects.map((subject) => (
            <div
              key={subject.key}
              className={
                subject.key === featuredId
                  ? "subject-card subject-card-featured subject-tinted"
                  : "subject-card subject-tinted"
              }
              style={
                {
                  borderLeftColor: subjectAccent(subject.id),
                  "--subject-glow": subjectAccent(subject.id),
                  ...subjectHueStyle(subject.id),
                } as CSSProperties
              }
            >
              <SubjectCover subjectKey={subject.key} />
              <div className="subject-card-head">
                <SubjectBadge id={subject.id} label={subject.label} />
                <h3>
                  <Link to={`/subjects/${subject.key}`} className="subject-card-title-link">
                    {subject.label}
                    <span aria-hidden="true"> →</span>
                  </Link>
                </h3>
                {subject.mastery !== null && (
                  <RadialGauge
                    percent={subject.mastery}
                    label={`${Math.round(subject.mastery)}% of ${subject.label} flashcards mastered`}
                  />
                )}
              </div>
              <div className="subject-links">
                {subject.facets.map((facet) => (
                  <Link
                    key={facet.to + facet.label}
                    to={facet.to}
                    className={`subject-pill subject-pill-${facet.label.toLowerCase()}`}
                  >
                    <span className="subject-pill-icon">{facet.icon}</span>
                    <span className="subject-pill-text">
                      <span className="subject-pill-label">{facet.label}</span>
                      <span className="subject-pill-detail">{facet.detail}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {upcoming.map((u) => (
            <div
              key={u.id}
              className="subject-card subject-card-upcoming subject-tinted"
              style={subjectHueStyle(u.id) as CSSProperties}
            >
              <div className="subject-card-head">
                <SubjectBadge id={u.id} label={u.label} />
                <h3>{u.label}</h3>
              </div>
              <p className="subject-card-upcoming-note">Content coming soon.</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="page dashboard">
      <TodayHero streak={streak} firstVisit={!hasActivity} current={currentBlock} onPickBlock={setCurrentBlock} />


      <div className="dashboard-layout">
        <div className="dashboard-main">
          {continueItems.length > 0 && (
            <div className="dashboard-section">
              <h2 className="section-heading">
                <PlayCircleIcon />
                Pick up where you left off
              </h2>
              <div className="continue-list">
                {continueItems.map((item) => (
                  <Link key={item.to} to={item.to} className="continue-item">
                    <SubjectBadge id={item.subjectId} label={item.subjectLabel} />
                    <span className="continue-item-body">
                      <span className="continue-item-title">{item.title}</span>
                      <span className="continue-item-detail">{item.detail}</span>
                    </span>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="continue-item-chevron">
                      <path
                        d="M9 6l6 6-6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {shownGroups.map(blockSection)}

          {foldedGroups.length > 0 && (
            <details className="other-blocks">
              <summary>
                Other blocks
                <span>{foldedGroups.map((g) => `Block ${g.block.id}`).join(", ")}</span>
              </summary>
              {foldedGroups.map(blockSection)}
            </details>
          )}
        </div>

        <aside className="dashboard-aside">
          <div className="dashboard-widget">
            <h2 className="section-heading">
              <CalendarIcon />
              Activity
            </h2>
            <div className="mini-stats">
              <div>
                <span className="stat-value">{streak}</span>
                <span className="stat-label">Current streak</span>
              </div>
              <div>
                <span className="stat-value">{longest}</span>
                <span className="stat-label">Longest</span>
              </div>
            </div>
            {hasActivity && (
              <div className="heatmap-wrapper mini-heatmap">
                <ActivityHeatmap days={activityDays} weeks={10} />
              </div>
            )}
            <Link to="/progress" className="widget-link">
              Full progress →
            </Link>
          </div>

          <div className="dashboard-widget">
            <h2 className="section-heading">
              <LinkIcon />
              Explore
            </h2>
            <nav className="quick-links" aria-label="Explore">
              <Link to="/atlas">
                <span className="quick-links-label">
                  <BodyIcon />
                  3D anatomy
                </span>
              </Link>
              <Link to="/map">
                <span className="quick-links-label">
                  <MapIcon />
                  Knowledge map
                </span>
              </Link>
              <Link to="/lab">
                <span className="quick-links-label">
                  <FlaskIcon />
                  Virtual Lab
                </span>
              </Link>
              <Link to="/search">
                <span className="quick-links-label">
                  <SearchIcon />
                  Search everything
                </span>
                <kbd>⌘K</kbd>
              </Link>
            </nav>
          </div>

          {tip && (
            <div className="tip-card">
              <span className="tip-dot" aria-hidden="true" />
              <div>
                <span className="tip-label">Tip of the day</span>
                <p>{tip}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
