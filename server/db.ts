import type { Binary, Collection, Db, IndexDescription } from "mongodb";
import type { FileRow, RunStatus, SyncCursor } from "./driveSync.js";

// Every MongoDB collection the app keeps, its document shape and its indexes, in one place.
// Better Auth owns `user`, `session`, `account`, `verification` and `rateLimit`; the app owns the
// rest. Dates that count "per day" are UTC days as "YYYY-MM-DD" strings, from the server's clock.

export type Track = "IUP" | "REGULER";
export type Role = "student" | "admin";
export type Mode = "exam" | "practice";
export type PublishStatus = "draft" | "published";
export type QuestionKind = "single_choice" | "short_answer";
export type StudyKind = "flashcard" | "occlusion" | "quiz" | "chapter";

/** A student on the class roster, by student id (NIM). */
export interface StudentDoc {
  _id: string;
  fullName: string;
  cohort: string;
  track: Track | null;
  /** The class within the track ("A" or "B"); the tutorial group below belongs to it. Older rows lack it. */
  classSection?: "A" | "B" | null;
  /** The tutorial group, e.g. "A3" (Reguler class A) or "IUP A". */
  classGroup: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An activated student's account: `_id` is their Better Auth user id. */
export interface AccountDoc {
  _id: string;
  nim: string;
  role: Role;
  mustChangePassword: boolean;
  leaderboardJoined: boolean;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionOption {
  text: string;
  image: string | null;
  isCorrect: boolean;
}

export interface QuestionDoc {
  _id: string;
  block: string;
  source: string | null;
  year: number | null;
  subject: string | null;
  kind: QuestionKind;
  stem: string;
  stemImage: string | null;
  stemImageAlt: string | null;
  explanation: string | null;
  /** Goes up by one whenever what a student sees changes. */
  revision: number;
  status: PublishStatus;
  /** Single choice: in print order, exactly one correct. */
  options: QuestionOption[];
  /** Short answer: accepted answers, the main one first. */
  accepted: string[];
  importId: string | null;
  importPosition: number | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** An imported Markdown file (it holds the answer keys: admins only). */
export interface ImportDoc {
  _id: string;
  title: string;
  sourceText: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface PackageDoc {
  _id: string;
  title: string;
  block: string | null;
  source: string | null;
  year: number | null;
  mode: Mode;
  timeLimitMinutes: number | null;
  trackBest: boolean;
  track: Track | null;
  status: PublishStatus;
  /** In order. */
  questionIds: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** One question of an attempt, frozen when it started. */
export interface AttemptItem {
  position: number;
  questionId: string;
  revision: number;
  /** Single choice: optionOrder[k] is the print position shown at display position k. */
  optionOrder: number[] | null;
  choice: number | null;
  answerText: string | null;
  selfMark: boolean | null;
  flagged: boolean;
  correctChoice: number | null;
  isCorrect: boolean | null;
  graded: boolean | null;
}

export type AttemptStatus = "in_progress" | "finished" | "abandoned";

export interface AttemptDoc {
  _id: string;
  userId: string;
  packageId: string | null;
  title: string | null;
  mode: Mode;
  timeLimitMinutes: number | null;
  holder: string | null;
  tabLeaves: number;
  status: AttemptStatus;
  score: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  blankCount: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  items: AttemptItem[];
}

export interface BookmarkDoc {
  userId: string;
  questionId: string;
  createdAt: Date;
}

export interface CardReviewDoc {
  userId: string;
  kind: "flashcard" | "occlusion";
  deck: string;
  itemId: string;
  day: string;
}

export interface QuizAnswerDoc {
  userId: string;
  deck: string;
  itemId: string;
  day: string;
  correct: boolean;
}

export interface ChapterDoneDoc {
  userId: string;
  deck: string;
  itemId: string;
  day: string;
}

export interface StudyDayDoc {
  userId: string;
  day: string;
}

export type PointSource = "quiz" | "exam" | "cards" | "chapters" | "days";

/** Points a student earned on a day from one source; only ever goes up. */
export interface PointsDoc {
  userId: string;
  day: string;
  source: PointSource;
  points: number;
}

/** A bank question answered right in a finished attempt, once per student, question and day. */
export interface ExamCorrectDoc {
  userId: string;
  questionId: string;
  day: string;
}

/** Everything else the app keeps per student: written freely, never read for points. */
export interface UserStateDoc {
  userId: string;
  key: string;
  value: unknown;
  updatedAt: Date;
}

export interface ReadinessDoc {
  userId: string;
  block: string;
  value: number;
  updatedAt: Date;
}

export interface DriveFileDoc extends Omit<FileRow, "missing_since"> {
  _id: string;
  missing_since: string | null;
  hidden_at: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface DriveSyncRunDoc {
  _id: string;
  status: RunStatus;
  started_by: "schedule" | "admin";
  cursor: SyncCursor;
  files_found: number;
  files_added: number;
  files_updated: number;
  files_missing: number;
  calls: number;
  notes: Record<string, unknown>;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** One session on the schedule: a tutorial (PBL) or a skills-lab (SL) meeting for a student group. */
export interface ScheduleEventDoc {
  _id: string;
  kind: "tutor" | "sl";
  /** The student group it is for, e.g. "INTER B". */
  group: string;
  block: string | null;
  /** "YYYY-MM-DD" and "HH:MM" in Western Indonesia Time (WIB), as printed on the official schedule. */
  date: string;
  start: string;
  end: string;
  /** Session number and kind, e.g. "P16" and "Terbimbing". */
  code: string | null;
  phase: string | null;
  title: string;
  subtitle: string | null;
  lecturerId: string | null;
  /** Called off: shown struck out with this note (e.g. "Tidak ada SL (Responsi 2)"). */
  cancelledNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A lecturer and the WhatsApp numbers students can reach them on. */
export interface LecturerDoc {
  _id: string;
  name: string;
  /** International format without spaces, e.g. "+628123456789". */
  phones: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** An official lecture-schedule PDF (one per block and class), opened from a link. */
export interface ScheduleDocDoc {
  _id: string;
  block: string;
  track: Track | null;
  title: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A question picture an admin uploaded in the import screen (see images.ts). */
export interface QuestionImageDoc {
  _id: string;
  name: string;
  contentType: "image/webp" | "image/png" | "image/jpeg";
  data: Binary;
  size: number;
  createdBy: string;
  createdAt: Date;
}

/** A student's note about the lecturer list: a wrong number, or a lecturer who is missing. */
export interface LecturerReportDoc {
  _id: string;
  userId: string;
  kind: "wrong_number" | "new_lecturer";
  lecturerId: string | null;
  name: string | null;
  phone: string | null;
  note: string | null;
  status: "open" | "done";
  createdAt: Date;
}

/** One fixed window of calls by one student to one kind of function (see rateLimit.ts). */
export interface ApiLimitDoc {
  _id: string;
  count: number;
  /** MongoDB deletes the window once this has passed. */
  expiresAt: Date;
}

export interface AiUsageDoc {
  userId: string;
  day: string;
  count: number;
}

export interface AuditDoc {
  actor: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
}

export interface Collections {
  students: Collection<StudentDoc>;
  accounts: Collection<AccountDoc>;
  questions: Collection<QuestionDoc>;
  imports: Collection<ImportDoc>;
  packages: Collection<PackageDoc>;
  attempts: Collection<AttemptDoc>;
  bookmarks: Collection<BookmarkDoc>;
  cardReviews: Collection<CardReviewDoc>;
  quizAnswers: Collection<QuizAnswerDoc>;
  chaptersDone: Collection<ChapterDoneDoc>;
  studyDays: Collection<StudyDayDoc>;
  points: Collection<PointsDoc>;
  examCorrect: Collection<ExamCorrectDoc>;
  userState: Collection<UserStateDoc>;
  readiness: Collection<ReadinessDoc>;
  driveFiles: Collection<DriveFileDoc>;
  driveSyncRuns: Collection<DriveSyncRunDoc>;
  scheduleEvents: Collection<ScheduleEventDoc>;
  lecturers: Collection<LecturerDoc>;
  scheduleDocs: Collection<ScheduleDocDoc>;
  lecturerReports: Collection<LecturerReportDoc>;
  questionImages: Collection<QuestionImageDoc>;
  aiUsage: Collection<AiUsageDoc>;
  apiLimits: Collection<ApiLimitDoc>;
  auditLog: Collection<AuditDoc>;
}

export function collections(db: Db): Collections {
  return {
    students: db.collection("students"),
    accounts: db.collection("accounts"),
    questions: db.collection("questions"),
    imports: db.collection("imports"),
    packages: db.collection("packages"),
    attempts: db.collection("attempts"),
    bookmarks: db.collection("bookmarks"),
    cardReviews: db.collection("cardReviews"),
    quizAnswers: db.collection("quizAnswers"),
    chaptersDone: db.collection("chaptersDone"),
    studyDays: db.collection("studyDays"),
    points: db.collection("points"),
    examCorrect: db.collection("examCorrect"),
    userState: db.collection("userState"),
    readiness: db.collection("readiness"),
    driveFiles: db.collection("driveFiles"),
    driveSyncRuns: db.collection("driveSyncRuns"),
    scheduleEvents: db.collection("scheduleEvents"),
    lecturers: db.collection("lecturers"),
    scheduleDocs: db.collection("scheduleDocs"),
    lecturerReports: db.collection("lecturerReports"),
    questionImages: db.collection("questionImages"),
    aiUsage: db.collection("aiUsage"),
    apiLimits: db.collection("apiLimits"),
    auditLog: db.collection("auditLog"),
  };
}

export const INDEXES: Record<string, IndexDescription[]> = {
  // Better Auth (it creates no indexes on MongoDB itself).
  user: [{ key: { email: 1 }, unique: true }],
  session: [
    { key: { token: 1 }, unique: true },
    { key: { userId: 1 } },
    // MongoDB deletes each session once it expires.
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiry" },
  ],
  account: [{ key: { userId: 1 } }, { key: { providerId: 1, accountId: 1 } }],
  verification: [
    { key: { identifier: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiry" },
  ],
  rateLimit: [{ key: { key: 1 }, unique: true }],

  // App
  students: [{ key: { cohort: 1 } }],
  accounts: [{ key: { nim: 1 }, unique: true }],
  questions: [{ key: { importId: 1, importPosition: 1 } }, { key: { block: 1, source: 1, year: 1, subject: 1 } }],
  packages: [{ key: { questionIds: 1 } }],
  attempts: [
    { key: { userId: 1, startedAt: -1 } },
    // One attempt in progress per student.
    { key: { userId: 1 }, unique: true, partialFilterExpression: { status: "in_progress" }, name: "one_running" },
  ],
  bookmarks: [{ key: { userId: 1, questionId: 1 }, unique: true }],
  cardReviews: [{ key: { userId: 1, kind: 1, deck: 1, itemId: 1, day: 1 }, unique: true }, { key: { userId: 1, day: 1 } }],
  quizAnswers: [{ key: { userId: 1, deck: 1, itemId: 1, day: 1 }, unique: true }],
  chaptersDone: [{ key: { userId: 1, deck: 1, itemId: 1 }, unique: true }],
  studyDays: [{ key: { userId: 1, day: 1 }, unique: true }],
  points: [{ key: { userId: 1, day: 1, source: 1 }, unique: true }, { key: { day: 1 } }],
  examCorrect: [{ key: { userId: 1, questionId: 1, day: 1 }, unique: true }],
  userState: [{ key: { userId: 1, key: 1 }, unique: true }, { key: { userId: 1, updatedAt: 1 } }],
  readiness: [{ key: { userId: 1, block: 1 }, unique: true }, { key: { block: 1 } }],
  driveFiles: [{ key: { drive_file_id: 1 }, unique: true }, { key: { title: 1 } }],
  driveSyncRuns: [
    { key: { started_at: -1 } },
    // One sync running at a time.
    { key: { status: 1 }, unique: true, partialFilterExpression: { status: "running" }, name: "one_running" },
  ],
  scheduleEvents: [{ key: { group: 1, date: 1, start: 1 } }, { key: { kind: 1, date: 1 } }],
  lecturers: [{ key: { name: 1 } }],
  scheduleDocs: [{ key: { block: 1, track: 1 } }],
  lecturerReports: [{ key: { status: 1, createdAt: -1 } }, { key: { userId: 1, status: 1 } }],
  aiUsage: [{ key: { userId: 1, day: 1 }, unique: true }],
  apiLimits: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "expiry" }],
  auditLog: [{ key: { createdAt: -1 } }],
};

/** Creates any missing index; a no-op round trip per collection when they all exist. */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all(Object.entries(INDEXES).map(([name, indexes]) => db.collection(name).createIndexes(indexes)));
}

/** Today's date on the server's clock, in UTC. Every "per day" rule uses this, never the browser's. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The UTC day `n` days before `day`. */
export function daysBefore(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

/** True for MongoDB's duplicate-key error. */
export function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}
