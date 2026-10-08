import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useHashScroll } from "../hooks/useHashScroll";
import { itemAt } from "../lib/arrays";
import { helpGroups, helpPage, helpPages, loadHelpPage, type HelpPage } from "../lib/help";
import { renderMarkdown } from "../lib/markdownHtml";

/** Links inside a help page that point into the app open in place, not as a full reload. */
function useInAppLinks() {
  const navigate = useNavigate();
  return (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || link.target || !href.startsWith("/") || href.startsWith("//")) return;
    // The static pages served by the host, not routes of the app.
    if (/^\/(privacy|terms)(?:[#?]|$)/.test(href)) return;
    e.preventDefault();
    void navigate(href);
  };
}

/** The page's h2 sections, for "On this page". */
function sectionsOf(html: string): { id: string; text: string }[] {
  return [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({
    id: m[1],
    text: m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
  }));
}

function matches(page: HelpPage, query: string): boolean {
  const haystack = `${page.title} ${page.description} ${page.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function DocsIndex() {
  const [query, setQuery] = useState("");
  const groups = helpGroups()
    .map((g) => ({ ...g, pages: g.pages.filter((p) => matches(p, query)) }))
    .filter((g) => g.pages.length > 0);

  return (
    <section className="page docs-page">
      <h1>Help</h1>
      <p className="subtitle">
        How each part of the app works, what the numbers mean, and what to do when something goes wrong. Start with{" "}
        <Link to="/docs/getting-started">Getting started</Link> if you're new.
      </p>

      <input
        type="search"
        className="docs-filter"
        placeholder="Find a help page…"
        aria-label="Find a help page"
        value={query}
        onChange={(e) => { setQuery(e.target.value); }}
      />

      {groups.length === 0 && (
        <p className="docs-empty">
          No help page matches “{query}”. Try fewer words, or <Link to={`/search?q=${encodeURIComponent(query)}`}>search everything</Link>.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label} className="docs-group">
          <h2 className="docs-group-label">{group.label}</h2>
          <ul className="docs-cards">
            {group.pages.map((page) => (
              <li key={page.id}>
                <Link to={`/docs/${page.id}`} className="docs-card">
                  <strong>{page.title}</strong>
                  <span>{page.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="docs-footnote">
        Building or editing the app? The developer and content guides are on the{" "}
        <a href="https://github.com/neccrr/medicine/wiki" target="_blank" rel="noopener noreferrer">
          project wiki
        </a>
        .
      </p>
    </section>
  );
}

function DocsPage({ pageId }: { pageId: string }) {
  const page = helpPage(pageId);
  const onClick = useInAppLinks();
  const [loaded, setLoaded] = useState<{ id: string; markdown?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!helpPage(pageId)) return;
    let cancelled = false;
    loadHelpPage(pageId).then(
      (markdown) => {
        if (!cancelled) setLoaded({ id: pageId, markdown });
      },
      () => {
        if (!cancelled) setLoaded({ id: pageId, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pageId]);
  const current = loaded?.id === pageId ? loaded : null;
  const markdown = current?.markdown;
  const html = useMemo(() => (markdown ? renderMarkdown(markdown) : ""), [markdown]);
  useHashScroll(html);

  // Each page mounts afresh (keyed by id), so picking one folds the phone contents away.
  const [tocOpen, setTocOpen] = useState(false);

  if (!page) {
    return (
      <section className="page">
        <p>There's no help page called “{pageId}”.</p>
        <Link to="/docs">All help pages</Link>
      </section>
    );
  }

  const index = helpPages.indexOf(page);
  const prev = itemAt(helpPages, index - 1);
  const next = itemAt(helpPages, index + 1);
  const sections = sectionsOf(html);

  return (
    <section className="page ebook-page docs-page">
      <Link to="/docs" className="back-link">
        ← All help
      </Link>
      <div className="ebook-layout docs-layout">
        <nav className={tocOpen ? "ebook-toc ebook-toc-collapsible is-open" : "ebook-toc ebook-toc-collapsible"} aria-label="Help pages">
          <button type="button" className="ebook-toc-toggle" onClick={() => { setTocOpen((o) => !o); }} aria-expanded={tocOpen}>
            <span>{page.title}</span>
            <span className="ebook-toc-toggle-hint">
              All help <span aria-hidden="true">{tocOpen ? "▴" : "▾"}</span>
            </span>
          </button>
          <h2 className="ebook-toc-title">Help</h2>
          {helpGroups().map((group) => (
            <div key={group.label} className="docs-toc-group">
              <p className="ebook-toc-subhead">{group.label}</p>
              <ol>
                {group.pages.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/docs/${p.id}`}
                      className={p.id === page.id ? "ebook-toc-link active" : "ebook-toc-link"}
                      aria-current={p.id === page.id ? "page" : undefined}
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        <div className="ebook-content">
          {html ? (
            <>
              {sections.length > 2 && (
                <nav className="docs-onpage" aria-label="On this page">
                  <p className="ebook-toc-subhead">On this page</p>
                  <ul>
                    {sections.map((s) => (
                      <li key={s.id}>
                        <a href={`#${s.id}`}>{s.text}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              {/* Only link clicks are intercepted; keyboard activation of a link fires click too. */}
              <article className="summary-content docs-content" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
              <div className="ebook-nav">
                {prev ? (
                  <Link to={`/docs/${prev.id}`} className="btn btn-secondary">
                    ← {prev.title}
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link to={`/docs/${next.id}`} className="btn">
                    {next.title} →
                  </Link>
                ) : (
                  <Link to="/docs" className="btn btn-secondary">
                    All help
                  </Link>
                )}
              </div>
            </>
          ) : current?.failed ? (
            <p className="ebook-status">Couldn't load this page. Check your connection and try again.</p>
          ) : (
            <p className="ebook-status" role="status">
              Loading…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function Docs() {
  const { pageId } = useParams();
  return pageId ? <DocsPage key={pageId} pageId={pageId} /> : <DocsIndex />;
}
