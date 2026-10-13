import { Link } from "react-router-dom";
import { keyOf, quizBanks, quizGames, quizSubjects } from "../lib/content";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import type { QuizAttempt } from "../types/content";
import { useI18n } from "../i18n/useI18n";

export function QuizSubjects() {
  const groups = groupByBlock(quizSubjects);
  const { t } = useI18n();

  return (
    <section className="page">
      <h1>{t("lib.quizzesTitle")}</h1>
      <p className="subtitle">{t("lib.quizzesIntro")}</p>
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((subject) => {
              const bank = quizBanks.get(keyOf(subject));
              const games = quizGames.get(keyOf(subject));
              const history = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(keyOf(subject)), []);
              const dueCount = readJSON<string[]>(STORAGE_KEYS.quizDue(keyOf(subject)), []).length;
              const last = history.at(-1);

              return (
                <Link key={subject.id} to={`/quizzes/${block.id}/${subject.id}`} className="nav-card">
                  <SubjectCover subjectKey={`${block.id}/${subject.id}`} />
                  <div className="nav-card-header">
                    <SubjectBadge id={subject.id} label={subject.label} />
                    <h2>{subject.label}</h2>
                  </div>
                  <p>
                    {bank && (
                      <>
                        {t("lib.questions", { count: bank.length })}
                        {dueCount > 0 && (
                          <>
                            {" "}
                            · <strong>{t("lib.due", { count: dueCount })}</strong>
                          </>
                        )}
                        {last && (
                          <>
                            {" "}
                            · {t("lib.lastScore", { score: last.score, total: last.total })}
                          </>
                        )}
                      </>
                    )}
                    {bank && games && " · "}
                    {games && t("lib.interactiveQuiz")}
                  </p>
                </Link>
              );
            })}
            {upcoming.map((u) => (
              <UpcomingSubjectCard key={u.id} id={u.id} label={u.label} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
