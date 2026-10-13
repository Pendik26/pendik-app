import { rpc } from "./db/client";
import type { Json } from "./db/types";
import { quizBanks, quizSubjects, keyOf } from "./content";
import type { Answers, QuizQuestion } from "../types/content";

// The records that earn leaderboard points (database/schema/06_study.sql): card and label reviews,
// graded quiz answers, finished chapters and study days. The server checks each one against the
// study catalog and keeps the date by its own clock; the browser only says what happened.
//
// Records wait in an outbox (kept on this device, so studying offline isn't lost on a reload) and
// go out a moment after the last one, before the tab is hidden, when the connection returns, and
// before the leaderboard is read.

type Kind = "flashcard" | "occlusion";
type Record_ =
  | { type: "review"; kind: Kind; deck: string; item: string }
  | { type: "quiz"; answers: QuizRecord[] }
  | { type: "chapter"; deck: string; chapter: string }
  | { type: "day" };

export interface QuizRecord {
  deck: string;
  item: string;
  /** The print position (in content/) of the option picked; null when skipped. */
  choice: number | null;
}

const SEND_DELAY_MS = 2000;
const REVIEW_BATCH = 200;
const OUTBOX_KEY = "pendik-outbox";

let userId: string | null = null;
let outbox: Record_[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let sending: Promise<void> | null = null;
/** The UTC day a study day was last queued, so it's sent once a day. */
let dayQueued: string | null = null;

const storageKey = (id: string) => `${OUTBOX_KEY}:${id}`;

function persist() {
  if (!userId) return;
  try {
    if (outbox.length) localStorage.setItem(storageKey(userId), JSON.stringify(outbox));
    else localStorage.removeItem(storageKey(userId));
  } catch {
    // Storage full or blocked: the outbox still goes out from memory.
  }
}

/** Starts recording for this account (sign-in), picking up anything left unsent on this device. */
export function startRecords(id: string): void {
  userId = id;
  dayQueued = null;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(id)) ?? "[]");
    outbox = Array.isArray(saved) ? (saved as Record_[]) : [];
  } catch {
    outbox = [];
  }
  if (outbox.length) schedule();
}

/** Stops recording (sign-out). What's unsent stays on this device for the next sign-in, unless `forget`. */
export function stopRecords({ forget = false }: { forget?: boolean } = {}): void {
  clearTimeout(timer);
  if (forget && userId) {
    try { localStorage.removeItem(storageKey(userId)); } catch { /* blocked storage: nothing kept */ }
  }
  userId = null;
  outbox = [];
  dayQueued = null;
}

function queue(record: Record_) {
  if (!userId) return;
  outbox.push(record);
  persist();
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => void sendRecords(), SEND_DELAY_MS);
}

/** Sends everything waiting. Concurrent calls share one send; failures stay queued. */
export function sendRecords(): Promise<void> {
  sending ??= runSend().finally(() => { sending = null; });
  return sending;
}

async function runSend(): Promise<void> {
  while (userId && outbox.length) {
    const owner = userId;
    const first = outbox[0];
    // Reviews go together, up to a batch; everything else one at a time.
    const batch = first.type === "review"
      ? outbox.slice(0, REVIEW_BATCH).filter((r): r is Extract<Record_, { type: "review" }> => r.type === "review")
      : [first];
    const sent = new Set<Record_>(batch);
    const { error } = await sendOne(batch);
    if (userId !== owner) return;
    // Offline, signed out or the server unreachable: try again later. A record the server refuses
    // for what it is (a raised error or bad data) is dropped, so one can't hold up the rest.
    if (error && !/^(P0001|22|23)/.test(error.code ?? "")) return;
    outbox = outbox.filter((r) => !sent.has(r));
    persist();
  }
}

function sendOne(batch: Record_[]): PromiseLike<{ error: { code?: string; message: string } | null }> {
  const first = batch[0];
  switch (first.type) {
    case "review":
      return rpc("record_reviews", {
        p_items: batch.map((r) => (r.type === "review" ? { kind: r.kind, deck: r.deck, item: r.item } : null)) as Json,
      });
    case "quiz":
      return rpc("record_quiz", { p_answers: first.answers as unknown as Json });
    case "chapter":
      return rpc("finish_chapter", { p_deck: first.deck, p_chapter: first.chapter });
    case "day":
      return rpc("record_study_day");
  }
}

/** A flashcard or image-occlusion label was reviewed (graded) in this deck ("1.2/anatomy"). */
export function recordReview(kind: Kind, deck: string, item: string): void {
  queue({ type: "review", kind, deck, item });
}

/** A quiz or block exam was finished: its answers, graded again on the server. */
export function recordQuiz(answers: QuizRecord[]): void {
  for (let i = 0; i < answers.length; i += 300) queue({ type: "quiz", answers: answers.slice(i, i + 300) });
}

/** An ebook chapter was marked finished. */
export function recordChapter(deck: string, chapter: string): void {
  queue({ type: "chapter", deck, chapter });
}

/** Today (by UTC, as the server counts) was a study day. Cheap to call often. */
export function recordStudyDay(now: Date = new Date()): void {
  const day = now.toISOString().slice(0, 10);
  if (!userId || dayQueued === day) return;
  dayQueued = day;
  queue({ type: "day" });
}

/**
 * The quiz records for a finished session. `questions` are as shown (options shuffled); each
 * choice is mapped back to the option's position in the bank. `deck` is the quiz's subject key,
 * or omitted for a block exam, which draws from every subject of `blockId`.
 */
export function quizRecords(questions: QuizQuestion[], answers: Answers, where: { deck: string } | { blockId: string }): QuizRecord[] {
  const decks = "deck" in where ? [where.deck] : quizSubjects.filter((s) => s.blockId === where.blockId).map(keyOf);
  const records: QuizRecord[] = [];
  for (const shown of questions) {
    for (const deck of decks) {
      const original = quizBanks.get(deck)?.find((q) => q.id === shown.id);
      if (!original) continue;
      const picked = answers[shown.id];
      const choice = picked === undefined ? -1 : original.options.indexOf(shown.options[picked] ?? "");
      records.push({ deck, item: shown.id, choice: choice < 0 ? null : choice });
      break;
    }
  }
  return records;
}
