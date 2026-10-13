import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flashcardSubjects, keyOf, loadOcclusionNotes, occlusionKeys } from "../lib/content";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { INITIAL_CARD_STATE, isDue } from "../lib/sm2";
import { groupByBlock } from "../lib/blocks";
import { occlusionCards } from "../lib/occlusion";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import type { CardStateMap, OcclusionNote } from "../types/content";
import { useI18n } from "../i18n/useI18n";

const subjects = flashcardSubjects.filter((s) => occlusionKeys.includes(keyOf(s)));

function counts(notes: OcclusionNote[] | undefined, key: string) {
  if (!notes) return null;
  const cards = occlusionCards(notes);
  const stateMap = readJSON<CardStateMap>(STORAGE_KEYS.occlusionState(key), {});
  return {
    figures: notes.length,
    labels: cards.length,
    due: cards.filter((c) => isDue(stateMap[c.id] ?? INITIAL_CARD_STATE)).length,
    mastered: cards.filter((c) => (stateMap[c.id]?.interval ?? 0) >= 21).length,
  };
}

export function OcclusionSubjects() {
  const { t } = useI18n();
  const [notesByKey, setNotesByKey] = useState<Record<string, OcclusionNote[] | undefined>>({});
  useEffect(() => {
    let live = true;
    Promise.all(occlusionKeys.map(async (k) => [k, await loadOcclusionNotes(k)] as const)).then((entries) => {
      if (live) setNotesByKey(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="page">
      <h1>{t("io.title")}</h1>
      <p className="subtitle">{t("io.intro")}</p>

      {groupByBlock(subjects)
        .filter((g) => g.subjects.length > 0)
        .map(({ block, subjects: list }) => (
          <div key={block.id} className="block-section">
            <h2 className="block-section-heading">{block.label}</h2>
            <div className="card-grid">
              {list.map((subject) => {
                const c = counts(notesByKey[keyOf(subject)], keyOf(subject));
                return (
                  <Link key={subject.id} to={`/occlusion/${block.id}/${subject.id}`} className="nav-card">
                    <SubjectCover subjectKey={keyOf(subject)} />
                    <div className="nav-card-header">
                      <SubjectBadge id={subject.id} label={subject.label} />
                      <h2>{subject.label}</h2>
                    </div>
                    <p>
                      {c ? (
                        <>
                          {t("io.counts", { figures: c.figures, labels: c.labels })} · <strong>{t("lib.due", { count: c.due })}</strong>
                          {c.mastered > 0 && ` · ${t("io.mastered", { count: c.mastered })}`}
                        </>
                      ) : (
                        t("common.loading")
                      )}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

      <div className="io-howto">
        <h2>{t("io.howTitle")}</h2>
        <ul>
          <li>
            <strong>{t("io.howReview")}</strong> {t("io.howReviewText")}
          </li>
          <li>
            <strong>{t("io.howBrowse")}</strong> {t("io.howBrowseText")}
          </li>
          <li>
            <strong>{t("io.howGallery")}</strong> {t("io.howGalleryText")}
          </li>
        </ul>
        <dl className="io-keys">
          <dt>Space</dt>
          <dd>{t("io.keyReveal")}</dd>
          <dt>1–5</dt>
          <dd>{t("io.keyGrade")}</dd>
          <dt>← →</dt>
          <dd>{t("io.keyLabel")}</dd>
          <dt>Shift+← → {t("io.or")} [ ]</dt>
          <dd>{t("io.keyFigure")}</dd>
          <dt>H · Z · A</dt>
          <dd>{t("io.keyHide")}</dd>
          <dt>G</dt>
          <dd>{t("io.keyGallery")}</dd>
          <dt>U {t("io.or")} Ctrl+Z</dt>
          <dd>{t("io.keyUndo")}</dd>
        </dl>
      </div>
    </section>
  );
}
