import { QuestionImage } from "../exam/QuestionImage";
import { useI18n } from "../../i18n/useI18n";
import { hasPicture, type PreviewQuestion } from "../../lib/questionPreview";

/** A question as students will see it, with its pictures, the key marked, and the explanation. */
export function QuestionPreview({ q }: { q: PreviewQuestion }) {
  const { t } = useI18n();
  return (
    <>
      <p className="exam-stem">
        {hasPicture(q) && <span className="admin-tag">{t("admin.pictureTag")}</span>}
        {q.stem}
      </p>
      {q.stem_image && <QuestionImage path={q.stem_image} alt={q.stem_image_alt ?? ""} small />}
      {q.options ? (
        <ul>
          {q.options.map((o, oi) => (
            <li key={oi} className={oi === q.correct_index ? "admin-correct" : undefined}>
              {o.image ? <QuestionImage path={o.image} alt={o.text} small /> : null}
              {o.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-correct">{q.accepted_answers?.join(" · ")}</p>
      )}
      {q.explanation && <p className="admin-explanation">{q.explanation}</p>}
    </>
  );
}
