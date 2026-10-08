import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { itemAt } from "../lib/arrays";
import { Link, useParams } from "react-router-dom";
import { flashcardSubjects, keyOf, loadOcclusionNotes, subjectKey } from "../lib/content";
import { useSpacedRepetition } from "../hooks/useSpacedRepetition";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { STORAGE_KEYS } from "../lib/storage";
import { GRADES } from "../lib/grades";
import { useI18n } from "../i18n/useI18n";
import { INITIAL_CARD_STATE, reviewCard } from "../lib/sm2";
import {
  REGION_LABELS,
  formatInterval,
  labelStatus,
  occlusionCards,
  stepFigure,
  stepLabel,
  zoomBox,
  type LabelStatus,
  type OcclusionCard,
} from "../lib/occlusion";
import { EmptyState } from "../components/EmptyState";
import { PulseLine } from "../components/PulseLine";
import { subjectHueStyle } from "../lib/subjectStyle";
import type { CardState, CardStateMap, OcclusionNote } from "../types/content";
import { entry, own } from "../lib/records";
import { NextUp } from "../components/plan/Today";
import { SubjectTrail } from "../components/SubjectTrail";

type Mode = "review" | "browse";

interface Prefs {
  mode: Mode;
  regions: string[];
  hideAll: boolean;
  /** Unset until toggled: zoom starts on for phones, off for wider screens. */
  zoom?: boolean;
  /** The label last open, so browsing picks up where it left off. */
  cardId?: string;
}

const DEFAULT_PREFS: Prefs = { mode: "review", regions: [], hideAll: true };
const EMPTY: OcclusionCard[] = [];
const STATUS_TEXT: Record<LabelStatus, string> = { new: "new", due: "due", learning: "learning", mastered: "mastered" };

const narrowScreen = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

interface FigureProps {
  card: OcclusionCard;
  revealed: boolean;
  revealAll: boolean;
  hideAll: boolean;
  zoom: boolean;
  onToggle: () => void;
  onPick: (maskId: string) => void;
  onSwipe: (dir: 1 | -1) => void;
}

/** The figure with its labels covered. Tap the red box to reveal it, another box to ask that one, swipe to move on. */
function OcclusionFigure({ card, revealed, revealAll, hideAll, zoom, onToggle, onPick, onSwipe }: FigureProps) {
  const { note, mask } = card;
  const vb = zoom ? zoomBox(note, mask) : { x: 0, y: 0, w: note.width, h: note.height };
  const pad = Math.max(2, note.width / 400);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
      swiped.current = true;
      onSwipe(dx < 0 ? 1 : -1);
    }
  };
  // A swipe ends in a click too; it must not also reveal or pick a label.
  const clicked = (action: () => void) => () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    action();
  };

  return (
    <div
      className="io-figure-wrap"
      role="button"
      tabIndex={0}
      aria-label={revealed ? `Revealed: ${mask.label}. Click to cover it again.` : "Recall the label under the red box, then click to reveal it"}
      onClick={clicked(onToggle)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          // Handled here, so the page's own Space/Enter shortcut doesn't toggle it straight back.
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      <svg className="io-figure" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={note.title}>
        <rect x={0} y={0} width={note.width} height={note.height} className="io-paper" />
        <image href={note.image} x={0} y={0} width={note.width} height={note.height} />
        {note.masks.map((m) => {
          const target = m.id === mask.id;
          const shown = target ? revealed || revealAll : revealAll;
          const cls = shown
            ? target
              ? "io-mask-revealed"
              : "io-mask-peek"
            : target
              ? "io-mask-target"
              : hideAll
                ? "io-mask"
                : "io-mask-ghost";
          const grow = target && shown ? pad * 2 : pad;
          return (
            <rect
              key={m.id}
              x={m.x - grow}
              y={m.y - grow}
              width={m.w + grow * 2}
              height={m.h + grow * 2}
              rx={grow * 1.5}
              className={cls}
              style={{ strokeWidth: target && shown ? pad * 1.5 : pad }}
              onClick={(e) => {
                e.stopPropagation();
                clicked(target ? onToggle : () => { onPick(m.id); })();
              }}
            />
          );
        })}
        {!revealed && !revealAll && (
          <text x={mask.x + mask.w / 2} y={mask.y + mask.h / 2} className="io-mask-q" style={{ fontSize: Math.min(mask.h * 0.9, 40) }} textAnchor="middle" dominantBaseline="central">
            ?
          </text>
        )}
      </svg>
    </div>
  );
}

interface FigureSummary {
  note: OcclusionNote;
  index: number;
  total: number;
  due: number;
  mastered: number;
  fresh: number;
}

function summarize(cards: readonly OcclusionCard[], stateMap: CardStateMap): FigureSummary[] {
  const now = new Date();
  const byNote = new Map<number, FigureSummary>();
  for (const c of cards) {
    let s = byNote.get(c.noteIndex);
    if (!s) byNote.set(c.noteIndex, (s = { note: c.note, index: c.noteIndex, total: 0, due: 0, mastered: 0, fresh: 0 }));
    const status = labelStatus(own(stateMap, c.id), now);
    s.total += 1;
    if (status === "new") s.fresh += 1;
    if (status === "new" || status === "due") s.due += 1;
    if (status === "mastered") s.mastered += 1;
  }
  return [...byNote.values()];
}

/** Every figure as a thumbnail with its progress; picking one opens it. */
function FigureGallery({ figures, currentIndex, onOpen, onClose }: { figures: FigureSummary[]; currentIndex: number; onOpen: (index: number) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const current = document.querySelector(".io-gallery-item.is-current");
    current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div className="io-gallery" role="dialog" aria-modal="true" aria-label="All figures" onClick={onClose}>
      <div className="io-gallery-panel" onClick={(e) => { e.stopPropagation(); }}>
        <div className="io-gallery-head">
          <h2>All figures ({figures.length})</h2>
          <button ref={closeRef} type="button" className="io-toggle" onClick={onClose}>
            Close <span className="key-hint">Esc</span>
          </button>
        </div>
        <div className="io-gallery-grid">
          {figures.map((f) => (
            <button key={f.note.id} type="button" className={`io-gallery-item${f.index === currentIndex ? " is-current" : ""}`} onClick={() => { onOpen(f.index); }}>
              <img src={f.note.image} alt="" loading="lazy" decoding="async" width={f.note.width} height={f.note.height} />
              <span className="io-gallery-title">{f.note.title}</span>
              <span className="io-gallery-meta">
                {own(REGION_LABELS, f.note.region) ?? f.note.region} · {f.total} labels{f.due > 0 ? ` · ${f.due} due` : ""}
              </span>
              <span className="io-meter" aria-label={`${f.mastered} of ${f.total} mastered`}>
                <span style={{ width: `${(f.mastered / f.total) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OcclusionStudy() {
  const { t } = useI18n();
  const { blockId = "", subjectId = "" } = useParams();
  const key = subjectKey(blockId, subjectId);
  const subjectLabel = flashcardSubjects.find((s) => keyOf(s) === key)?.label ?? subjectId;

  const [notes, setNotes] = useState<OcclusionNote[] | null | undefined>(null);
  useEffect(() => {
    let live = true;
    void loadOcclusionNotes(key).then((n) => {
      if (live) setNotes(n);
    });
    return () => {
      live = false;
    };
  }, [key]);

  const [storedPrefs, setPrefs] = useLocalStorage<Prefs>(STORAGE_KEYS.occlusionPrefs(key), DEFAULT_PREFS);
  const prefs: Prefs = { ...DEFAULT_PREFS, ...storedPrefs };
  const { mode, regions, hideAll } = prefs;
  const zoom = prefs.zoom ?? narrowScreen();
  const updatePrefs = (patch: Partial<Prefs>) => { setPrefs((p) => ({ ...DEFAULT_PREFS, ...p, ...patch })); };

  const deck = useMemo(() => (notes ? occlusionCards(notes) : EMPTY), [notes]);
  const filtered = useMemo(() => (regions.length === 0 ? deck : deck.filter((c) => regions.includes(c.note.region))), [deck, regions]);
  const allRegions = useMemo(() => Array.from(new Set(deck.map((c) => c.note.region))), [deck]);
  const { stateMap, dueCards, grade, restore, stats } = useSpacedRepetition(key, filtered, STORAGE_KEYS.occlusionState(key));
  const due = dueCards as OcclusionCard[];
  const queue = mode === "review" ? due : filtered;
  const byId = useMemo(() => new Map(filtered.map((c) => [c.id, c])), [filtered]);
  const figures = useMemo(() => summarize(filtered, stateMap), [filtered, stateMap]);

  const [currentId, setCurrentId] = useState<string | undefined>();
  const [revealed, setRevealed] = useState(false);
  const [revealAll, setRevealAll] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [session, setSession] = useState({ reviewed: 0, lapses: 0 });
  const [lastGrade, setLastGrade] = useState<{ cardId: string; prev: CardState | undefined; quality: number } | null>(null);

  // The open label: the one picked, else (browsing) where the student left off, else the queue's first.
  const card =
    (currentId ? byId.get(currentId) : undefined) ??
    (mode === "browse" && prefs.cardId ? byId.get(prefs.cardId) : undefined) ??
    queue.at(0);

  const go = (target: OcclusionCard | undefined) => {
    setCurrentId(target?.id);
    setRevealed(false);
    if (target && target.id !== prefs.cardId) updatePrefs({ cardId: target.id });
  };

  // Fetch the next figure while this one is being studied.
  const nextFigure = card ? stepFigure(queue, card, 1) : undefined;
  useEffect(() => {
    if (nextFigure && nextFigure.note.image !== card?.note.image) new Image().src = nextFigure.note.image;
  }, [nextFigure, card?.note.image]);

  const setMode = (m: Mode) => {
    if (m === mode) return;
    // Stay on this figure when it has labels to review; otherwise start at the first due one.
    const target = card && m === "review" ? (due.find((c) => c.order >= card.order) ?? due[0]) : card;
    updatePrefs({ mode: m, cardId: target?.id ?? prefs.cardId });
    setCurrentId(target?.id);
    setRevealed(false);
    setRevealAll(false);
  };

  const toggleRegion = (r: string) => {
    updatePrefs({ regions: regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r] });
    setCurrentId(undefined);
    setRevealed(false);
  };

  const handleGrade = (quality: number) => {
    if (!card) return;
    // In review a graded label leaves the queue, so the next one is found without it.
    const rest = mode === "review" ? queue.filter((c) => c.id !== card.id) : queue;
    const next = stepLabel(rest, card, 1);
    setLastGrade({ cardId: card.id, prev: own(stateMap, card.id), quality });
    grade(card.id, quality);
    setSession((s) => ({ reviewed: s.reviewed + 1, lapses: s.lapses + (quality < 3 ? 1 : 0) }));
    go(next);
  };

  const undo = () => {
    if (!lastGrade) return;
    restore(lastGrade.cardId, lastGrade.prev);
    setSession((s) => ({ reviewed: Math.max(0, s.reviewed - 1), lapses: Math.max(0, s.lapses - (lastGrade.quality < 3 ? 1 : 0)) }));
    setCurrentId(lastGrade.cardId);
    setRevealed(true);
    setLastGrade(null);
  };

  const openFigure = (noteIndex: number) => {
    setGalleryOpen(false);
    go(queue.find((c) => c.noteIndex === noteIndex) ?? filtered.find((c) => c.noteIndex === noteIndex));
  };

  const pickMask = (maskId: string) => {
    if (card) go(byId.get(`${card.note.id}:${maskId}`));
  };
  const step = (dir: 1 | -1) => {
    if (card) go(stepLabel(queue, card, dir));
  };
  const stepFig = (dir: 1 | -1) => {
    if (card) go(stepFigure(queue.length > 0 ? queue : filtered, card, dir));
  };

  // One listener for the page's lifetime, always calling the latest handler.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKey.current = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        if (lastGrade) {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (galleryOpen) {
        if (e.key === "Escape") setGalleryOpen(false);
        return;
      }
      if (e.key === "g") { setGalleryOpen(true); return; }
      if (!card) return;
      // Space always reveals, even with a chip or arrow button focused; Enter is left to buttons.
      const onButton = e.target instanceof HTMLButtonElement;
      if (e.code === "Space" || (e.key === "Enter" && !onButton)) {
        e.preventDefault();
        setRevealed((r) => !r);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        if (e.shiftKey) stepFig(dir);
        else step(dir);
        return;
      }
      if (e.key === "]" || e.key === "[") { stepFig(e.key === "]" ? 1 : -1); return; }
      if (revealed) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) {
          e.preventDefault();
          handleGrade(g.quality);
          return;
        }
      }
      if (e.key === "z") updatePrefs({ zoom: !zoom });
      if (e.key === "h") updatePrefs({ hideAll: !hideAll });
      if (e.key === "a") setRevealAll((v) => !v);
      if (e.key === "u" && lastGrade) undo();
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { onKey.current(e); };
    window.addEventListener("keydown", listener);
    return () => { window.removeEventListener("keydown", listener); };
  }, []);

  if (notes === undefined) {
    return (
      <section className="page">
        <p>This subject has no image-occlusion figures.</p>
        <Link to="/occlusion">Back to image occlusion</Link>
      </section>
    );
  }

  const figureIndex = card ? figures.findIndex((f) => f.index === card.noteIndex) : -1;
  const figure = itemAt(figures, figureIndex);
  const now = new Date();
  const intervalFor = (quality: number) => (card ? formatInterval(reviewCard(own(stateMap, card.id) ?? INITIAL_CARD_STATE, quality).interval) : "");

  return (
    <section className="page subject-tinted io-page" style={subjectHueStyle(subjectId) as CSSProperties}>
      <SubjectTrail blockId={blockId} subjectId={subjectId} current="occlusion" />
      <h1>{subjectLabel}</h1>
      <p className="subtitle">
        {notes === null
          ? "Loading figures…"
          : `${stats.due} due · ${stats.mastered}/${stats.total} mastered · ${figures.length} figure${figures.length === 1 ? "" : "s"}`}
      </p>

      <div className="io-bar">
        <div className="io-modes" role="tablist" aria-label="Study mode">
          <button type="button" role="tab" aria-selected={mode === "review"} className={mode === "review" ? "is-on" : ""} onClick={() => { setMode("review"); }}>
            Review <span className="io-count">{stats.due}</span>
          </button>
          <button type="button" role="tab" aria-selected={mode === "browse"} className={mode === "browse" ? "is-on" : ""} onClick={() => { setMode("browse"); }}>
            Browse all <span className="io-count">{stats.total}</span>
          </button>
        </div>
        <button type="button" className="io-toggle" onClick={() => { setGalleryOpen(true); }} disabled={figures.length === 0}>
          All figures <span className="key-hint">G</span>
        </button>
      </div>

      {allRegions.length > 1 && (
        <div className="tag-filter-row">
          {allRegions.map((r) => (
            <button key={r} type="button" className={regions.includes(r) ? "tag tag-toggle active" : "tag tag-toggle"} onClick={() => { toggleRegion(r); }} aria-pressed={regions.includes(r)}>
              {own(REGION_LABELS, r) ?? r}
            </button>
          ))}
          {regions.length > 0 && (
            <button type="button" className="tag-filter-clear" onClick={() => { updatePrefs({ regions: [] }); }}>
              Clear
            </button>
          )}
        </div>
      )}

      {notes === null ? (
        <div className="route-loading" role="status" aria-label="Loading figures">
          <PulseLine />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No figures in this selection" />
      ) : !card ? (
        <div className="flashcard-empty">
          {session.reviewed > 0 ? (
            <div className="session-summary">
              <h2>Review done</h2>
              <div className="session-stats">
                <div>
                  <strong>{session.reviewed}</strong>
                  <span>reviewed</span>
                </div>
                <div>
                  <strong>{session.reviewed - session.lapses}</strong>
                  <span>recalled</span>
                </div>
                <div>
                  <strong>{session.lapses}</strong>
                  <span>missed</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Nothing due right now">Every label here is scheduled for later. Browse the figures in the meantime.</EmptyState>
          )}
          <div className="io-done-actions">
            <button type="button" className="btn" onClick={() => { setMode("browse"); }}>
              Browse all figures
            </button>
            {lastGrade && (
              <button type="button" className="btn btn-secondary" onClick={undo}>
                Undo last grade
              </button>
            )}
          </div>
          <NextUp />
        </div>
      ) : (
        <div className="io-layout">
          <div className="io-main">
            <OcclusionFigure
              card={card}
              revealed={revealed}
              revealAll={revealAll}
              hideAll={hideAll}
              zoom={zoom}
              onToggle={() => { setRevealed((r) => !r); }}
              onPick={pickMask}
              onSwipe={step}
            />

            <p className={revealed ? "io-answer" : "io-answer is-hidden"} aria-live="polite">
              {revealed ? card.mask.label : "Name the label under the red box"}
            </p>

            {revealed ? (
              <div className="grade-row">
                {GRADES.map((g) => (
                  <button key={g.quality} type="button" className="btn btn-grade" onClick={() => { handleGrade(g.quality); }} title={t("grade.title", { hint: t(g.hint), key: g.key })}>
                    {t(g.label)}
                    <span className="io-interval">{intervalFor(g.quality)}</span>
                    <span className="key-hint">{g.key}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grade-row">
                <button type="button" className="btn" onClick={() => { setRevealed(true); }}>
                  Reveal <span className="key-hint">Space</span>
                </button>
              </div>
            )}

            <div className="io-nav">
              <button type="button" className="io-nav-btn" onClick={() => { step(-1); }} aria-label="Previous label">
                ← Prev
              </button>
              <span className="io-nav-pos">
                {mode === "review" ? `${due.length} left${session.reviewed ? ` · ${session.reviewed} done` : ""}` : `Label ${card.order + 1} of ${deck.length}`}
              </span>
              {lastGrade && (
                <button type="button" className="io-nav-btn" onClick={undo} title="Undo the last grade (U or Ctrl+Z)">
                  Undo
                </button>
              )}
              <button type="button" className="io-nav-btn" onClick={() => { step(1); }} aria-label={revealed ? "Next label" : "Skip to the next label"}>
                {revealed ? "Next" : "Skip"} →
              </button>
            </div>
          </div>

          <aside className="io-side">
            <div className="io-fig-nav">
              <button type="button" className="io-nav-btn" onClick={() => { stepFig(-1); }} aria-label="Previous figure" title="Previous figure (Shift+← or [)">
                ‹
              </button>
              <span>
                Figure {figureIndex + 1} of {figures.length}
              </span>
              <button type="button" className="io-nav-btn" onClick={() => { stepFig(1); }} aria-label="Next figure" title="Next figure (Shift+→ or ])">
                ›
              </button>
            </div>
            <h2 className="io-figure-title">{card.note.title}</h2>
            {figure && (
              <p className="io-fig-stats">
                {own(REGION_LABELS, card.note.region) ?? card.note.region} · {figure.total} labels · {figure.due} due · {figure.mastered} mastered
              </p>
            )}

            <div className="io-chips" role="group" aria-label="Labels on this figure">
              {card.note.masks.map((m, i) => {
                const id = `${card.note.id}:${m.id}`;
                const status = labelStatus(own(stateMap, id), now);
                const current = m.id === card.mask.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`io-chip is-${status}${current ? " is-current" : ""}`}
                    aria-current={current || undefined}
                    aria-label={`Label ${i + 1}, ${entry(STATUS_TEXT, status)}`}
                    onClick={() => { pickMask(m.id); }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <p className="io-legend">
              <span className="io-dot is-new" /> new <span className="io-dot is-due" /> due <span className="io-dot is-learning" /> learning <span className="io-dot is-mastered" /> mastered
            </p>

            <div className="io-toggles">
              <button type="button" className={`io-toggle${hideAll ? " is-on" : ""}`} onClick={() => { updatePrefs({ hideAll: !hideAll }); }} aria-pressed={hideAll}>
                Hide all <span className="key-hint">H</span>
              </button>
              <button type="button" className={`io-toggle${zoom ? " is-on" : ""}`} onClick={() => { updatePrefs({ zoom: !zoom }); }} aria-pressed={zoom}>
                Zoom <span className="key-hint">Z</span>
              </button>
              <button type="button" className={`io-toggle${revealAll ? " is-on" : ""}`} onClick={() => { setRevealAll((v) => !v); }} aria-pressed={revealAll}>
                Show labels <span className="key-hint">A</span>
              </button>
            </div>

            <Link to={card.note.chapter} className="io-read">
              Read about this figure →
            </Link>

            <dl className="io-keys">
              <dt>Space</dt>
              <dd>reveal / cover</dd>
              <dt>1–5</dt>
              <dd>grade</dd>
              <dt>← →</dt>
              <dd>previous / next label</dd>
              <dt>Shift+← →</dt>
              <dd>previous / next figure</dd>
              <dt>U</dt>
              <dd>undo last grade</dd>
            </dl>
          </aside>
        </div>
      )}

      {galleryOpen && <FigureGallery figures={figures} currentIndex={card?.noteIndex ?? -1} onOpen={openFigure} onClose={() => { setGalleryOpen(false); }} />}
    </section>
  );
}
