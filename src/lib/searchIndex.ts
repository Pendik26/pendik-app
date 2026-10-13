import { allSubjects } from "./routeMeta";
import { helpPagesIn, type HelpLanguage } from "./help";
import { labText } from "../i18n/labText";
import { labExercises } from "./labActivities";
import {
  ebookMeta,
  ebookSubjects,
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
import { englishT, type MessageKey, type Translate } from "../i18n/i18n";

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

/** The top-level pages: [id, title, what it is, route, extra search words]. */
const PAGES: [string, MessageKey, MessageKey, string, string?][] = [
  ["home", "nav.home", "sx.home", "/"],
  ["flashcards", "nav.flashcards", "sx.flashcards", "/flashcards"],
  ["quizzes", "nav.quizzes", "sx.quizzes", "/quizzes"],
  ["exam", "nav.exams", "sx.exam", "/exam"],
  ["modules", "nav.modules", "sx.modules", "/modules"],
  ["drive", "nav.drive", "sx.drive", "/drive", "google drive ppt slides recordings ub exams tutorial"],
  ["ebooks", "nav.ebooks", "sx.ebooks", "/ebooks"],
  ["summaries", "nav.summaries", "sx.summaries", "/summaries"],
  ["subjects", "nav.subjects", "sx.subjects", "/subjects", "subject overview hub"],
  ["occlusion", "nav.occlusion", "sx.occlusion", "/occlusion", "anki image occlusion anatomy labels figures atlas"],
  ["lab", "nav.lab", "sx.lab", "/lab", "physioex dry lab praktikum simulation muscle"],
];
const PAGES_AFTER_LAB: [string, MessageKey, MessageKey, string, string?][] = [
  ["search", "nav.search", "sx.search", "/search"],
  ["atlas", "nav.atlas", "sx.atlas", "/atlas"],
  ["map", "nav.map", "sx.map", "/map"],
  ["plan", "nav.plan", "sx.plan", "/plan"],
  ["alfond", "nav.alfond", "sx.alfond", "/alfond"],
  ["leaderboard", "nav.leaderboard", "sx.leaderboard", "/leaderboard"],
  ["progress", "nav.progress", "sx.progress", "/progress"],
  ["docs", "nav.help", "sx.docs", "/docs", "help docs guide how to faq documentation"],
];

/** A page in the reader's language, still found by its English words. */
function pageDoc([id, title, detail, to, keywords]: [string, MessageKey, MessageKey, string, string?], t: Translate): SearchDoc {
  const english = t === englishT ? "" : `${englishT(title)} ${englishT(detail)} `;
  return { type: "page", id, title: t(title), detail: t(detail), to, keywords: `${english}${keywords ?? ""}`.trim() || undefined };
}

function staticPages(t: Translate, language: HelpLanguage): SearchDoc[] {
  return [
    ...PAGES.map((p) => pageDoc(p, t)),
    ...labExercises.flatMap((e) =>
      e.activities.map((a) => ({
        type: "page" as const,
        id: `lab-${e.id}-${a.slug}`,
        title: `Lab ${a.number}: ${labText(language, a.title)}`,
        detail: labText(language, a.summary),
        to: `/lab/${e.id}/${a.slug}`,
        keywords: `physioex virtual lab ${e.title} ${labText(language, e.title)} activity ${a.number}`,
      })),
    ),
    ...PAGES_AFTER_LAB.map((p) => pageDoc(p, t)),
    ...helpPagesIn(language).map((p) => ({
      type: "page" as const,
      id: `docs-${p.id}`,
      title: `${t("nav.help")}: ${p.title}`,
      detail: p.description,
      to: `/docs/${p.id}`,
      keywords: `help how to ${p.keywords ?? ""}`,
    })),
  ];
}

function subjectDocs(t: Translate): SearchDoc[] {
  return [
    ...flashcardSubjects.map((s) => ({
      type: "flashcard" as const,
      id: `fs-${keyOf(s)}`,
      title: t("sx.subjectCards", { subject: s.label }),
      detail: t("sx.blockDeck", { block: s.blockId }),
      to: `/flashcards/${s.blockId}/${s.id}`,
    })),
    ...allSubjects().map((s) => ({
      type: "page" as const,
      id: `subject-${s.key}`,
      title: t("sx.subjectBlock", { subject: s.label, block: s.blockId }),
      detail: t("sx.everything"),
      to: `/subjects/${s.key}`,
      keywords: "subject overview all material",
    })),
    ...flashcardSubjects
      .filter((s) => occlusionKeys.includes(keyOf(s)))
      .map((s) => ({
        type: "page" as const,
        id: `io-${keyOf(s)}`,
        title: t("sx.subjectIo", { subject: s.label }),
        detail: t("sx.blockIo", { block: s.blockId }),
        to: `/occlusion/${s.blockId}/${s.id}`,
        keywords: "anki image occlusion labels atlas figures diagram",
      })),
    ...quizSubjects.map((s) => ({
      type: "quiz" as const,
      id: `qs-${keyOf(s)}`,
      title: t("sx.subjectQuiz", { subject: s.label }),
      detail: t("sx.blockBank", { block: s.blockId }),
      to: `/quizzes/${s.blockId}/${s.id}`,
    })),
    ...studyBlocks
      .filter((b) => quizQuestionsInBlock(b.id).length > 0)
      .map((b) => ({
        type: "exam" as const,
        id: `xb-${b.id}`,
        title: t("sx.blockExam", { block: b.label }),
        detail: t("sx.timedExam"),
        to: `/exam/${b.id}`,
      })),
    ...[...modulesByBlockSubject.keys()].map((key) => {
      const [blockId, subjectId] = key.split("/");
      const label = subjectId.charAt(0).toUpperCase() + subjectId.slice(1);
      const count = modulesByBlockSubject.get(key)?.length ?? 0;
      return {
        type: "module" as const,
        id: `md-${key}`,
        title: t("sx.subjectModules", { subject: label }),
        detail: t("sx.blockPdfs", { block: blockId, count }),
        to: `/modules/${blockId}/${subjectId}`,
      };
    }),
    ...ebookSubjects.map((s) => ({
      type: "ebook" as const,
      id: `es-${keyOf(s)}`,
      title: s.label,
      detail: t("sx.blockEbook", { block: s.blockId }),
      to: `/ebooks/${s.blockId}/${s.id}`,
    })),
    ...summarySubjects.map((s) => ({
      type: "summary" as const,
      id: `ss-${keyOf(s)}`,
      title: t("sx.subjectSummary", { subject: s.label }),
      detail: t("sx.blockSummary", { block: s.blockId }),
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
export function buildNavigationDocs(t: Translate = englishT, language: HelpLanguage = "en"): SearchDoc[] {
  return [...staticPages(t, language), ...subjectDocs(t)];
}
