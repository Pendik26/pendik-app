import { allSubjects } from "./routeMeta";
import { helpPages } from "./help";
import { labExercises } from "./labActivities";
import {
  ebookMeta,
  ebookSubjects,
  examPackagesByBlock,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  loadEbookChapters,
  modulesByBlockSubject,
  occlusionKeys,
  quizBanks,
  quizQuestionsInBlock,
  quizSubjects,
  summaries,
  summarySubjects,
} from "./content";
import { studyBlocks } from "./blocks";
import { markdownToPlainText, splitMarkdownSections, truncate } from "./textExtract";

const EXCERPT_LENGTH = 200;

export interface SearchDoc {
  type: "page" | "flashcard" | "quiz" | "exam" | "ebook" | "summary" | "module";
  id: string;
  title: string;
  detail: string;
  to: string;
  subjectId?: string;
  /** Extra matchable text not shown in results (flashcard tags, quiz option text) — broadens recall. */
  keywords?: string;
}

const staticPages: SearchDoc[] = [
  { type: "page", id: "home", title: "Home", detail: "Tip of the day, quick links", to: "/" },
  { type: "page", id: "flashcards", title: "Flashcards", detail: "Spaced-repetition review", to: "/flashcards" },
  { type: "page", id: "quizzes", title: "Quizzes", detail: "Multiple-choice question banks", to: "/quizzes" },
  { type: "page", id: "exam", title: "Exam", detail: "Timed block exams, scored at the end", to: "/exam" },
  { type: "page", id: "modules", title: "Modules", detail: "Original lecture slide PDFs", to: "/modules" },
  { type: "page", id: "drive", title: "Class Drive", detail: "Slides, recordings and exams from the class Google Drive", to: "/drive", keywords: "google drive ppt slides recordings ub exams tutorial" },
  { type: "page", id: "ebooks", title: "Ebooks", detail: "Chapter readers", to: "/ebooks" },
  { type: "page", id: "summaries", title: "Summaries", detail: "Written subject summaries", to: "/summaries" },
  { type: "page", id: "subjects", title: "Subjects", detail: "Everything for each subject in one place", to: "/subjects", keywords: "subject overview hub" },
  { type: "page", id: "occlusion", title: "Image Occlusion", detail: "Anki-style labelled atlas figures", to: "/occlusion", keywords: "anki image occlusion anatomy labels figures atlas" },
  { type: "page", id: "lab", title: "Virtual Lab", detail: "PhysioEx-style skeletal muscle simulator", to: "/lab", keywords: "physioex dry lab praktikum simulation muscle" },
  ...labExercises.flatMap((e) =>
    e.activities.map((a) => ({
      type: "page" as const,
      id: `lab-${e.id}-${a.slug}`,
      title: `Lab ${a.number}: ${a.title}`,
      detail: a.summary,
      to: `/lab/${e.id}/${a.slug}`,
      keywords: `physioex virtual lab ${e.title} activity ${a.number}`,
    })),
  ),
  { type: "page", id: "search", title: "Search", detail: "Search everything", to: "/search" },
  { type: "page", id: "atlas", title: "3D anatomy", detail: "The whole body in 3D: bones, muscles, vessels, nerves and organs", to: "/atlas" },
  { type: "page", id: "map", title: "Knowledge map", detail: "How every concept connects across blocks and subjects", to: "/map" },
  { type: "page", id: "plan", title: "Exam plan", detail: "Today's plan, readiness and countdown", to: "/plan" },
  { type: "page", id: "alfond", title: "Alfond", detail: "Ask the study assistant anything", to: "/alfond" },
  { type: "page", id: "leaderboard", title: "Leaderboard", detail: "Weekly, all-time and streak rankings", to: "/leaderboard" },
  { type: "page", id: "progress", title: "Progress", detail: "Streaks, export & import", to: "/progress" },
  { type: "page", id: "docs", title: "Help", detail: "How every part of the app works", to: "/docs", keywords: "help docs guide how to faq documentation" },
  ...helpPages.map((p) => ({
    type: "page" as const,
    id: `docs-${p.id}`,
    title: `Help: ${p.title}`,
    detail: p.description,
    to: `/docs/${p.id}`,
    keywords: `help how to ${p.keywords ?? ""}`,
  })),
];

function subjectDocs(): SearchDoc[] {
  return [
    ...flashcardSubjects.map((s) => ({
      type: "flashcard" as const,
      id: `fs-${keyOf(s)}`,
      title: `${s.label} flashcards`,
      detail: `Block ${s.blockId} deck`,
      to: `/flashcards/${s.blockId}/${s.id}`,
    })),
    ...allSubjects().map((s) => ({
      type: "page" as const,
      id: `subject-${s.key}`,
      title: `${s.label} (Block ${s.blockId})`,
      detail: "Everything for this subject",
      to: `/subjects/${s.key}`,
      keywords: "subject overview all material",
    })),
    ...flashcardSubjects
      .filter((s) => occlusionKeys.includes(keyOf(s)))
      .map((s) => ({
        type: "page" as const,
        id: `io-${keyOf(s)}`,
        title: `${s.label} image occlusion`,
        detail: `Block ${s.blockId} atlas figures with hidden labels`,
        to: `/occlusion/${s.blockId}/${s.id}`,
        keywords: "anki image occlusion labels atlas figures diagram",
      })),
    ...quizSubjects.map((s) => ({
      type: "quiz" as const,
      id: `qs-${keyOf(s)}`,
      title: `${s.label} quiz`,
      detail: `Block ${s.blockId} question bank`,
      to: `/quizzes/${s.blockId}/${s.id}`,
    })),
    ...studyBlocks
      .filter(
        (b) =>
          (examPackagesByBlock.get(b.id)?.length ?? 0) > 0 ||
          quizQuestionsInBlock(b.id).length > 0,
      )
      .map((b) => ({
        type: "exam" as const,
        id: `xb-${b.id}`,
        title: `${b.label} exam`,
        detail: "Timed block exam",
        to: `/exam/${b.id}`,
      })),
    ...[...modulesByBlockSubject.keys()].map((key) => {
      const [blockId, subjectId] = key.split("/");
      const label = subjectId.charAt(0).toUpperCase() + subjectId.slice(1);
      const count = modulesByBlockSubject.get(key)?.length ?? 0;
      return {
        type: "module" as const,
        id: `md-${key}`,
        title: `${label} modules`,
        detail: `Block ${blockId} · ${count} PDF${count === 1 ? "" : "s"}`,
        to: `/modules/${blockId}/${subjectId}`,
      };
    }),
    ...ebookSubjects.map((s) => ({
      type: "ebook" as const,
      id: `es-${keyOf(s)}`,
      title: s.label,
      detail: `Block ${s.blockId} ebook`,
      to: `/ebooks/${s.blockId}/${s.id}`,
    })),
    ...summarySubjects.map((s) => ({
      type: "summary" as const,
      id: `ss-${keyOf(s)}`,
      title: `${s.label} summary`,
      detail: `Block ${s.blockId} summary`,
      to: `/summaries/${s.blockId}/${s.id}`,
    })),
  ];
}

/** The bare subject id from a "{blockId}/{subjectId}" key, used for the subject filter chips. */
function subjectOf(key: string): string {
  return key.split("/")[1] ?? key;
}

function contentDocs(ebookChapters: ReadonlyMap<string, string>): SearchDoc[] {
  const flashcardDocs = [...flashcardDecks].flatMap(([key, cards]) =>
    cards.map((card) => ({
      type: "flashcard" as const,
      id: card.id,
      title: card.front,
      detail: card.back,
      to: `/flashcards/${key}`,
      subjectId: subjectOf(key),
      keywords: card.tags.join(" "),
    })),
  );
  const quizDocs = [...quizBanks].flatMap(([key, bank]) =>
    bank.map((q) => ({
      type: "quiz" as const,
      id: q.id,
      title: q.question,
      detail: q.explanation,
      to: `/quizzes/${key}`,
      subjectId: subjectOf(key),
      keywords: q.options.join(" "),
    })),
  );
  const summaryDocs = [...summaries].flatMap(([key, markdown = ""]) => {
    const subjectId = subjectOf(key);
    const label = summarySubjects.find((s) => keyOf(s) === key)?.label ?? subjectId;
    const to = `/summaries/${key}`;
    const sections = splitMarkdownSections(markdown);

    if (sections.length === 0) {
      return [
        {
          type: "summary" as const,
          id: `sum-${key}`,
          title: `${label} summary`,
          detail: truncate(markdownToPlainText(markdown), EXCERPT_LENGTH),
          to,
          subjectId,
        },
      ];
    }

    return sections
      .map((section, i) => ({
        type: "summary" as const,
        id: `sum-${key}-${i}`,
        title: `${label}: ${section.heading}`,
        detail: truncate(markdownToPlainText(section.body), EXCERPT_LENGTH),
        keywords: markdownToPlainText(section.body),
        to,
        subjectId,
      }))
      .filter((doc) => doc.detail.length > 0);
  });
  const ebookDocs = [...ebookChapters].flatMap(([key, markdown]) => {
    const [blockId, subjectId, chapterId] = key.split("/");
    const meta = ebookMeta.get(`${blockId}/${subjectId}`);
    const chapterTitle = meta?.chapters.find((c) => c.id === chapterId)?.title ?? chapterId;
    const to = `/ebooks/${blockId}/${subjectId}/${chapterId}`;
    const sections = splitMarkdownSections(markdown);

    if (sections.length === 0) {
      return [
        {
          type: "ebook" as const,
          id: `eb-${key}`,
          title: chapterTitle,
          detail: truncate(markdownToPlainText(markdown), EXCERPT_LENGTH),
          to,
          subjectId,
        },
      ];
    }

    return sections
      .map((section, i) => ({
        type: "ebook" as const,
        id: `eb-${key}-${i}`,
        title: `${chapterTitle}: ${section.heading}`,
        detail: truncate(markdownToPlainText(section.body), EXCERPT_LENGTH),
        keywords: markdownToPlainText(section.body),
        to,
        subjectId,
      }))
      .filter((doc) => doc.detail.length > 0);
  });
  return [...flashcardDocs, ...quizDocs, ...summaryDocs, ...ebookDocs];
}

/**
 * Full-content index (flashcards, quiz questions, summary sections, ebook sections), used by
 * the Search page. Ebook chapters load on demand, so pass them in once they've arrived; without
 * them the index covers everything else.
 */
export function buildContentDocs(ebookChapters: ReadonlyMap<string, string> = new Map()): SearchDoc[] {
  return contentDocs(ebookChapters);
}

/** The full-content index including every ebook chapter. */
export async function loadContentDocs(): Promise<SearchDoc[]> {
  return contentDocs(await loadEbookChapters());
}

/** Lighter index (pages + subjects only), used by the command palette for fast navigation. */
export function buildNavigationDocs(): SearchDoc[] {
  return [...staticPages, ...subjectDocs()];
}
