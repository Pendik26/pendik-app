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
import { getActivityDays, getCurrentStreak } from "../lib/activity";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { isDue } from "../lib/sm2";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { buildSubjectOverviews } from "../lib/subjectOverview";
import { TimerIcon } from "../components/icons";
import type { CardStateMap, ExamAttempt, QuizAttempt, ReadingPosition } from "../types/content";
import { packagesForBlock } from "../lib/exams";
import { RunningAttemptBanner } from "../components/exam/RunningAttemptBanner";
import { RecentDriveFiles } from "../components/drive/RecentDriveFiles";
import { useI18n } from "../i18n/useI18n";
import type { Translate } from "../i18n/i18n";

interface ContinueItem {
  to: string;
  title: string;
  detail: string;
  subjectId: string;
  subjectLabel: string;
}


function buildContinueItems(t: Translate): ContinueItem[] {
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
      title: t("home.continueBook", { title: meta.title }),
      detail: chapter ? chapter.title : t("home.resumeReading"),
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
        title: t("home.cardsDueIn", { count: due, subject: s.label }),
        detail: t("home.spacedReview"),
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
        title: t("home.questionsDueIn", { count: due, subject: s.label }),
        detail: t("home.missedBefore"),
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
        title: t("home.retakeQuiz", { subject: s.label }),
        detail: t("home.lastScore", { score: last.score, total: last.total }),
        subjectId: s.id,
        subjectLabel: s.label,
      });
    });

  return items.slice(0, 4);
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="row-chevron">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Home answers two questions and nothing else: "what should I do now?" (the greeting with the
// next step, and whatever the student left half-done) and "where are my subjects?" (one quiet
// row each). Everything a subject offers lives on its own page, one tap away.
export function Home() {
  const { t } = useI18n();
  const [currentBlock, setCurrentBlock] = useLocalStorage<string>(STORAGE_KEYS.currentBlock, "");
  const tip = tipOfDay(tips);
  const activityDays = getActivityDays();
  const streak = getCurrentStreak(activityDays);
  const hasActivity = activityDays.length > 0;

  const continueItems = buildContinueItems(t);
  const subjects = buildSubjectOverviews(t);
  // The student's block first; the others fold away under it.
  const focus = currentBlock || focusBlockId() || "";
  const groups = groupByBlock(subjects, focus);
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
      <section key={block.id} className="home-section block-section">
        <div className="home-section-head">
          <h2 className="home-heading">
            {block.label}
            {block.id === currentBlock && <span className="your-block-pill">{t("home.yourBlock")}</span>}
          </h2>
          {papers > 0 ? (
            <Link to="/exam" className="text-link">
              <TimerIcon />
              {t("home.pastPapers", { count: papers })}
            </Link>
          ) : examPool > 0 && (
            <Link to={`/exam/${block.id}`} className="text-link">
              <TimerIcon />
              {lastExam ? t("home.examLast", { score: lastExam.score, total: lastExam.total }) : t("home.takeExam")}
            </Link>
          )}
        </div>
        <div className="row-list">
          {blockSubjects.map((subject) => (
            <Link key={subject.key} to={`/subjects/${subject.key}`} className="row-item">
              <SubjectBadge id={subject.id} label={subject.label} />
              <span className="row-item-body">
                <span className="row-item-title">{subject.label}</span>
                <span className="row-item-detail">{subject.facets.map((f) => f.label).join(" · ")}</span>
              </span>
              {subject.mastery !== null && (
                <span
                  className="row-item-meta"
                  aria-label={t("home.mastered", { percent: Math.round(subject.mastery), subject: subject.label })}
                >
                  {t("home.masteredShort", { percent: Math.round(subject.mastery) })}
                </span>
              )}
              <Chevron />
            </Link>
          ))}
          {upcoming.map((u) => (
            <div key={u.id} className="row-item row-item-muted">
              <SubjectBadge id={u.id} label={u.label} />
              <span className="row-item-body">
                <span className="row-item-title">{u.label}</span>
                <span className="row-item-detail">{t("home.comingSoon")}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // The Class Drive is only read for "Recently opened" once something has been opened.
  const opened = readJSON<unknown>(STORAGE_KEYS.driveSeen, []);
  const hasOpenedFiles = Array.isArray(opened) && opened.length > 0;

  return (
    <section className="page home">
      <TodayHero streak={streak} firstVisit={!hasActivity} current={currentBlock} onPickBlock={setCurrentBlock} />

      <RunningAttemptBanner />

      {continueItems.length > 0 && (
        <section className="home-section">
          <h2 className="home-heading">{t("home.pickUp")}</h2>
          <div className="row-list">
            {continueItems.map((item) => (
              <Link key={item.to} to={item.to} className="row-item">
                <SubjectBadge id={item.subjectId} label={item.subjectLabel} />
                <span className="row-item-body">
                  <span className="row-item-title">{item.title}</span>
                  <span className="row-item-detail">{item.detail}</span>
                </span>
                <Chevron />
              </Link>
            ))}
          </div>
        </section>
      )}

      {hasOpenedFiles && <RecentDriveFiles />}

      {shownGroups.map(blockSection)}

      {foldedGroups.length > 0 && (
        <details className="other-blocks">
          <summary>
            {t("home.otherBlocks")}
            <span>{foldedGroups.map((g) => t("admin.blockN", { block: g.block.id })).join(", ")}</span>
          </summary>
          {foldedGroups.map(blockSection)}
        </details>
      )}

      {tip && (
        <p className="home-tip">
          <span>{t("home.tip")}</span>
          {tip}
        </p>
      )}
    </section>
  );
}
