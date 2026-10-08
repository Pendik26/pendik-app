import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Fuse from "fuse.js";
import { buildContentDocs, loadContentDocs, type SearchDoc } from "../lib/searchIndex";
import { ebookSubjects, flashcardSubjects, quizSubjects, summarySubjects } from "../lib/content";
import { EmptyState } from "../components/EmptyState";
import { HighlightText } from "../components/HighlightText";
import { subjectHue } from "../lib/subjectStyle";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";

const TYPE_LABELS = new Map<string, MessageKey>([
  ["flashcard", "nav.flashcards"],
  ["quiz", "nav.quizzes"],
  ["summary", "nav.summaries"],
  ["ebook", "nav.ebooks"],
]);

const TYPE_CLASS = new Map([
  ["flashcard", "tag-type-flashcard"],
  ["quiz", "tag-type-quiz"],
  ["summary", "tag-type-summary"],
  ["ebook", "tag-type-ebook"],
]);

function tagHueStyle(id: string): CSSProperties {
  return { "--tag-hue": String(subjectHue(id)) } as CSSProperties;
}

function subjectLabel(id: string): string {
  return (
    flashcardSubjects.find((s) => s.id === id)?.label ??
    quizSubjects.find((s) => s.id === id)?.label ??
    ebookSubjects.find((s) => s.id === id)?.label ??
    summarySubjects.find((s) => s.id === id)?.label ??
    id
  );
}

interface RankedDoc {
  doc: SearchDoc;
  titleRanges?: readonly (readonly [number, number])[];
  detailRanges?: readonly (readonly [number, number])[];
}

export function Search() {
  const { t } = useI18n();
  const typeLabel = (type: string) => {
    const label = TYPE_LABELS.get(type);
    return label ? t(label) : type;
  };
  // ?q= opens the page with a search already typed (the anatomy atlas links here).
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeSubjects, setActiveSubjects] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Each result's link, by its position in the list. */
  const resultRefs = useRef(new Map<number, HTMLAnchorElement>());

  // Everything but the ebook chapters is indexed straight away; the chapters join once loaded.
  const [docs, setDocs] = useState<SearchDoc[]>(() => buildContentDocs());
  useEffect(() => {
    let cancelled = false;
    loadContentDocs().then((all) => {
      if (!cancelled) setDocs(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableTypes = useMemo(
    () => Array.from(new Set(docs.map((d) => d.type))).sort(),
    [docs],
  );
  const availableSubjects = useMemo(() => {
    const ids = Array.from(new Set(docs.map((d) => d.subjectId).filter((id): id is string => Boolean(id))));
    return ids.sort().map((id) => ({ id, label: subjectLabel(id) }));
  }, [docs]);

  const fuse = useMemo(
    () =>
      new Fuse(docs, {
        keys: [
          { name: "title", weight: 2 },
          { name: "detail", weight: 1 },
          { name: "keywords", weight: 0.5 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      }),
    [docs],
  );

  const toggleType = (type: string) => {
    setActiveTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    setActiveIndex(0);
  };
  const toggleSubject = (id: string) => {
    setActiveSubjects((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setActiveIndex(0);
  };

  const rawResults: RankedDoc[] = query.trim()
    ? fuse.search(query).map((r) => ({
        doc: r.item,
        titleRanges: r.matches?.find((m) => m.key === "title")?.indices,
        detailRanges: r.matches?.find((m) => m.key === "detail")?.indices,
      }))
    : [];
  const results = rawResults
    .filter((r) => activeTypes.length === 0 || activeTypes.includes(r.doc.type))
    .filter((r) => activeSubjects.length === 0 || (r.doc.subjectId && activeSubjects.includes(r.doc.subjectId)))
    .slice(0, 25);
  const filtersActive = activeTypes.length > 0 || activeSubjects.length > 0;
  const clampedIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(clampedIndex + 1, results.length - 1);
      setActiveIndex(next);
      resultRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(clampedIndex - 1, 0);
      setActiveIndex(next);
      resultRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const link = resultRefs.current.get(clampedIndex);
      link?.click();
    }
  };

  return (
    <section className="page">
      <h1>{t("nav.search")}</h1>
      <p className="subtitle">{t("search.subtitle")}</p>
      <input
        className="search-input"
        type="search"
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(e) => { onQueryChange(e.target.value); }}
        onKeyDown={onInputKeyDown}
        autoFocus
        aria-label={t("search.label")}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="search-results-list"
        aria-activedescendant={results.length > 0 ? `search-result-${clampedIndex}` : undefined}
      />

      {query.trim() && (
        <div className="search-filters">
          <div className="tag-filter-row">
            {availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={
                  activeTypes.includes(type)
                    ? `tag tag-toggle active ${TYPE_CLASS.get(type) ?? ""}`
                    : `tag tag-toggle ${TYPE_CLASS.get(type) ?? ""}`
                }
                onClick={() => { toggleType(type); }}
                aria-pressed={activeTypes.includes(type)}
              >
                {typeLabel(type)}
              </button>
            ))}
          </div>
          <div className="tag-filter-row">
            {availableSubjects.map((s) => (
              <button
                key={s.id}
                type="button"
                className={activeSubjects.includes(s.id) ? "tag tag-toggle tag-colored active" : "tag tag-toggle tag-colored"}
                style={tagHueStyle(s.id)}
                onClick={() => { toggleSubject(s.id); }}
                aria-pressed={activeSubjects.includes(s.id)}
              >
                {s.label}
              </button>
            ))}
            {filtersActive && (
              <button
                type="button"
                className="tag-filter-clear"
                onClick={() => {
                  setActiveTypes([]);
                  setActiveSubjects([]);
                }}
              >
                {t("cards.clearFilters")}
              </button>
            )}
          </div>
        </div>
      )}

      {!query.trim() && (
        <EmptyState title={t("search.emptyTitle")}>
          {t("search.emptyHint")}
        </EmptyState>
      )}

      {query.trim() && results.length === 0 && (
        <EmptyState title={t("search.noMatches", { query })}>
          {filtersActive ? t("search.tryClear") : t("search.tryShorter")}
        </EmptyState>
      )}

      {query.trim() && results.length > 0 && (
        <p className="search-result-count">
          {t("search.results", { count: results.length, query })}
        </p>
      )}

      <ul className="search-results" id="search-results-list" role="listbox">
        {results.map((r, i) => (
          <li key={`${r.doc.type}-${r.doc.id}`} className="search-result" role="presentation">
            <Link
              id={`search-result-${i}`}
              to={r.doc.to}
              ref={(el) => {
                if (el) resultRefs.current.set(i, el);
                else resultRefs.current.delete(i);
              }}
              className={i === clampedIndex ? "active" : undefined}
              role="option"
              aria-selected={i === clampedIndex}
              onMouseEnter={() => { setActiveIndex(i); }}
            >
              <span className="search-result-type">{typeLabel(r.doc.type)}</span>
              <p className="search-result-title">
                <HighlightText text={r.doc.title} ranges={r.titleRanges} />
              </p>
              <p className="search-result-detail">
                <HighlightText text={r.doc.detail} ranges={r.detailRanges} />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
