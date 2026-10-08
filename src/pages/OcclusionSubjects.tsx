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
      <h1>Image Occlusion</h1>
      <p className="subtitle">Atlas figures with their labels covered. Name each one, reveal it, grade yourself, Anki-style.</p>

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
                          {c.figures} figures · {c.labels} labels · <strong>{c.due} due</strong>
                          {c.mastered > 0 && ` · ${c.mastered} mastered`}
                        </>
                      ) : (
                        "Loading…"
                      )}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

      <div className="io-howto">
        <h2>How it works</h2>
        <ul>
          <li>
            <strong>Review</strong> asks the labels that are due, one at a time. Each label has its own spaced-repetition schedule, so the
            ones you know come back less often.
          </li>
          <li>
            <strong>Browse all</strong> walks through every figure in order: step label by label or figure by figure, tap any box to ask that
            label, or show all the labels to study the figure whole.
          </li>
          <li>
            <strong>All figures</strong> opens a gallery of every figure with its progress; pick one to jump straight to it.
          </li>
        </ul>
        <dl className="io-keys">
          <dt>Space</dt>
          <dd>reveal / cover</dd>
          <dt>1–5</dt>
          <dd>grade (Blackout → Easy)</dd>
          <dt>← →</dt>
          <dd>previous / next label (or swipe)</dd>
          <dt>Shift+← → or [ ]</dt>
          <dd>previous / next figure</dd>
          <dt>H · Z · A</dt>
          <dd>hide all / one · zoom · show every label</dd>
          <dt>G</dt>
          <dd>figure gallery</dd>
          <dt>U or Ctrl+Z</dt>
          <dd>undo the last grade</dd>
        </dl>
      </div>
    </section>
  );
}
