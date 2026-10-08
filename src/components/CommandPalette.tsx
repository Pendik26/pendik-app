import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { recentPages } from "../lib/recentPages";
import { buildNavigationDocs, type SearchDoc } from "../lib/searchIndex";
import { unfinishedToday } from "../lib/todayPlan";
import { HighlightText } from "./HighlightText";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";

export const OPEN_COMMAND_PALETTE_EVENT = "pendik:open-command-palette";

const TYPE_LABELS: Partial<Record<string, MessageKey>> = {
  next: "palette.next",
  recent: "palette.recent",
  page: "palette.page",
  flashcard: "palette.flashcard",
  quiz: "palette.quiz",
  exam: "palette.exam",
  ebook: "palette.ebook",
  summary: "palette.summary",
  module: "palette.module",
};

export function CommandPalette() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const docs = useMemo(() => buildNavigationDocs(), []);
  const fuse = useMemo(
    () =>
      new Fuse(docs, {
        keys: [
          { name: "title", weight: 2 },
          { name: "detail", weight: 1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      }),
    [docs],
  );

  interface RankedDoc {
    doc: Pick<SearchDoc, "id" | "title" | "to">;
    /** The small label on the left: "next", "recent", "page", "flashcard"… */
    label: string;
    titleRanges?: readonly (readonly [number, number])[];
  }

  // With nothing typed: what's next on today's plan, the pages opened last, then the main pages.
  const suggestions = useMemo((): RankedDoc[] => {
    if (!open) return [];
    const next = unfinishedToday(3).map((i) => ({ doc: { id: `next-${i.id}`, title: i.title, to: i.to }, label: "next" }));
    const recent = recentPages()
      .slice(0, 5)
      .map((p) => ({ doc: { id: `recent-${p.path}`, title: p.title, to: p.path }, label: "recent" }));
    const seen = new Set([...next, ...recent].map((r) => r.doc.to.split("?")[0]));
    const pages = docs
      .filter((d) => d.type === "page" && !seen.has(d.to))
      .slice(0, Math.max(3, 10 - next.length - recent.length))
      .map((doc) => ({ doc, label: doc.type }));
    return [...next, ...recent, ...pages];
  }, [open, docs]);

  const results: RankedDoc[] = query.trim()
    ? fuse
        .search(query)
        .slice(0, 8)
        .map((r) => ({ doc: r.item, label: r.item.type, titleRanges: r.matches?.find((m) => m.key === "title")?.indices }))
    : suggestions;

  const openPalette = () => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          openPalette();
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = () => { openPalette(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (doc: Pick<SearchDoc, "to">) => {
    navigate(doc.to);
    setOpen(false);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = results.at(activeIndex);
      if (active) go(active.doc);
    }
  };

  if (!open) return null;

  return (
    <div className="command-overlay" onClick={() => { setOpen(false); }}>
      <div
        className="command-palette"
        onClick={(e) => { e.stopPropagation(); }}
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
      >
        <input
          ref={inputRef}
          className="command-input"
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); }}
          onKeyDown={onInputKeyDown}
          aria-label={t("palette.search")}
        />
        <ul className="command-results">
          {results.map(({ doc, label, titleRanges }, i) => (
            <li key={`${label}-${doc.id}`}>
              <button
                className={i === activeIndex ? "command-item active" : "command-item"}
                onClick={() => { go(doc); }}
                onMouseEnter={() => { setActiveIndex(i); }}
              >
                <span className={`command-item-type command-item-${label}`}>{TYPE_LABELS[label] ? t(TYPE_LABELS[label]) : label}</span>
                <span className="command-item-title">
                  <HighlightText text={doc.title} ranges={titleRanges} />
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="command-empty">{t("palette.none")}</li>}
        </ul>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("palette.navigate")}
          </span>
          <span>
            <kbd>Enter</kbd> {t("palette.select")}
          </span>
          <span>
            <kbd>Esc</kbd> {t("palette.close")}
          </span>
          <span>
            <kbd>?</kbd> {t("palette.shortcuts")}
          </span>
        </div>
      </div>
    </div>
  );
}
