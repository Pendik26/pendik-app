import { useSyncExternalStore } from "react";
import { streamAi } from "./aiStream";
import { SITE_NAME } from "./site";
import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";
import { STORAGE_UPDATED_EVENT } from "./storage";

// Alfond, the study assistant: one conversation, shared by the floating overlay and the
// /alfond page, kept on this device. Each question carries the text of the page the student
// is looking at, so "what does this mean?" is about what's on screen.

export interface PageContext {
  title: string;
  path: string;
  text: string;
}

export interface AlfondMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** The page a question was asked from. */
  page?: { title: string; path: string };
  /** Why an answer failed or stopped (its partial text stays in content). */
  error?: string;
}

interface AlfondState {
  messages: AlfondMessage[];
  busy: boolean;
  /** AI answers left today, once the server has said. */
  remaining: number | null;
}

/** The newest turns kept on the device; the server only reads the last few anyway. */
const KEPT = 40;
const PAGE_CHARS = 6000;

const isMessage = (m: unknown): m is AlfondMessage =>
  typeof m === "object" && m !== null && ((m as AlfondMessage).role === "user" || (m as AlfondMessage).role === "assistant") && typeof (m as AlfondMessage).content === "string";

function loadMessages(): AlfondMessage[] {
  if (typeof window === "undefined") return [];
  const stored = readJSON<unknown>(STORAGE_KEYS.alfondChat, []);
  return Array.isArray(stored) ? stored.filter(isMessage).slice(-KEPT) : [];
}

let state: AlfondState = { messages: loadMessages(), busy: false, remaining: null };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function update(patch: Partial<AlfondState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function patchMessage(id: string, patch: Partial<AlfondMessage>) {
  update({ messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.alfondChat, JSON.stringify(state.messages.slice(-KEPT)));
  } catch {
    // Storage full or blocked: the conversation just isn't kept.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The conversation as it stands. */
export const alfondState = (): AlfondState => state;

/** The conversation, live. */
export function useAlfond(): AlfondState {
  return useSyncExternalStore(subscribe, alfondState, alfondState);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Asks Alfond, with the page on screen as context (null on Alfond's own page). */
export async function sendToAlfond(text: string, page: PageContext | null): Promise<void> {
  const content = text.trim();
  if (!content || state.busy) return;
  const question: AlfondMessage = { id: newId(), role: "user", content, page: page ? { title: page.title, path: page.path } : undefined };
  const reply: AlfondMessage = { id: newId(), role: "assistant", content: "" };
  const history = [...state.messages, question];
  update({ messages: [...history, reply], busy: true });
  const ctrl = new AbortController();
  controller = ctrl;
  const result = await streamAi(
    "/api/ai/chat",
    {
      messages: history.filter((m) => m.content.trim()).map(({ role, content }) => ({ role, content })),
      page: page ?? undefined,
    },
    (answer) => { patchMessage(reply.id, { content: answer }); },
    ctrl.signal,
  );
  if (controller === ctrl) controller = null;
  const current = state.messages.find((m) => m.id === reply.id);
  if (current) {
    if (result.ok) {
      update({ remaining: result.remaining });
    } else if (ctrl.signal.aborted) {
      // Stopped by the student: keep what came, or drop the empty reply.
      if (current.content.trim()) patchMessage(reply.id, { error: "Stopped." });
      else update({ messages: state.messages.filter((m) => m.id !== reply.id) });
    } else {
      patchMessage(reply.id, { content: result.partial ?? current.content, error: result.message || "Something went wrong." });
    }
  }
  update({ busy: false });
  save();
}

/** Asks the last question again, replacing its failed answer. */
export function retryAlfond(page: PageContext | null): Promise<void> {
  const lastQuestion = [...state.messages].reverse().find((m) => m.role === "user");
  if (!lastQuestion || state.busy) return Promise.resolve();
  const at = state.messages.indexOf(lastQuestion);
  update({ messages: state.messages.slice(0, at) });
  return sendToAlfond(lastQuestion.content, page);
}

export function stopAlfond() {
  controller?.abort();
}

export function clearAlfond() {
  controller?.abort();
  update({ messages: [] });
  save();
}

// ---------------------------------------------------------------------------------------------
// Settings

export interface AlfondPrefs {
  /** The floating button on every page; on unless turned off. */
  overlay?: boolean;
}

let prefs: AlfondPrefs = typeof window === "undefined" ? {} : readJSON<AlfondPrefs>(STORAGE_KEYS.alfondPrefs, {});
const prefListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  // A sync can bring the setting from another device.
  window.addEventListener(STORAGE_UPDATED_EVENT, (e) => {
    const keys = (e as CustomEvent<{ keys?: string[] } | null>).detail?.keys ?? [];
    if (!keys.includes(STORAGE_KEYS.alfondPrefs)) return;
    prefs = readJSON<AlfondPrefs>(STORAGE_KEYS.alfondPrefs, {});
    for (const l of prefListeners) l();
  });
}

export function useAlfondPrefs(): [AlfondPrefs, (patch: AlfondPrefs) => void] {
  const value = useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    () => prefs,
    () => prefs,
  );
  return [value, setAlfondPrefs];
}

export function setAlfondPrefs(patch: AlfondPrefs) {
  prefs = { ...prefs, ...patch };
  writeJSON(STORAGE_KEYS.alfondPrefs, prefs);
  for (const l of prefListeners) l();
}

// ---------------------------------------------------------------------------------------------
// The page on screen

const clean = (text: string) =>
  text
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n[\s]*\n+/g, "\n")
    .trim();

// Leaf-ish blocks of readable text, for picking out the part of a long page that's on screen.
const BLOCKS = "h1,h2,h3,h4,h5,p,li,dt,dd,td,th,figcaption,blockquote,pre,label,button,summary";

/**
 * The page's text as the student sees it. A long page (an ebook chapter) is cut down to the
 * part on screen, starting a little above it, after the page's heading.
 */
export function pageText(root: HTMLElement, limit = PAGE_CHARS): string {
  const full = clean(root.innerText);
  if (full.length <= limit) return full;
  // Menus (a book's table of contents) aren't what the student is reading.
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((el) => !el.querySelector(BLOCKS) && !el.closest("nav, aside"));
  const above = window.innerHeight * 0.4;
  const first = blocks.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > -above;
  });
  if (first === -1) return full.slice(0, limit);
  const heading = clean(root.querySelector("h1")?.textContent ?? "");
  let out = heading ? `${heading}\n(Part of a long page: the section on screen.)\n` : "";
  for (const el of blocks.slice(first)) {
    const text = clean(el.innerText);
    if (!text) continue;
    if (out.length + text.length + 1 > limit) break;
    out += `${text}\n`;
  }
  return out.trim() || full.slice(0, limit);
}

/** What's on screen now, for Alfond's context; null if there's nothing to read. */
export function readPageContext(): PageContext | null {
  if (typeof document === "undefined") return null;
  const main = document.getElementById("main-content");
  if (!main) return null;
  const text = pageText(main);
  if (!text) return null;
  const suffix = ` · ${SITE_NAME}`;
  const title = document.title.endsWith(suffix) ? document.title.slice(0, -suffix.length) : document.title;
  return { title, path: window.location.pathname, text };
}

// ---------------------------------------------------------------------------------------------
// Asking from elsewhere in the app ("Ask Alfond about my progress")

/** Opens the floating chat window (the overlay listens for it). */
export const OPEN_ALFOND_EVENT = "alfond:open";

/**
 * Asks Alfond a question about the page on screen, then shows the answer: in the floating
 * window when it's on, else on Alfond's own page (via `goToPage`).
 */
export function askAlfondAbout(question: string, goToPage: () => void): void {
  void sendToAlfond(question, readPageContext());
  if (prefs.overlay !== false) window.dispatchEvent(new CustomEvent(OPEN_ALFOND_EVENT));
  else goToPage();
}
