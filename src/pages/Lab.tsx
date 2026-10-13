import { Link } from "react-router-dom";
import { blockById } from "../lib/blocks";
import { labExercises } from "../lib/labActivities";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { useI18n } from "../i18n/useI18n";
import { useLabText } from "../i18n/useLabText";

export function Lab() {
  const { t } = useI18n();
  const lt = useLabText();
  return (
    <section className="page lab-page">
      <h1>{t("lab.title")}</h1>
      <p className="subtitle">{t("lab.intro")}</p>

      {labExercises.map((exercise) => (
        <div key={exercise.id} className="lab-card lab-exercise">
          <p className="lab-kicker">{blockById(exercise.blockId)?.label ?? t("trail.block", { block: exercise.blockId })} · {t("lab.physiology")}</p>
          <h2>{lt(exercise.title)}</h2>
          <p>{lt(exercise.description)}</p>
          <ol className="lab-activity-list">
            {exercise.activities.map((a) => {
              const rows = readJSON<unknown[]>(STORAGE_KEYS.labData(`${exercise.id}/${a.slug}`), []).length;
              return (
                <li key={a.slug}>
                  <Link to={`/lab/${exercise.id}/${a.slug}`} className="lab-activity-link">
                    <span className="lab-activity-num" aria-hidden="true">
                      {a.number}
                    </span>
                    <span className="lab-activity-text">
                      <strong>{lt(a.title)}</strong>
                      <span>{lt(a.summary)}</span>
                    </span>
                    {rows > 0 && <span className="lab-activity-rows">{t("lab.recorded", { count: rows })}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="lab-footnote">
            {t("lab.walkthrough")} <Link to={exercise.guide.to}>{lt(exercise.guide.label)}</Link>.
          </p>
        </div>
      ))}

      <p className="lab-footnote">{t("lab.disclaimer")}</p>
    </section>
  );
}
