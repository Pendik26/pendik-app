import { Link } from "react-router-dom";
import { allSubjects, subjectMaterials, type MaterialKind } from "../lib/routeMeta";

const KIND_NAMES: Record<MaterialKind, string> = {
  flashcards: "Flashcards",
  occlusion: "Image occlusion",
  quizzes: "Quiz",
  ebooks: "Ebook",
  summaries: "Summary",
  modules: "Modules",
};

/**
 * The top of every study page for a subject: where it sits (Block › Subject › this), and tabs
 * to the subject's other materials, so moving from its flashcards to its quiz is one click.
 */
export function SubjectTrail({ blockId, subjectId, current }: { blockId: string; subjectId: string; current: MaterialKind }) {
  const key = `${blockId}/${subjectId}`;
  const label = allSubjects().find((s) => s.key === key)?.label ?? subjectId;
  const materials = subjectMaterials(key);
  if (!materials.some((m) => m.kind === current)) materials.push({ kind: current, name: KIND_NAMES[current], path: `/${current}/${key}` });

  return (
    <div className="subject-trail">
      <nav aria-label="Breadcrumb">
        <ol className="trail">
          <li>
            <Link to="/subjects">Block {blockId}</Link>
          </li>
          <li>
            <Link to={`/subjects/${key}`}>{label}</Link>
          </li>
          <li aria-current="page">{KIND_NAMES[current]}</li>
        </ol>
      </nav>
      {materials.length > 1 && (
        <nav className="material-switch" aria-label={`${label} materials`}>
          {materials.map((m) =>
            m.kind === current ? (
              <span key={m.kind} className="material-tab is-on" aria-current="page">
                {m.name}
              </span>
            ) : (
              <Link key={m.kind} to={m.path} className="material-tab">
                {m.name}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
