import { Link } from "react-router-dom";
import { blockById } from "../lib/blocks";
import { labExercises } from "../lib/labActivities";
import { readJSON, STORAGE_KEYS } from "../lib/storage";

export function Lab() {
  return (
    <section className="page lab-page">
      <h1>Virtual Lab</h1>
      <p className="subtitle">
        Practise the PhysioEx dry lab before (or after) the practicum: stimulate a simulated muscle, change one variable at a
        time, record your data and plot it.
      </p>

      {labExercises.map((exercise) => (
        <div key={exercise.id} className="lab-card lab-exercise">
          <p className="lab-kicker">{blockById(exercise.blockId)?.label ?? `Block ${exercise.blockId}`} · Physiology</p>
          <h2>{exercise.title}</h2>
          <p>{exercise.description}</p>
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
                      <strong>{a.title}</strong>
                      <span>{a.summary}</span>
                    </span>
                    {rows > 0 && <span className="lab-activity-rows">{rows} recorded</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="lab-footnote">
            Walkthrough and expected results: <Link to={exercise.guide.to}>{exercise.guide.label}</Link>.
          </p>
        </div>
      ))}

      <p className="lab-footnote">
        An independent practice simulator modelled on PhysioEx 9.1 Exercise 2; not affiliated with Pearson. Its numbers follow
        the practicum slides (threshold about 0.8 V, maximal stimulus 8.5 V, optimal length 75 mm), but always report the values
        you measure in the real program.
      </p>
    </section>
  );
}
