import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isTyping } from "../lib/keys";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";

/** The keys, and a message key for what they do. */
type Row = [keys: string[], what: MessageKey];

const EVERYWHERE: Row[] = [
  [[mod, "K"], "keys.search"],
  [["?"], "keys.thisList"],
  [[mod, "\\"], "keys.sidebar"],
  [["Esc"], "keys.close"],
];

/** The keys of the page you're on, by its section. */
const BY_SECTION: Record<string, { name: MessageKey; rows: Row[]; help?: string }> = {
  flashcards: {
    name: "trail.flashcards",
    rows: [
      [["Space"], "keys.showAnswer"],
      [["1", "–", "5"], "keys.gradeFull"],
    ],
  },
  occlusion: {
    name: "trail.occlusion",
    help: "/docs/image-occlusion",
    rows: [
      [["Space"], "keys.revealLabel"],
      [["1", "–", "5"], "keys.grade"],
      [["←", "→"], "keys.prevNextLabel"],
      [["[", "]"], "keys.prevNextFigure"],
      [["G"], "keys.gallery"],
      [["A", "H"], "keys.showHide"],
      [["Z"], "keys.zoom"],
      [["U"], "keys.undo"],
    ],
  },
  quizzes: {
    name: "nav.quizzes",
    rows: [
      [["A", "–", "E"], "keys.pick"],
      [["Enter"], "keys.nextQuestion"],
      [["←", "→"], "keys.prevNextQuestion"],
    ],
  },
  exam: { name: "keys.secExam", rows: [[["A", "–", "E"], "keys.pick"], [["←", "→"], "keys.prevNextQuestion"]] },
  atlas: {
    name: "nav.atlas",
    help: "/docs/anatomy-3d",
    rows: [
      [["/"], "keys.find"],
      [["W", "A", "S", "D"], "keys.fly"],
      [["1", "3", "7"], "keys.views"],
      [["F"], "keys.focus"],
      [["H"], "keys.hide"],
    ],
  },
  map: { name: "nav.map", help: "/docs/knowledge-map", rows: [[["/"], "keys.findConcept"], [["W", "A", "S", "D"], "keys.fly3d"]] },
};

/** "?" anywhere (outside a text box) lists the keyboard shortcuts, the page's own first. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
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
          <dd>{t(what)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="command-overlay" onClick={() => { setOpen(false); }}>
      <div className="shortcuts-panel" role="dialog" aria-modal="true" aria-label={t("keys.title")} onClick={(e) => { e.stopPropagation(); }}>
        <div className="shortcuts-head">
          <h2>{t("keys.title")}</h2>
          <button type="button" className="icon-btn" onClick={() => { setOpen(false); }} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        {section && (
          <>
            <h3>{t("keys.onPage", { name: t(section.name) })}</h3>
            {table(section.rows)}
            {section.help && (
              <Link to={section.help} className="shortcuts-more">
                {t("keys.allOf", { name: t(section.name) })}
              </Link>
            )}
          </>
        )}
        <h3>{t("keys.everywhere")}</h3>
        {table(EVERYWHERE)}
        <Link to="/docs/search-and-shortcuts" className="shortcuts-more">
          {t("keys.every")}
        </Link>
      </div>
    </div>
  );
}
