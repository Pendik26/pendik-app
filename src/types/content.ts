export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags: string[];
  image?: string;
}

/** One hidden label on an image-occlusion figure, in the image's own pixels. */
export interface OcclusionMask {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The label under the mask (read from the figure; the figure itself is the answer). */
  label: string;
}

/** An atlas figure whose labels are hidden and recalled one at a time (Anki-style image occlusion). */
export interface OcclusionNote {
  id: string;
  /** URL of the figure under public/. */
  image: string;
  width: number;
  height: number;
  title: string;
  /** Body region, used as the filter tag (e.g. "upper-limb"). */
  region: string;
  /** Path of the ebook chapter the figure comes from. */
  chapter: string;
  masks: OcclusionMask[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  image?: string;
}

export interface CardState {
  interval: number;
  easeFactor: number;
  dueDate: string;
  reps: number;
  lapses: number;
}

/** The option picked for each question, by question id; unanswered questions have no entry. */
export type Answers = Partial<Record<string, number>>;

/** Review state by card id; cards never reviewed have no entry. */
export type CardStateMap = Partial<Record<string, CardState>>;

export interface QuizAttempt {
  score: number;
  total: number;
  date: string;
  missedIds: string[];
}

export interface ExamAttempt extends QuizAttempt {
  timeTakenSec: number;
  timeLimitSec: number;
}

export interface Subject {
  id: string;
  label: string;
  /** Study block whose content folder this subject's material lives in, e.g. "1.1". */
  blockId: string;
}

export interface EbookChapterMeta {
  id: string;
  title: string;
}

export interface EbookResource {
  title: string;
  url: string;
}

export interface EbookMeta {
  title: string;
  description: string;
  chapters: EbookChapterMeta[];
  resources?: EbookResource[];
}

export interface ReadingPosition {
  chapterId: string;
  scroll: number;
  updatedAt: string;
}

