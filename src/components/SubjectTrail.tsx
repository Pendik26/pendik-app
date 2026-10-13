import { Link } from "react-router-dom";
import { allSubjects, subjectMaterials, type MaterialKind } from "../lib/routeMeta";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";

const KIND_NAMES: Record<MaterialKind, MessageKey> = {
  flashcards: "trail.flashcards",
  occlusion: "trail.occlusion",
  quizzes: "trail.quizzes",
  ebooks: "trail.ebooks",
  summaries: "trail.summaries",
  modules: "trail.modules",
};

/**
 * The top of every study page for a subject: where it sits (Block › Subject › this), and tabs
 * to the subject's other materials, so moving from its flashcards to its quiz is one click.
 */
export function SubjectTrail({ blockId, subjectId, current }: { blockId: string; subjectId: string; current: MaterialKind }) {
  const { t } = useI18n();
  const key = `${blockId}/${subjectId}`;
  const label = allSubjects().find((s) => s.key === key)?.label ?? subjectId;
  const materials = subjectMaterials(key);
  if (!materials.some((m) => m.kind === current)) materials.push({ kind: current, name: "", path: `/${current}/${key}` });

  return (
    <div className="subject-trail">
      <nav aria-label={t("trail.label")}>
        <ol className="trail">
          <li>
            <Link to="/subjects">{t("trail.block", { block: blockId })}</Link>
          </li>
          <li>
            <Link to={`/subjects/${key}`}>{label}</Link>
          </li>
          <li aria-current="page">{t(KIND_NAMES[current])}</li>
        </ol>
      </nav>
      {materials.length > 1 && (
        <nav className="material-switch" aria-label={t("trail.materials", { subject: label })}>
          {materials.map((m) =>
            m.kind === current ? (
              <span key={m.kind} className="material-tab is-on" aria-current="page">
                {t(KIND_NAMES[m.kind])}
              </span>
            ) : (
              <Link key={m.kind} to={m.path} className="material-tab">
                {t(KIND_NAMES[m.kind])}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
