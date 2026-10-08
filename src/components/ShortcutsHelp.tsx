import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isTyping } from "../lib/keys";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";

type Row = [keys: string[], what: string];

const EVERYWHERE: Row[] = [
  [[mod, "K"], "Search and jump anywhere: today's next step, recent pages, any card or question"],
  [["?"], "This list"],
  [[mod, "\\"], "Collapse or expand the sidebar"],
  [["Esc"], "Close a window or panel"],
];

/** The keys of the page you're on, by its section. */
const BY_SECTION: Record<string, { name: string; rows: Row[]; help?: string }> = {
  flashcards: {
    name: "Flashcards",
    rows: [
      [["Space"], "Show the answer"],
      [["1", "–", "5"], "Grade it: blackout, hard, okay, good, easy"],
    ],
  },
  occlusion: {
    name: "Image occlusion",
    help: "/docs/image-occlusion",
    rows: [
      [["Space"], "Reveal the label"],
      [["1", "–", "5"], "Grade it"],
      [["←", "→"], "Previous or next label"],
      [["[", "]"], "Previous or next figure"],
      [["G"], "Gallery of figures"],
      [["A", "H"], "Show all labels, hide all or one"],
      [["Z"], "Zoom"],
      [["U"], "Undo the last grade"],
    ],
  },
  quizzes: {
    name: "Quizzes",
    rows: [
      [["A", "–", "E"], "Pick an answer (or 1–5)"],
      [["Enter"], "Next question"],
      [["←", "→"], "Previous or next question"],
    ],
  },
  exam: { name: "Exam", rows: [[["A", "–", "E"], "Pick an answer (or 1–5)"], [["←", "→"], "Previous or next question"]] },
  atlas: {
    name: "3D anatomy",
    help: "/docs/anatomy-3d",
    rows: [
      [["/"], "Find a structure"],
      [["W", "A", "S", "D"], "Fly (Q E down and up)"],
      [["1", "3", "7"], "Anterior, dextra, superior (Ctrl: opposite side)"],
      [["F"], "Focus the selection"],
      [["H"], "Hide it (Shift + H shows everything)"],
    ],
  },
  map: { name: "Knowledge map", help: "/docs/knowledge-map", rows: [[["/"], "Find a concept"], [["W", "A", "S", "D"], "Fly in 3D"]] },
};

/** "?" anywhere (outside a text box) lists the keyboard shortcuts, the page's own first. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const section = BY_SECTION[pathname.split("/")[1] ?? ""];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  // A new page closes it.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  if (!open) return null;
  const table = (rows: Row[]) => (
    <dl className="shortcuts-list">
      {rows.map(([keys, what]) => (
        <div key={what} className="shortcuts-row">
          <dt>
            {keys.map((k, i) => (k === "–" ? <span key={i}> – </span> : <kbd key={i}>{k}</kbd>))}
          </dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="command-overlay" onClick={() => { setOpen(false); }}>
      <div className="shortcuts-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => { e.stopPropagation(); }}>
        <div className="shortcuts-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" onClick={() => { setOpen(false); }} aria-label="Close">
            ×
          </button>
        </div>
        {section && (
          <>
            <h3>On this page: {section.name}</h3>
            {table(section.rows)}
            {section.help && (
              <Link to={section.help} className="shortcuts-more">
                All of {section.name}'s controls →
              </Link>
            )}
          </>
        )}
        <h3>Everywhere</h3>
        {table(EVERYWHERE)}
        <Link to="/docs/search-and-shortcuts" className="shortcuts-more">
          Every shortcut, page by page →
        </Link>
      </div>
    </div>
  );
}
