import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { ebookMeta, flashcardDecks, quizBanks, subjectKey } from "../lib/content";
import { blockById } from "../lib/blocks";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { INITIAL_CARD_STATE, isDue } from "../lib/sm2";
import { labExercises } from "../lib/labActivities";
import { blockHasExam } from "../lib/routeMeta";
import { labSubjectKey, subjectOverview } from "../lib/subjectOverview";
import { subjectCover } from "../lib/subjectCovers";
import { subjectHueStyle } from "../lib/subjectStyle";
import { SubjectBadge } from "../components/SubjectBadge";
import { RadialGauge } from "../components/RadialGauge";
import { CheckIcon, TimerIcon } from "../components/icons";
import type { CardStateMap, QuizAttempt, ReadingPosition } from "../types/content";
import { useI18n } from "../i18n/useI18n";
import type { Translate } from "../i18n/i18n";

interface NextAction {
  to: string;
  title: string;
  detail: string;
}

/** What to do next in this subject, most pressing first: due cards, missed questions, the book. */
function nextActions(key: string, blockId: string, subjectId: string, t: Translate): NextAction[] {
  const actions: NextAction[] = [];
  const deck = flashcardDecks.get(key);
  if (deck) {
    const stateMap = readJSON<CardStateMap>(STORAGE_KEYS.cardState(key), {});
    const due = deck.filter((c) => isDue(stateMap[c.id] ?? INITIAL_CARD_STATE)).length;
    if (due > 0) actions.push({ to: `/flashcards/${blockId}/${subjectId}`, title: t("hub.reviewCards", { count: due }), detail: t("hub.dueToday") });
  }
  const bank = quizBanks.get(key);
  if (bank) {
    const due = readJSON<string[]>(STORAGE_KEYS.quizDue(key), []).length;
    const history = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(key), []);
    if (due > 0) actions.push({ to: `/quizzes/${blockId}/${subjectId}`, title: t("hub.retryMissed", { count: due }), detail: t("hub.fromPast") });
    else if (history.length === 0) actions.push({ to: `/quizzes/${blockId}/${subjectId}`, title: t("hub.takeQuiz"), detail: t("hub.questions", { count: bank.length }) });
  }
  const book = ebookMeta.get(key);
  if (book && book.chapters.length > 0) {
    const position = readJSON<ReadingPosition | null>(STORAGE_KEYS.ebookPosition(key), null);
    const chapter = book.chapters.find((c) => c.id === position?.chapterId);
    actions.push(
      chapter
        ? { to: `/ebooks/${blockId}/${subjectId}/${chapter.id}`, title: t("hub.keepReading"), detail: chapter.title }
        : { to: `/ebooks/${blockId}/${subjectId}`, title: t("hub.startEbook"), detail: book.chapters[0].title },
    );
  }
  return actions.slice(0, 3);
}

export function SubjectHub() {
  const { blockId = "", subjectId = "" } = useParams();
  const { t } = useI18n();
  const key = subjectKey(blockId, subjectId);
  const overview = subjectOverview(key, t);

  if (!overview) {
    return (
      <section className="page">
        <p>{t("hub.none")}</p>
        <Link to="/subjects">{t("hub.all")}</Link>
      </section>
    );
  }

  const cover = subjectCover(key);
  const book = ebookMeta.get(key);
  const done = readJSON<string[]>(STORAGE_KEYS.ebookCompleted(key), []);
  const labs = labExercises.filter((e) => labSubjectKey(e) === key);
  const actions = nextActions(key, blockId, subjectId, t);

  return (
    <section className="page subject-tinted subject-hub" style={subjectHueStyle(subjectId) as CSSProperties}>
      <Link to="/subjects" className="back-link">
        ← {t("hub.all")}
      </Link>

      <header className="subject-hub-head">
        {cover && <img className="subject-hub-cover" src={cover.src} style={{ objectPosition: cover.focus }} alt="" width={800} height={400} />}
        <div className="subject-hub-title">
          <SubjectBadge id={subjectId} label={overview.label} />
          <div>
            <h1>{overview.label}</h1>
            <p className="subtitle">{blockById(blockId)?.label ?? t("drive.block", { block: blockId })}</p>
          </div>
          {overview.mastery !== null && (
            <div className="subject-hub-mastery">
              <RadialGauge percent={overview.mastery} size={52} strokeWidth={5} label={t("hub.masteryLabel", { percent: Math.round(overview.mastery) })} />
              <span>{t("hub.mastery", { percent: Math.round(overview.mastery) })}</span>
            </div>
          )}
        </div>
      </header>

      {actions.length > 0 && (
        <div className="subject-hub-section">
          <h2 className="section-heading">{t("xplan.nextUp")}</h2>
          <div className="subject-hub-next">
            {actions.map((a, i) => (
              <Link key={a.to + a.title} to={a.to} className={i === 0 ? "subject-hub-action is-primary" : "subject-hub-action"}>
                <strong>{a.title}</strong>
                <span>{a.detail}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="subject-hub-section">
        <h2 className="section-heading">{t("hub.everything", { subject: overview.label })}</h2>
        <div className="subject-hub-grid">
          {overview.facets.map((f) => (
            <Link key={f.label} to={f.to} className="subject-hub-tile">
              <span className="subject-hub-tile-icon">{f.icon}</span>
              <strong>{f.label}</strong>
              <span>{f.detail}</span>
            </Link>
          ))}
          {blockHasExam(blockId) && (
            <Link to={`/exam/${blockId}`} className="subject-hub-tile">
              <span className="subject-hub-tile-icon">
                <TimerIcon />
              </span>
              <strong>{t("hub.blockExam")}</strong>
              <span>{t("hub.blockExamHint", { block: t("drive.block", { block: blockId }) })}</span>
            </Link>
          )}
        </div>
      </div>

      {book && book.chapters.length > 0 && (
        <div className="subject-hub-section">
          <h2 className="section-heading">{t("progress.chaptersTitle")}</h2>
          <ol className="subject-hub-chapters">
            {book.chapters.map((c, i) => (
              <li key={c.id}>
                <Link to={`/ebooks/${blockId}/${subjectId}/${c.id}`}>
                  <span className="subject-hub-chapter-n">{i + 1}</span>
                  <span>{c.title}</span>
                  {done.includes(c.id) && (
                    <span className="subject-hub-check" title={t("hub.completed")}>
                      <CheckIcon />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {labs.map((e) => (
        <div key={e.id} className="subject-hub-section">
          <h2 className="section-heading">{t("nav.lab")}: {e.title}</h2>
          <ol className="subject-hub-chapters">
            {e.activities.map((a) => (
              <li key={a.slug}>
                <Link to={`/lab/${e.id}/${a.slug}`}>
                  <span className="subject-hub-chapter-n">{a.number}</span>
                  <span>{a.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
