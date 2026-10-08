import type { ReactNode } from "react";
import {
  ebookMeta,
  ebookSubjects,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  moduleSubjects,
  modulesByBlockSubject,
  occlusionKeys,
  quizBanks,
  quizGames,
  quizSubjects,
  summaries,
  summarySubjects,
} from "./content";
import { readJSON, STORAGE_KEYS } from "./storage";
import { INITIAL_CARD_STATE, isDue } from "./sm2";
import { labExercises, type LabExercise } from "./labActivities";
import { BookIcon, CardsIcon, FlaskIcon, OcclusionIcon, QuizIcon, SlidesIcon, SummaryIcon } from "../components/icons";
import type { CardStateMap, QuizAttempt } from "../types/content";

// Everything one subject has, across every section, with the student's progress in each:
// the subject cards on Home and the subject pages are both built from this.

export interface SubjectFacet {
  label: string;
  detail: string;
  to: string;
  icon: ReactNode;
}

export interface SubjectOverview {
  /** "{blockId}/{subjectId}" */
  key: string;
  id: string;
  blockId: string;
  label: string;
  facets: SubjectFacet[];
  /** Due flashcards and quiz questions: how much is waiting. */
  activityScore: number;
  /** Percent of the flashcard deck on a 21+ day interval, or null without a deck. */
  mastery: number | null;
}

/** The subject a lab exercise belongs to, from the ebook chapter that guides it. */
export function labSubjectKey(e: LabExercise): string {
  return e.guide.to.split("/").slice(2, 4).join("/");
}

export function buildSubjectOverviews(): SubjectOverview[] {
  // A subject can have material in more than one block (e.g. physiology in 1.1 and 1.2), so
  // each block gets its own card, showing only the content whose folder is in that block.
  const all = [
    ...flashcardSubjects,
    ...quizSubjects,
    ...ebookSubjects,
    ...summarySubjects,
    ...moduleSubjects,
  ];
  const pairs = new Map<string, { id: string; blockId: string }>();
  all.forEach((s) => pairs.set(keyOf(s), { id: s.id, blockId: s.blockId }));

  return Array.from(pairs.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { id, blockId }]) => {
      const label =
        all.find((s) => s.id === id && s.blockId === blockId && !moduleSubjects.includes(s))?.label ??
        id.charAt(0).toUpperCase() + id.slice(1);

      const facets: SubjectFacet[] = [];
      let activityScore = 0;
      let mastery: number | null = null;

      const deck = flashcardDecks.get(key);
      if (deck) {
        const stateMap = readJSON<CardStateMap>(STORAGE_KEYS.cardState(key), {});
        const due = deck.filter((c) => isDue(stateMap[c.id] ?? INITIAL_CARD_STATE)).length;
        const masteredCount = deck.filter((c) => (stateMap[c.id]?.interval ?? 0) >= 21).length;
        mastery = deck.length > 0 ? (masteredCount / deck.length) * 100 : 0;
        activityScore += due;
        facets.push({
          label: "Flashcards",
          detail: due > 0 ? `${deck.length} · ${due} due` : `${deck.length} cards`,
          to: `/flashcards/${blockId}/${id}`,
          icon: <CardsIcon />,
        });
      }

      const bank = quizBanks.get(key);
      const games = quizGames.get(key);
      if (bank || games) {
        const history = readJSON<QuizAttempt[]>(STORAGE_KEYS.quizProgress(key), []);
        const last = history.at(-1);
        const due = readJSON<string[]>(STORAGE_KEYS.quizDue(key), []).length;
        activityScore += due;
        facets.push({
          label: "Quiz",
          detail: bank
            ? due > 0
              ? `${bank.length} · ${due} due`
              : last
                ? `${bank.length} · last ${last.score}/${last.total}`
                : `${bank.length} questions`
            : "Interactive",
          to: `/quizzes/${blockId}/${id}`,
          icon: <QuizIcon />,
        });
      }

      const meta = ebookMeta.get(key);
      if (meta) {
        const completedCount = readJSON<string[]>(STORAGE_KEYS.ebookCompleted(key), []).length;
        facets.push({
          label: "Ebook",
          detail:
            meta.chapters.length > 0
              ? completedCount > 0
                ? `${completedCount}/${meta.chapters.length} complete`
                : `${meta.chapters.length} chapters`
              : "Reference PDF",
          to: `/ebooks/${blockId}/${id}`,
          icon: <BookIcon />,
        });
      }

      if (summaries.get(key)) {
        facets.push({
          label: "Summary",
          detail: "Written summary",
          to: `/summaries/${blockId}/${id}`,
          icon: <SummaryIcon />,
        });
      }

      if (occlusionKeys.includes(key)) {
        facets.push({
          label: "Occlusion",
          detail: "Labelled figures",
          to: `/occlusion/${blockId}/${id}`,
          icon: <OcclusionIcon />,
        });
      }

      const labs = labExercises.filter((e) => labSubjectKey(e) === key);
      if (labs.length > 0) {
        const activities = labs.reduce((n, e) => n + e.activities.length, 0);
        facets.push({
          label: "Lab",
          detail: `${activities} activities`,
          to: "/lab",
          icon: <FlaskIcon />,
        });
      }

      const modulePdfs = modulesByBlockSubject.get(key);
      if (modulePdfs) {
        facets.push({
          label: "Modules",
          detail: `${modulePdfs.length} PDF${modulePdfs.length === 1 ? "" : "s"}`,
          to: `/modules/${blockId}/${id}`,
          icon: <SlidesIcon />,
        });
      }

      return { key, id, blockId, label, facets, activityScore, mastery };
    });
}


/** One subject's overview, or undefined for an unknown key. */
export function subjectOverview(key: string): SubjectOverview | undefined {
  return buildSubjectOverviews().find((s) => s.key === key);
}
