import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GraphCanvas, type GraphCanvasHandle, type NodeStyle } from "../components/map/GraphCanvas";
import { Graph3D } from "../components/map/Graph3D";
import { GraphControls, type FilterState } from "../components/map/GraphControls";
import {
  ChevronIcon,
  CloseIcon,
  CollapseIcon,
  DiceIcon,
  FileIcon,
  FitIcon,
  FolderIcon,
  GraphIcon,
  HashIcon,
  LinkIcon,
  LocalGraphIcon,
  MinusIcon,
  PlusIcon,
  PulseIcon,
  SearchIcon,
  ShrinkIcon,
  ExpandIcon,
  TagIcon,
} from "../components/map/ObsIcons";
import { AlfondIcon } from "../components/icons";
import { useAccount } from "../hooks/useAccount";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { askAlfondAbout } from "../lib/alfond";
import { ebookMeta, flashcardDecks, quizBanks } from "../lib/content";
import { sanitizeSettings, type GraphSettings } from "../lib/knowledgeGraph/graphSettings";
import { nodeMastery, readStudyState } from "../lib/knowledgeGraph/mastery";
import { decodeGraph } from "../lib/knowledgeGraph/wire";
import { GRAPH_URL, type GraphNode, type KnowledgeGraph, type SectionRef } from "../lib/knowledgeGraph/types";
import { allSubjects } from "../lib/routeMeta";
import { STORAGE_KEYS } from "../lib/storage";
import { STORAGE_UPDATED_EVENT } from "../lib/storage";

// The knowledge map as an Obsidian-style vault: a ribbon of tools, a concept explorer (blocks
// and subjects as folders), the graph view, and the open concept as a note with its
// properties, links and "linked mentions" (the sections that teach it).

/** The map's subject colors, in fixed order (validated palette slots, see map.css). */
const SLOTS = 6;

const subjectName = (key: string) => key.split("/")[1] ?? key;
const blockOf = (key: string) => key.split("/")[0] ?? "";
const tagOf = (text: string) => `#${text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "")}`;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** From the background toward the accent as mastery grows (sequential, one hue). */
function masteryColor(m: number, accent: string, background: string): string {
  const a = hexToRgb(accent);
  const s = hexToRgb(background);
  if (!a || !s) return accent;
  // In 20 steps, so the 3D effect's sphere sprites are drawn once per step, not per concept.
  const t = 0.3 + 0.7 * Math.round(m * 20) / 20;
  const c = a.map((v, i) => {
    const from = s.at(i) ?? v;
    return Math.round(from + (v - from) * t);
  });
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** Repaints when the theme changes (the toggle or the system setting). */
function useThemeKey(): string {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => { setKey((k) => k + 1); };
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);
  return String(key);
}

export function KnowledgeMap() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(GRAPH_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: unknown) => {
        if (live) setGraph(decodeGraph(data));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="page map-page">
      <h1>Knowledge map</h1>
      <p className="subtitle">
        Every concept in your subjects as one graph, linked where they're taught together. Open one to see its links and where to study it.
      </p>
      {graph ? <Workspace graph={graph} /> : <p className="map-loading">{failed ? "The map couldn't be loaded. Check your connection and reload." : "Loading the map…"}</p>}
    </section>
  );
}

function Workspace({ graph }: { graph: KnowledgeGraph }) {
  const { config } = useAccount();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canvas = useRef<GraphCanvasHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Full screen: the browser's own where it has one for an element, else (iPhone) the
  // workspace covering the page.
  const [nativeFull, setNativeFull] = useState(false);
  const [pageFull, setPageFull] = useState(false);
  const fullScreen = nativeFull || pageFull;
  useEffect(() => {
    const onChange = () => { setNativeFull(document.fullscreenElement !== null && document.fullscreenElement === frame.current); };
    document.addEventListener("fullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); };
  }, []);
  useEffect(() => {
    if (!pageFull) return;
    document.documentElement.classList.add("map-page-full");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPageFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("map-page-full");
      window.removeEventListener("keydown", onKey);
    };
  }, [pageFull]);
  const toggleFullScreen = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (pageFull) {
      setPageFull(false);
      return;
    }
    if (typeof el.requestFullscreen === "function" && document.fullscreenEnabled) {
      el.requestFullscreen().catch(() => { setPageFull(true); });
    } else setPageFull(true);
  }, [pageFull]);
  const themeKey = useThemeKey();
  const subjects = useMemo(() => allSubjects(), []);
  const subjectLabel = (key: string) => subjects.find((s) => s.key === key)?.label ?? subjectName(key);

  const names = useMemo(() => [...new Set(graph.nodes.flatMap((n) => n.subjects.map(subjectName)))].sort(), [graph]);
  const blocks = useMemo(() => [...new Set(graph.nodes.flatMap((n) => n.subjects.map(blockOf)))].sort(), [graph]);
  const allKeys = useMemo(() => [...new Set(graph.nodes.flatMap((n) => n.subjects))].sort(), [graph]);
  const nameLabel = (name: string) => subjects.find((s) => s.id === name)?.label ?? name;

  const [storedSettings, setStoredSettings] = useLocalStorage<unknown>(STORAGE_KEYS.mapSettings, null);
  const settings = useMemo(() => sanitizeSettings(storedSettings), [storedSettings]);
  const setSettings = (next: GraphSettings) => { setStoredSettings(next); };
  const patchSettings = (patch: Partial<GraphSettings>) => { setStoredSettings({ ...settings, ...patch }); };
  const [filters, setFilters] = useState<FilterState>({ text: "", block: null, subject: null });
  const [localGraph, setLocalGraph] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(() => window.matchMedia("(min-width: 1800px)").matches);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);

  // The open concept lives in the address (?c=…), so it can be shared and Back works.
  const selected = useMemo(() => {
    const id = params.get("c");
    const i = id ? graph.nodes.findIndex((n) => n.id === id) : -1;
    return i >= 0 ? i : null;
  }, [params, graph]);
  const selectedNode = selected === null ? undefined : graph.nodes.at(selected);
  const select = (i: number | null) => {
    const next = new URLSearchParams(params);
    const id = i === null ? undefined : graph.nodes.at(i)?.id;
    if (id) next.set("c", id);
    else next.delete("c");
    setParams(next, { replace: i !== null && selected !== null });
    if (i === null) setLocalGraph(false);
  };

  useEffect(() => {
    const bump = () => { setVersion((v) => v + 1); };
    window.addEventListener(STORAGE_UPDATED_EVENT, bump);
    return () => { window.removeEventListener(STORAGE_UPDATED_EVENT, bump); };
  }, []);
  const mastery = useMemo(() => {
    const state = readStudyState(allKeys);
    return graph.nodes.map((n) => nodeMastery(n, state));
    // version: re-read after a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, allKeys, version]);

  const neighbours = useMemo(() => {
    const out: Map<number, { i: number; w: number; rel?: string }[]> = new Map();
    for (const e of graph.edges) {
      const sourceEdges = out.get(e.s) ?? [];
      sourceEdges.push({ i: e.t, w: e.w, rel: e.rel });
      out.set(e.s, sourceEdges);
      const targetEdges = out.get(e.t) ?? [];
      targetEdges.push({ i: e.s, w: e.w, rel: e.rel });
      out.set(e.t, targetEdges);
    }
    for (const list of out.values()) list.sort((a, b) => b.w - a.w);
    return out;
  }, [graph]);

  const shared = useMemo(() => graph.nodes.map((n) => new Set(n.subjects.map(subjectName)).size > 1 || new Set(n.subjects.map(blockOf)).size > 1), [graph]);
  const orphanCount = useMemo(() => graph.nodes.filter((_, i) => !neighbours.has(i)).length, [graph, neighbours]);

  const visible = useMemo(() => {
    // A local graph is the open concept and its neighbours, whatever the filters say.
    if (localGraph && selected !== null) {
      const near = new Set([selected, ...(neighbours.get(selected) ?? []).map((n) => n.i)]);
      return graph.nodes.map((_, i) => near.has(i));
    }
    const text = filters.text.trim().toLowerCase();
    return graph.nodes.map((n, i) => {
      if (i === selected) return true;
      if (filters.block && !n.subjects.some((s) => blockOf(s) === filters.block)) return false;
      if (filters.subject && !n.subjects.some((s) => subjectName(s) === filters.subject)) return false;
      if (settings.bridgesOnly && !shared.at(i)) return false;
      if (!settings.orphans && !neighbours.has(i)) return false;
      if (text && !n.label.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [graph, filters, settings.bridgesOnly, settings.orphans, shared, neighbours, selected, localGraph]);

  // One style per concept, worked out when the colors change rather than every frame.
  const styles = useMemo<NodeStyle[]>(() => {
    const el = frame.current ?? document.documentElement;
    const style = getComputedStyle(el);
    const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const colors = Array.from({ length: SLOTS }, (_, i) => v(`--map-${i + 1}`, "#888888"));
    const accent = v("--obs-accent", "#a68af9");
    const background = v("--obs-bg", "#1e1e1e");
    const unstudied = v("--map-unstudied", "#999999");
    const plain = v("--obs-graph-node", "#9a9a9a");
    return graph.nodes.map((node, i): NodeStyle => {
      if (settings.colorBy === "mastery") {
        const m = mastery.at(i) ?? null;
        return { fill: m === null ? unstudied : masteryColor(m, accent, background), weak: m !== null && m < 0.5 };
      }
      if (settings.colorBy === "none") return { fill: plain };
      const slot = names.indexOf(subjectName(node.subjects[0] ?? ""));
      return { fill: colors.at(Math.max(0, slot) % SLOTS) ?? plain };
    });
    // themeKey: re-read the colors when the theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, settings.colorBy, mastery, names, themeKey]);

  const openNode = (i: number) => {
    select(i);
    canvas.current?.focusNode(i);
    // Over the graph (narrow screens), the explorer gets out of the way once a concept is picked.
    if (frame.current && frame.current.clientWidth < 1080) setExplorerOpen(false);
  };

  const openRandom = () => {
    const pool = graph.nodes.map((_, i) => i).filter((i) => visible.at(i) && i !== selected);
    const pick = pool.at(Math.floor(Math.random() * pool.length));
    if (pick !== undefined) openNode(pick);
  };

  const findConcept = () => {
    setExplorerOpen(true);
    requestAnimationFrame(() => search.current?.focus());
  };

  // "/" finds a concept, as in the Class Drive; not while typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(input|textarea|select)$/i.test(e.target.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        findConcept();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  // Opening a shared link (?c=…) centres the graph on that concept.
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || selected === null) return;
    centred.current = true;
    const t = setTimeout(() => canvas.current?.focusNode(selected), 60);
    return () => { clearTimeout(t); };
  }, [selected]);

  // A local graph re-fits to the concept's neighbourhood (again once it has settled); leaving
  // it shows the whole map.
  const wasLocal = useRef(false);
  useEffect(() => {
    if (wasLocal.current === localGraph) return;
    wasLocal.current = localGraph;
    const early = setTimeout(() => canvas.current?.fit(), 350);
    const settled = setTimeout(() => canvas.current?.fit(), 1600);
    return () => {
      clearTimeout(early);
      clearTimeout(settled);
    };
  }, [localGraph]);

  const visibleCount = visible.filter(Boolean).length;
  const linkCount = graph.edges.filter((e) => visible[e.s] && visible[e.t]).length;
  const bridges = useMemo(
    () =>
      graph.nodes
        .map((n, i) => ({ n, i }))
        .filter(({ i }) => shared.at(i))
        .sort((a, b) => b.n.subjects.length - a.n.subjects.length || b.n.mentions - a.n.mentions)
        .slice(0, 8),
    [graph, shared],
  );
  const subjectSlots = names.map((name, i) => ({ id: name, label: nameLabel(name), slot: (i % SLOTS) + 1 }));

  return (
    <div className={pageFull ? "obs-frame is-page-full" : "obs-frame"} ref={frame}>
      <div className={explorerOpen ? "obs explorer-open" : "obs"}>
        <nav className="obs-ribbon" aria-label="Map tools">
          <button type="button" className={explorerOpen ? "obs-ribbon-btn is-on" : "obs-ribbon-btn"} aria-pressed={explorerOpen} onClick={() => { setExplorerOpen((o) => !o); }} title="Concepts" aria-label="Show the concept list">
            <FolderIcon />
          </button>
          <button type="button" className="obs-ribbon-btn" onClick={findConcept} title="Find a concept (/)" aria-label="Find a concept">
            <SearchIcon />
          </button>
          <button type="button" className="obs-ribbon-btn" onClick={() => { setLocalGraph(false); canvas.current?.fit(); }} title="Whole graph" aria-label="Show the whole graph">
            <GraphIcon />
          </button>
          <button
            type="button"
            className={localGraph ? "obs-ribbon-btn is-on" : "obs-ribbon-btn"}
            aria-pressed={localGraph}
            disabled={selected === null}
            onClick={() => { setLocalGraph((l) => !l); }}
            title="Local graph of the open concept"
            aria-label="Local graph of the open concept"
          >
            <LocalGraphIcon />
          </button>
          <button type="button" className="obs-ribbon-btn" onClick={openRandom} title="Open a random concept" aria-label="Open a random concept">
            <DiceIcon />
          </button>
        </nav>

        {explorerOpen && (
          <Explorer
            graph={graph}
            blocks={blocks}
            subjectLabel={subjectLabel}
            selected={selected}
            query={query}
            onQuery={setQuery}
            onOpen={openNode}
            onClose={() => { setExplorerOpen(false); }}
            searchRef={search}
          />
        )}

        <div className="obs-graph-pane">
          <div className="obs-tabbar">
            <span className="obs-tab is-active">
              {localGraph ? <LocalGraphIcon /> : <GraphIcon />}
              <span className="obs-tab-title">{localGraph && selectedNode ? `Local graph of ${selectedNode.label}` : "Graph view"}</span>
            </span>
            <div className="obs-view-switch" role="radiogroup" aria-label="Graph view">
              {(["2d", "3d"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={settings.view === v} className={settings.view === v ? "is-on" : undefined} onClick={() => { patchSettings({ view: v }); }}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={fullScreen ? "obs-icon-btn obs-full-btn is-on" : "obs-icon-btn obs-full-btn"}
              aria-pressed={fullScreen}
              onClick={toggleFullScreen}
              title={fullScreen ? "Exit full screen (Esc)" : "Full screen"}
              aria-label={fullScreen ? "Exit full screen" : "Show the map full screen"}
            >
              {fullScreen ? <ShrinkIcon /> : <ExpandIcon />}
            </button>
          </div>
          <div className="obs-graph">
            {settings.view === "3d" ? (
              <Graph3D
                ref={canvas}
                graph={graph}
                visible={visible}
                styles={styles}
                selected={selected}
                settings={settings}
                onSelect={(i) => {
                  if (i !== null) select(i);
                }}
                onSettings={patchSettings}
                paintKey={`${themeKey}|${settings.colorBy}|${version}`}
              />
            ) : (
              <GraphCanvas
                ref={canvas}
                graph={graph}
                visible={visible}
                styles={styles}
                selected={selected}
                settings={settings}
                onSelect={(i) => {
                  if (i !== null) select(i);
                }}
                paintKey={`${themeKey}|${settings.colorBy}|${version}`}
              />
            )}
            <GraphControls
              settings={settings}
              onSettings={setSettings}
              filters={filters}
              onFilters={setFilters}
              blocks={blocks}
              subjects={subjectSlots}
              orphanCount={orphanCount}
            />
            <div className="obs-zoom">
              <button type="button" className="obs-icon-btn" onClick={() => canvas.current?.zoom(1.4)} aria-label="Zoom in" title="Zoom in">
                <PlusIcon />
              </button>
              <button type="button" className="obs-icon-btn" onClick={() => canvas.current?.zoom(1 / 1.4)} aria-label="Zoom out" title="Zoom out">
                <MinusIcon />
              </button>
              <button type="button" className="obs-icon-btn" onClick={() => canvas.current?.fit()} aria-label="Fit the graph" title="Fit">
                <FitIcon />
              </button>
            </div>
            {settings.colorBy !== "none" && (
              <div className="obs-legend" aria-label="Legend">
                {settings.colorBy === "subject" ? (
                  subjectSlots.map((s) => (
                    <span key={s.id}>
                      <span className="obs-dot" style={{ background: `var(--map-${s.slot})` }} aria-hidden="true" />
                      {s.label}
                    </span>
                  ))
                ) : (
                  <>
                    <span>
                      <span className="obs-ramp" aria-hidden="true" />
                      Weaker → stronger
                    </span>
                    <span>
                      <span className="obs-dot obs-dot-weak" aria-hidden="true" />
                      Needs work
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="obs-note-pane" aria-live="polite">
          <div className="obs-tabbar">
            <span className="obs-tab is-active">
              <FileIcon />
              <span className="obs-tab-title">{selectedNode ? selectedNode.label : "New tab"}</span>
              {selectedNode && (
                <button type="button" className="obs-tab-close" onClick={() => { select(null); }} aria-label="Close this concept" title="Close">
                  <CloseIcon />
                </button>
              )}
            </span>
          </div>
          {selected !== null && selectedNode ? (
            <Note
              node={selectedNode}
              mastery={mastery.at(selected) ?? null}
              links={neighbours.get(selected) ?? []}
              shared={shared.at(selected) ?? false}
              graph={graph}
              subjectLabel={subjectLabel}
              localGraph={localGraph}
              onLocalGraph={() => { setLocalGraph((l) => !l); }}
              onOpen={openNode}
              aiOn={config?.ai === true}
              onAsk={(q) => { askAlfondAbout(q, () => navigate("/alfond")); }}
            />
          ) : (
            <div className="obs-empty">
              <p className="obs-empty-title">No concept is open</p>
              <button type="button" className="obs-empty-action" onClick={findConcept}>
                Find a concept <kbd>/</kbd>
              </button>
              <button type="button" className="obs-empty-action" onClick={openRandom}>
                Open a random concept
              </button>
              <p className="obs-empty-hint">Or click any dot in the graph. Drag a dot to move it; the others follow.</p>
              <h3 className="obs-empty-head">Concepts that connect subjects</h3>
              <ul className="obs-bridges">
                {bridges.map(({ n, i }) => (
                  <li key={i}>
                    <button type="button" className="obs-internal-link" onClick={() => { openNode(i); }}>
                      {n.label}
                    </button>
                    <small>{[...new Set(n.subjects.map((s) => subjectLabel(s)))].join(" · ")}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <footer className="obs-status">
          {selectedNode && selected !== null && (
            <span>
              {neighbours.get(selected)?.length ?? 0} links · {selectedNode.sections.length} mentions
            </span>
          )}
          <span>
            {visibleCount} concepts · {linkCount} links
          </span>
        </footer>
      </div>
    </div>
  );
}

function Explorer({
  graph,
  blocks,
  subjectLabel,
  selected,
  query,
  onQuery,
  onOpen,
  onClose,
  searchRef,
}: {
  graph: KnowledgeGraph;
  blocks: string[];
  subjectLabel: (key: string) => string;
  selected: number | null;
  query: string;
  onQuery: (q: string) => void;
  onOpen: (i: number) => void;
  onClose: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  // Folders: blocks, then the subjects a concept is mostly taught in.
  const tree = useMemo(
    () =>
      blocks.map((block) => {
        const keys = [...new Set(graph.nodes.map((n) => n.subjects[0] ?? "").filter((k) => blockOf(k) === block))].sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b)));
        return {
          block,
          subjects: keys.map((key) => ({
            key,
            concepts: graph.nodes
              .map((n, i) => ({ n, i }))
              .filter(({ n }) => n.subjects[0] === key)
              .sort((a, b) => a.n.label.localeCompare(b.n.label)),
          })),
        };
      }),
    // subjectLabel only reads a fixed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, blocks],
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // The open concept's folders open with it.
  const [shownFor, setShownFor] = useState<number | null>(null);
  if (selected !== shownFor) {
    setShownFor(selected);
    const key = selected === null ? undefined : graph.nodes.at(selected)?.subjects[0];
    if (key && !(open.has(blockOf(key)) && open.has(key))) setOpen(new Set([...open, blockOf(key), key]));
  }

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return [];
    return graph.nodes
      .map((n, i) => ({ n, i, at: n.label.toLowerCase().indexOf(q) }))
      .filter((r) => r.at >= 0)
      .sort((a, b) => a.at - b.at || b.n.mentions - a.n.mentions)
      .slice(0, 60);
  }, [q, graph]);

  const conceptButton = (n: GraphNode, i: number, detail?: string) => (
    <button type="button" className={i === selected ? "obs-file is-active" : "obs-file"} aria-current={i === selected ? "true" : undefined} onClick={() => { onOpen(i); }}>
      <span className="obs-file-name">{n.label}</span>
      {detail && <small>{detail}</small>}
    </button>
  );

  return (
    <aside className="obs-explorer" aria-label="Concepts">
      <div className="obs-explorer-head">
        <span>Concepts</span>
        <button type="button" className="obs-icon-btn" onClick={() => { setOpen(new Set()); }} aria-label="Collapse all folders" title="Collapse all">
          <CollapseIcon />
        </button>
        <button type="button" className="obs-icon-btn obs-explorer-close" onClick={onClose} aria-label="Close the concept list" title="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="obs-explorer-search">
        <SearchIcon />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search concepts…"
          aria-label="Search concepts"
          value={query}
          onChange={(e) => { onQuery(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) onOpen(results[0].i);
            if (e.key === "Escape") onQuery("");
          }}
        />
      </div>
      <div className="obs-explorer-body">
        {q.length >= 2 ? (
          results.length ? (
            <ul className="obs-tree" aria-label="Matching concepts">
              {results.map(({ n, i }) => (
                <li key={i}>{conceptButton(n, i, [...new Set(n.subjects.map((s) => subjectLabel(s)))].join(", "))}</li>
              ))}
            </ul>
          ) : (
            <p className="obs-explorer-empty">No concept matches “{query.trim()}”.</p>
          )
        ) : (
          <ul className="obs-tree">
            {tree.map(({ block, subjects }) => (
              <li key={block}>
                <button type="button" className="obs-folder" aria-expanded={open.has(block)} onClick={() => { toggle(block); }}>
                  <ChevronIcon />
                  Block {block}
                </button>
                {open.has(block) && (
                  <ul className="obs-tree">
                    {subjects.map(({ key, concepts }) => (
                      <li key={key}>
                        <button type="button" className="obs-folder" aria-expanded={open.has(key)} onClick={() => { toggle(key); }}>
                          <ChevronIcon />
                          {subjectLabel(key)}
                          <small>{concepts.length}</small>
                        </button>
                        {open.has(key) && (
                          <ul className="obs-tree">
                            {concepts.map(({ n, i }) => (
                              <li key={i}>{conceptButton(n, i)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Note({
  node,
  mastery,
  links,
  shared,
  graph,
  subjectLabel,
  localGraph,
  onLocalGraph,
  onOpen,
  aiOn,
  onAsk,
}: {
  node: GraphNode;
  mastery: number | null;
  links: { i: number; w: number; rel?: string }[];
  shared: boolean;
  graph: KnowledgeGraph;
  subjectLabel: (key: string) => string;
  localGraph: boolean;
  onLocalGraph: () => void;
  onOpen: (i: number) => void;
  aiOn: boolean;
  onAsk: (question: string) => void;
}) {
  const [mentionsOpen, setMentionsOpen] = useState(true);
  const sectionLink = (s: SectionRef) => (s.c.startsWith("summary:") ? `/summaries/${s.c.slice(8)}#${s.a}` : `/ebooks/${s.c}#${s.a}`);
  const fileTitle = (c: string) => {
    if (c.startsWith("summary:")) return `${subjectLabel(c.slice(8))} summary`;
    const [b, s, ch] = c.split("/");
    return ebookMeta.get(`${b}/${s}`)?.chapters.find((x) => x.id === ch)?.title ?? ch;
  };
  const fileWhere = (c: string) => {
    const key = c.startsWith("summary:") ? c.slice(8) : c.split("/").slice(0, 2).join("/");
    return `${subjectLabel(key)} · Block ${blockOf(key)}`;
  };
  const withBlock = (key: string) => `${subjectLabel(key)} ${blockOf(key)}`;

  // Linked mentions, grouped by the chapter or summary they're in, like Obsidian's backlinks.
  const files = useMemo(() => {
    const byFile = new Map<string, SectionRef[]>();
    for (const s of node.sections) {
      const list = byFile.get(s.c) ?? [];
      if (!list.some((x) => x.a === s.a)) list.push(s);
      byFile.set(s.c, list);
    }
    return [...byFile];
  }, [node]);
  const mentionCount = files.reduce((n, [, list]) => n + list.length, 0);

  const subjectsOf = [...new Set(node.subjects)];
  const cardEntries = Object.entries(node.cards);
  const questionEntries = Object.entries(node.questions);
  const labelEntries = Object.entries(node.labels);
  const neighbourNames = links.slice(0, 6).map((l) => graph.nodes[l.i].label);
  const where = [...new Set(subjectsOf.map((s) => subjectLabel(s)))];
  const first = subjectsOf[0] ?? "";

  return (
    <div className="obs-note">
      <div className="obs-view-header">
        <nav className="obs-breadcrumb" aria-label="Where this concept lives">
          <span>Block {blockOf(first)}</span>
          <span aria-hidden="true">/</span>
          <span>{subjectLabel(first)}</span>
        </nav>
        <div className="obs-view-actions">
          <button type="button" className={localGraph ? "obs-icon-btn is-on" : "obs-icon-btn"} aria-pressed={localGraph} onClick={onLocalGraph} title="Local graph" aria-label="Show only this concept and its links">
            <LocalGraphIcon />
          </button>
        </div>
      </div>

      <article className="obs-note-body">
        <h2 className="obs-inline-title">{node.label}</h2>
        {aiOn && (
          <button
            type="button"
            className="obs-ask"
            onClick={() => { onAsk(`Explain "${node.label}" and how it connects to ${neighbourNames.join(", ")} across my subjects. Keep it short and exam-focused.`); }}
          >
            <span className="obs-ask-icon" aria-hidden="true">
              <AlfondIcon />
            </span>
            <span className="obs-ask-text">
              <strong>Ask Alfond about {node.label}</strong>
              <small>{neighbourNames.length > 0 ? `How it connects to ${neighbourNames.slice(0, 3).join(", ")}` : "Explained short and exam-focused"}</small>
            </span>
            <span className="obs-ask-go" aria-hidden="true">
              →
            </span>
          </button>
        )}
        {node.d && (
          <div className="obs-callout">
            <p className="obs-callout-title">What it is</p>
            <p>{node.d}</p>
            {node.da && (
              <Link to={sectionLink(node.da)} className="obs-callout-more">
                Read more in {fileTitle(node.da.c)} →
              </Link>
            )}
          </div>
        )}

        <div className="obs-properties" aria-label="Properties">
          <div className="obs-prop">
            <span className="obs-prop-key">
              <TagIcon />
              tags
            </span>
            <span className="obs-prop-value">
              {where.map((label) => (
                <span key={label} className="obs-tag">
                  {tagOf(label)}
                </span>
              ))}
              {[...new Set(subjectsOf.map(blockOf))].map((b) => (
                <span key={b} className="obs-tag">
                  {tagOf(`block ${b}`)}
                </span>
              ))}
              {shared && <span className="obs-tag">#bridge</span>}
            </span>
          </div>
          <div className="obs-prop">
            <span className="obs-prop-key">
              <PulseIcon />
              mastery
            </span>
            <span className={mastery !== null && mastery < 0.5 ? "obs-prop-value is-weak" : "obs-prop-value"}>
              {mastery === null ? <span className="obs-faint">Not studied yet</span> : `${Math.round(mastery * 100)}%${mastery < 0.5 ? " · needs work" : ""}`}
            </span>
          </div>
          <div className="obs-prop">
            <span className="obs-prop-key">
              <HashIcon />
              mentions
            </span>
            <span className="obs-prop-value">{node.mentions}</span>
          </div>
          <div className="obs-prop">
            <span className="obs-prop-key">
              <LinkIcon />
              links
            </span>
            <span className="obs-prop-value">{links.length}</span>
          </div>
        </div>

        <p>
          Comes up {node.mentions} time{node.mentions === 1 ? "" : "s"} in {where.join(" and ")}
          {shared ? ", one of the concepts that connects them" : ""}.
        </p>

        {links.length > 0 && (
          <>
            <h3>Links</h3>
            <ul className="obs-links">
              {links.slice(0, 16).map((l) => (
                <li key={l.i}>
                  {l.rel && <span className="obs-rel">{l.rel}</span>}
                  <button type="button" className="obs-internal-link" onClick={() => { onOpen(l.i); }}>
                    {graph.nodes[l.i].label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {(cardEntries.length > 0 || questionEntries.length > 0 || labelEntries.length > 0) && (
          <>
            <h3>Practise</h3>
            <ul className="obs-practice">
              {cardEntries.map(([key, ids]) => (
                <li key={`c${key}`}>
                  <Link className="obs-internal-link" to={`/flashcards/${key}?cards=${ids.join(",")}`}>
                    {ids.length} flashcard{ids.length === 1 ? "" : "s"}
                  </Link>
                  <small>
                    {withBlock(key)} · e.g. “{flashcardDecks.get(key)?.find((c) => c.id === ids[0])?.front.slice(0, 70) ?? ""}”
                  </small>
                </li>
              ))}
              {questionEntries.map(([key, ids]) => (
                <li key={`q${key}`}>
                  <Link className="obs-internal-link" to={`/quizzes/${key}?drill=${ids.join(",")}`}>
                    {ids.length} quiz question{ids.length === 1 ? "" : "s"}
                  </Link>
                  <small>
                    {withBlock(key)} · e.g. “{quizBanks.get(key)?.find((q) => q.id === ids[0])?.question.slice(0, 70) ?? ""}”
                  </small>
                </li>
              ))}
              {labelEntries.map(([key, ids]) => (
                <li key={`l${key}`}>
                  <Link className="obs-internal-link" to={`/occlusion/${key}`}>
                    {ids.length} labelled figure{ids.length === 1 ? "" : "s"}
                  </Link>
                  <small>{withBlock(key)} image occlusion</small>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>

      {files.length > 0 && (
        <section className="obs-backlinks">
          <button type="button" className="obs-backlinks-head" aria-expanded={mentionsOpen} onClick={() => { setMentionsOpen((o) => !o); }}>
            <ChevronIcon />
            Linked mentions
            <span className="obs-count">{mentionCount}</span>
          </button>
          {mentionsOpen && (
            <ul className="obs-backlink-files">
              {files.map(([c, list]) => (
                <li key={c}>
                  <div className="obs-backlink-file">
                    <FileIcon />
                    <span>{fileTitle(c)}</span>
                    <small>{fileWhere(c)}</small>
                  </div>
                  <ul className="obs-backlink-matches">
                    {list.map((s) => (
                      <li key={s.a}>
                        <Link to={sectionLink(s)}>{s.h || fileTitle(c)}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
