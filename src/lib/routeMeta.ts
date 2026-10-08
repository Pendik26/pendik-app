// Title, description and indexability for every route, used by the app (usePageMeta keeps the
// document head in step while navigating) and by the build's prerender step (a static HTML page
// per route, the sitemap). One place, so the two always agree.

import { blockById, studyBlocks } from "./blocks";
import {
  ebookMeta,
  ebookSubjects,
  flashcardDecks,
  flashcardSubjects,
  keyOf,
  modulesByBlockSubject,
  moduleSubjects,
  occlusionKeys,
  quizBanks,
  quizQuestionsInBlock,
  quizSubjects,
  subjectKey,
  summaries,
  summarySubjects,
} from "./content";
import { helpPage, helpPages } from "./help";
import { findLabActivity, labExercises } from "./labActivities";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "./site";
import { markdownToPlainText, truncate } from "./textExtract";
import type { Subject } from "../types/content";

export interface PageMeta {
  title: string;
  description: string;
  /** False for personal pages (progress, account) and unknown routes: kept out of search. */
  indexable: boolean;
}

export interface Crumb {
  name: string;
  path: string;
}

const DESCRIPTION_LENGTH = 158;

/** "Block 1.2" from "Block 1.2: Integument and Musculoskeletal System". */
function blockShort(blockId: string): string {
  return `Block ${blockId}`;
}

function blockLabel(blockId: string): string {
  return blockById(blockId)?.label ?? blockShort(blockId);
}

const titled = (title: string) => `${title} · ${SITE_NAME}`;
const describe = (text: string) => truncate(text.replace(/\s+/g, " ").trim(), DESCRIPTION_LENGTH);

function findSubject(list: Subject[], blockId: string, subjectId: string): Subject | undefined {
  return list.find((s) => s.blockId === blockId && s.id === subjectId);
}

/** Every subject that has material anywhere, with its display label, by "{blockId}/{subjectId}". */
export function allSubjects(): { key: string; blockId: string; id: string; label: string }[] {
  const byKey = new Map<string, { key: string; blockId: string; id: string; label: string }>();
  // Module folders are named by id only, so their label is the weakest; other lists win.
  for (const s of [...moduleSubjects, ...summarySubjects, ...ebookSubjects, ...quizSubjects, ...flashcardSubjects]) {
    byKey.set(keyOf(s), { key: keyOf(s), blockId: s.blockId, id: s.id, label: s.label });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The sections that have material for a subject, as links: the subject page's static content. */
export function subjectSections(key: string): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = [];
  const deck = flashcardDecks.get(key);
  const bank = quizBanks.get(key);
  const book = ebookMeta.get(key);
  const modules = modulesByBlockSubject.get(key);
  if (deck) out.push({ name: `Flashcards (${deck.length})`, path: `/flashcards/${key}` });
  if (occlusionKeys.includes(key)) out.push({ name: "Image occlusion", path: `/occlusion/${key}` });
  if (bank) out.push({ name: `Quiz (${bank.length} questions)`, path: `/quizzes/${key}` });
  if (book) out.push({ name: `Ebook: ${book.title}`, path: `/ebooks/${key}` });
  if (summaries.has(key)) out.push({ name: "Summary", path: `/summaries/${key}` });
  if (modules) out.push({ name: `Modules (${modules.length} PDFs)`, path: `/modules/${key}` });
  return out;
}

export type MaterialKind = "flashcards" | "occlusion" | "quizzes" | "ebooks" | "summaries" | "modules";

/** A subject's materials by short name, in study order: the switcher on each study page. */
export function subjectMaterials(key: string): { kind: MaterialKind; name: string; path: string }[] {
  const out: { kind: MaterialKind; name: string; path: string }[] = [];
  if (flashcardDecks.has(key)) out.push({ kind: "flashcards", name: "Flashcards", path: `/flashcards/${key}` });
  if (occlusionKeys.includes(key)) out.push({ kind: "occlusion", name: "Image occlusion", path: `/occlusion/${key}` });
  if (quizBanks.has(key)) out.push({ kind: "quizzes", name: "Quiz", path: `/quizzes/${key}` });
  if (ebookMeta.has(key)) out.push({ kind: "ebooks", name: "Ebook", path: `/ebooks/${key}` });
  if (summaries.has(key)) out.push({ kind: "summaries", name: "Summary", path: `/summaries/${key}` });
  if (modulesByBlockSubject.has(key)) out.push({ kind: "modules", name: "Modules", path: `/modules/${key}` });
  return out;
}

// A Map, not an object: the section comes from the URL, and /constructor isn't a section.
const SECTIONS = new Map<string, { name: string; meta: PageMeta }>(Object.entries({
  subjects: {
    name: "Subjects",
    meta: {
      title: titled("Subjects: Everything by Subject"),
      description: describe(
        "Every subject with all its material in one place: flashcards, image occlusion, quizzes, ebook, summary, lecture slides and virtual labs, by study block.",
      ),
      indexable: true,
    },
  },
  flashcards: {
    name: "Flashcards",
    meta: {
      title: titled("Flashcards for Medical Students"),
      description: describe(
        `Free spaced-repetition flashcard decks for ${flashcardSubjects.map((s) => s.label).join(", ")}, organised by study block. Works offline.`,
      ),
      indexable: true,
    },
  },
  occlusion: {
    name: "Image Occlusion",
    meta: {
      title: titled("Anatomy Image Occlusion"),
      description: describe(
        "Anki-style image occlusion for anatomy: atlas figures with their labels covered. Name each label, reveal it and grade yourself; every label has its own review schedule.",
      ),
      indexable: true,
    },
  },
  quizzes: {
    name: "Quizzes",
    meta: {
      title: titled("Medical School Quizzes"),
      description: describe(
        `Free multiple-choice question banks with explanations for ${quizSubjects.map((s) => s.label).join(", ")}, organised by study block.`,
      ),
      indexable: true,
    },
  },
  exam: {
    name: "Exam",
    meta: {
      title: titled("Timed Block Practice Exams"),
      description: describe("Timed practice exams for each study block, built from past papers and scored at the end, with every answer explained."),
      indexable: true,
    },
  },
  modules: {
    name: "Modules",
    meta: {
      title: titled("Lecture and Practicum Modules"),
      description: describe("The lecture and practicum slides for each subject and study block, in one place."),
      indexable: true,
    },
  },
  ebooks: {
    name: "Ebooks",
    meta: {
      title: titled("Medical Study Ebooks"),
      description: describe(
        `Free chaptered study ebooks: ${ebookSubjects.map((s) => ebookMeta.get(keyOf(s))?.title ?? s.label).join(", ")}.`,
      ),
      indexable: true,
    },
  },
  summaries: {
    name: "Summaries",
    meta: {
      title: titled("Subject Summaries"),
      description: describe(`Concise written summaries for ${summarySubjects.map((s) => s.label).join(", ")}, organised by study block.`),
      indexable: true,
    },
  },
  lab: {
    name: "Virtual Lab",
    meta: {
      title: titled("Virtual Physiology Lab: PhysioEx Practice"),
      description: describe(
        "Practise the PhysioEx skeletal muscle dry lab online: stimulate a simulated muscle and record twitch, summation, tetanus, fatigue, length–tension and load–velocity data.",
      ),
      indexable: true,
    },
  },
  search: { name: "Search", meta: { title: titled("Search"), description: HOME_DESCRIPTION, indexable: false } },
  progress: { name: "Progress", meta: { title: titled("Your Progress"), description: HOME_DESCRIPTION, indexable: false } },
  leaderboard: { name: "Leaderboard", meta: { title: titled("Leaderboard"), description: HOME_DESCRIPTION, indexable: false } },
  account: { name: "Account", meta: { title: titled("Account"), description: HOME_DESCRIPTION, indexable: false } },
  atlas: {
    name: "3D anatomy",
    meta: {
      title: titled("3D Anatomy Atlas: Bones, Muscles, Vessels, Nerves and Organs"),
      description: describe(
        "A free interactive 3D atlas of the whole human body: about 1,850 bones, joints, muscles, vessels, nerves and organs, with their names, descriptions, landmarks and where each muscle attaches.",
      ),
      indexable: true,
    },
  },
  map: {
    name: "Knowledge map",
    meta: {
      title: titled("Knowledge Map: How Every Topic Connects"),
      description: describe(
        "An interactive map of every concept in the course, across all blocks and subjects, linked where they're taught together, with each concept's chapters, flashcards and quiz questions.",
      ),
      indexable: true,
    },
  },
  plan: { name: "Exam plan", meta: { title: titled("Exam Plan"), description: HOME_DESCRIPTION, indexable: false } },
  alfond: { name: "Alfond", meta: { title: titled("Alfond, Your Study Assistant"), description: HOME_DESCRIPTION, indexable: false } },
  docs: {
    name: "Help",
    meta: {
      title: titled("Help: How to Use Every Part of the App"),
      description: describe(
        "How to use flashcards, image occlusion, quizzes, timed exams, the Virtual Lab, the exam plan, the knowledge map, Alfond and your account, with shortcuts and fixes.",
      ),
      indexable: true,
    },
  },
  // Signed-in students only, and never in search results: it lists the class's exam papers.
  drive: { name: "Class Drive", meta: { title: titled("Class Drive"), description: HOME_DESCRIPTION, indexable: false } },
}));

/** Whether a block has a pooled exam (from its quiz questions). Past papers are on the server. */
export function blockHasExam(blockId: string): boolean {
  return quizQuestionsInBlock(blockId).length > 0;
}

/** Past-paper pages: packages, attempts and results, all behind sign-in. */
const EXAM_ACCOUNT_PAGES = new Set(["papers", "attempt", "result"]);
/** Exam pages of the student's own (signed-in, not for search). */
const EXAM_OWN_PAGES: Record<string, string> = { practice: "Practice from the Bank", bookmarks: "Bookmarked Questions" };

const NOT_FOUND: PageMeta = { title: titled("Page not found"), description: HOME_DESCRIPTION, indexable: false };

/** Metadata for a pathname (no query string). */
export function pageMeta(pathname: string): PageMeta {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { title: HOME_TITLE, description: HOME_DESCRIPTION, indexable: true };
  const [section, blockId, subjectId, chapterId] = parts;
  const sectionInfo = SECTIONS.get(section);
  if (!sectionInfo) return NOT_FOUND;
  if (parts.length === 1) return sectionInfo.meta;
  if (section === "docs") {
    const page = parts.length === 2 ? helpPage(blockId) : undefined;
    return page ? { title: titled(`${page.title} · Help`), description: describe(page.description), indexable: true } : NOT_FOUND;
  }
  if (section === "plan") return parts.length === 2 ? { ...sectionInfo.meta, title: titled(`Exam Plan: ${blockShort(blockId)}`) } : NOT_FOUND;

  if (section === "exam") {
    if (EXAM_ACCOUNT_PAGES.has(blockId) && parts.length === 3) {
      return { title: titled("Exam"), description: HOME_DESCRIPTION, indexable: false };
    }
    if (parts.length === 2 && EXAM_OWN_PAGES[blockId]) {
      return { title: titled(EXAM_OWN_PAGES[blockId]), description: HOME_DESCRIPTION, indexable: false };
    }
    if (!blockHasExam(blockId) || parts.length > 2) return NOT_FOUND;
    return {
      title: titled(`${blockShort(blockId)} Practice Exam`),
      description: describe(`Timed practice exam for ${blockLabel(blockId)}: up to 100 questions, scored at the end with explanations.`),
      indexable: true,
    };
  }

  if (section === "lab") {
    const found = parts.length === 3 ? findLabActivity(blockId, subjectId) : undefined;
    if (!found) return NOT_FOUND;
    const { exercise, activity } = found;
    return {
      title: titled(`${activity.title} (Virtual Lab)`),
      description: describe(`Activity ${activity.number} of the ${exercise.title} virtual lab. ${activity.summary} ${activity.expected}`),
      indexable: true,
    };
  }

  if (parts.length < 3) return NOT_FOUND;
  const key = subjectKey(blockId, subjectId);
  const where = `${blockLabel(blockId)}`;

  if (section === "subjects" && parts.length === 3) {
    const subject = allSubjects().find((s) => s.key === key);
    if (!subject) return NOT_FOUND;
    const names = subjectSections(key).map((s) => s.name.replace(/ \(.*\)$/, "").replace(/:.*$/, "").toLowerCase());
    return {
      title: titled(`${subject.label} (${blockShort(blockId)}): All Study Material`),
      description: describe(`Everything for ${subject.label}, ${where}, in one place: ${names.join(", ")}, with what's due next.`),
      indexable: true,
    };
  }
  if (section === "occlusion" && parts.length === 3) {
    const subject = findSubject(flashcardSubjects, blockId, subjectId);
    if (!subject || !occlusionKeys.includes(key)) return NOT_FOUND;
    return {
      title: titled(`${subject.label} Image Occlusion (${blockShort(blockId)})`),
      description: describe(
        `Anki-style image occlusion for ${subject.label}, ${where}: atlas figures with their labels covered, one label at a time, on a spaced-repetition schedule.`,
      ),
      indexable: true,
    };
  }
  if (section === "flashcards" && parts.length === 3) {
    const subject = findSubject(flashcardSubjects, blockId, subjectId);
    if (!subject) return NOT_FOUND;
    const n = flashcardDecks.get(key)?.length ?? 0;
    return {
      title: titled(`${subject.label} Flashcards (${blockShort(blockId)})`),
      description: describe(`${n} free spaced-repetition flashcards for ${subject.label}, ${where}. Review what's due each day; works offline.`),
      indexable: true,
    };
  }
  if (section === "quizzes" && parts.length === 3) {
    const subject = findSubject(quizSubjects, blockId, subjectId);
    if (!subject) return NOT_FOUND;
    const n = quizBanks.get(key)?.length ?? 0;
    return {
      title: titled(`${subject.label} Quiz (${blockShort(blockId)})`),
      description: describe(`${n} multiple-choice questions with explanations for ${subject.label}, ${where}. Free, works offline.`),
      indexable: true,
    };
  }
  if (section === "modules" && parts.length === 3) {
    const subject = findSubject(moduleSubjects, blockId, subjectId);
    if (!subject) return NOT_FOUND;
    const n = modulesByBlockSubject.get(key)?.length ?? 0;
    return {
      title: titled(`${subject.label} Modules (${blockShort(blockId)})`),
      description: describe(`${n} lecture and practicum modules for ${subject.label}, ${where}.`),
      indexable: true,
    };
  }
  if (section === "summaries" && parts.length === 3) {
    const subject = findSubject(summarySubjects, blockId, subjectId);
    const markdown = summaries.get(key);
    if (!subject || markdown === undefined) return NOT_FOUND;
    return {
      title: titled(`${subject.label} Summary (${blockShort(blockId)})`),
      description: describe(markdownToPlainText(markdown)),
      indexable: true,
    };
  }
  if (section === "ebooks") {
    const book = ebookMeta.get(key);
    if (!book || parts.length > 4) return NOT_FOUND;
    if (parts.length === 3) {
      return { title: titled(book.title), description: describe(book.description), indexable: true };
    }
    const index = book.chapters.findIndex((c) => c.id === chapterId);
    const chapter = book.chapters.at(index);
    if (index === -1 || !chapter) return NOT_FOUND;
    return {
      title: titled(`${chapter.title} · ${book.title}`),
      description: describe(`Chapter ${index + 1} of ${book.title}: ${chapter.title}. ${book.description}`),
      indexable: true,
    };
  }
  return NOT_FOUND;
}

/** The trail from Home to this page, for breadcrumb structured data. */
export function breadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const crumbs: Crumb[] = [{ name: "Home", path: "/" }];
  const [section, blockId, subjectId, chapterId] = parts;
  const sectionInfo = section ? SECTIONS.get(section) : undefined;
  if (!sectionInfo) return crumbs;
  crumbs.push({ name: sectionInfo.name, path: `/${section}` });
  if (section === "docs" && blockId) {
    const page = helpPage(blockId);
    if (page) crumbs.push({ name: page.title, path: `/docs/${page.id}` });
    return crumbs;
  }
  if (section === "exam" && blockId) {
    crumbs.push({ name: `${blockShort(blockId)} exam`, path: `/exam/${blockId}` });
  }
  if (section !== "exam" && blockId && subjectId) {
    const bookTitle = section === "ebooks" ? ebookMeta.get(subjectKey(blockId, subjectId))?.title : undefined;
    crumbs.push({ name: bookTitle ?? pageMeta(`/${section}/${blockId}/${subjectId}`).title.replace(` · ${SITE_NAME}`, ""), path: `/${section}/${blockId}/${subjectId}` });
    if (chapterId) {
      const chapter = ebookMeta.get(subjectKey(blockId, subjectId))?.chapters.find((c) => c.id === chapterId);
      if (chapter) crumbs.push({ name: chapter.title, path: `/${section}/${blockId}/${subjectId}/${chapterId}` });
    }
  }
  return crumbs;
}

/** Every page that should be in search results, in a stable order. */
export function indexablePaths(): string[] {
  const paths = ["/", "/subjects", "/flashcards", "/occlusion", "/quizzes", "/exam", "/modules", "/ebooks", "/summaries", "/lab", "/atlas", "/map", "/docs"];
  for (const page of helpPages) paths.push(`/docs/${page.id}`);
  for (const e of labExercises) for (const a of e.activities) paths.push(`/lab/${e.id}/${a.slug}`);
  for (const s of flashcardSubjects) paths.push(`/flashcards/${keyOf(s)}`);
  for (const key of occlusionKeys) paths.push(`/occlusion/${key}`);
  for (const s of allSubjects()) paths.push(`/subjects/${s.key}`);
  for (const s of quizSubjects) paths.push(`/quizzes/${keyOf(s)}`);
  for (const block of studyBlocks) {
    if (blockHasExam(block.id)) paths.push(`/exam/${block.id}`);
  }
  for (const s of moduleSubjects) paths.push(`/modules/${keyOf(s)}`);
  for (const s of ebookSubjects) {
    paths.push(`/ebooks/${keyOf(s)}`);
    for (const c of ebookMeta.get(keyOf(s))?.chapters ?? []) paths.push(`/ebooks/${keyOf(s)}/${c.id}`);
  }
  for (const s of summarySubjects) paths.push(`/summaries/${keyOf(s)}`);
  return paths.filter((p) => pageMeta(p).indexable);
}

/** App pages that are rendered for everyone but kept out of search. */
export const PRIVATE_PATHS = ["/search", "/progress", "/leaderboard", "/account", "/alfond", "/plan", "/drive"];
