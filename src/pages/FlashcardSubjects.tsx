import { Link } from "react-router-dom";
import { flashcardDecks, flashcardSubjects, keyOf } from "../lib/content";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { INITIAL_CARD_STATE, isDue } from "../lib/sm2";
import { groupByBlock } from "../lib/blocks";
import { SubjectBadge } from "../components/SubjectBadge";
import { SubjectCover } from "../components/SubjectCover";
import { UpcomingSubjectCard } from "../components/UpcomingSubjectCard";
import type { CardStateMap } from "../types/content";

export function FlashcardSubjects() {
  const groups = groupByBlock(flashcardSubjects);

  return (
    <section className="page">
      <h1>Flashcards</h1>
      <p className="subtitle">Pick a subject to start a spaced-repetition review session.</p>
      {groups.map(({ block, subjects, upcoming }) => (
        <div key={block.id} className="block-section">
          <h2 className="block-section-heading">{block.label}</h2>
          <div className="card-grid">
            {subjects.map((subject) => {
              const deck = flashcardDecks.get(keyOf(subject)) ?? [];
              const stateMap = readJSON<CardStateMap>(STORAGE_KEYS.cardState(keyOf(subject)), {});
              const due = deck.filter((card) => isDue(stateMap[card.id] ?? INITIAL_CARD_STATE)).length;

              return (
                <Link key={subject.id} to={`/flashcards/${block.id}/${subject.id}`} className="nav-card">
                  <SubjectCover subjectKey={`${block.id}/${subject.id}`} />
                  <div className="nav-card-header">
                    <SubjectBadge id={subject.id} label={subject.label} />
                    <h2>{subject.label}</h2>
                  </div>
                  <p>
                    {deck.length} cards · <strong>{due} due</strong>
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
