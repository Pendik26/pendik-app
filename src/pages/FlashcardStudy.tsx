import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { itemAt } from "../lib/arrays";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ExplainPanel } from "../components/ExplainPanel";
import { flashcardDecks, flashcardSubjects, keyOf, subjectKey } from "../lib/content";
import { useSpacedRepetition } from "../hooks/useSpacedRepetition";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { STORAGE_KEYS } from "../lib/storage";
import { GRADES } from "../lib/grades";
import { EmptyState } from "../components/EmptyState";
import { SpeakerIcon } from "../components/icons";
import { subjectHue, subjectHueStyle } from "../lib/subjectStyle";
import type { Flashcard } from "../types/content";
import { NextUp } from "../components/plan/Today";
import { SubjectTrail } from "../components/SubjectTrail";
import { useI18n } from "../i18n/useI18n";

function tagHueStyle(tag: string): CSSProperties {
  return { "--tag-hue": String(subjectHue(tag)) } as CSSProperties;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

const EMPTY_DECK: Flashcard[] = [];

export function FlashcardStudy() {
  const { t } = useI18n();
  const { blockId = "", subjectId = "" } = useParams();
  const key = subjectKey(blockId, subjectId);
  const subjectLabel = flashcardSubjects.find((s) => keyOf(s) === key)?.label ?? subjectId;
  const deck = flashcardDecks.get(key) ?? EMPTY_DECK;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState({ reviewed: 0, lapses: 0 });
  const [extraReview, setExtraReview] = useState(false);
  const [selectedTags, setSelectedTags] = useLocalStorage<string[]>(STORAGE_KEYS.tagFilter(key), []);
  // "Drill" links from weak spots open the deck filtered to one topic: ?tag=…
  const [searchParams] = useSearchParams();
  const tagParam = searchParams.get("tag");
  const [appliedTag, setAppliedTag] = useState<string | null>(null);
  if (tagParam && tagParam !== appliedTag && deck.some((c) => c.tags.includes(tagParam))) {
    setAppliedTag(tagParam);
    setSelectedTags([tagParam]);
  }

  const [filterOpen, setFilterOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of deck) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  }, [deck]);
  const allTags = useMemo(
    () => Array.from(new Set(deck.flatMap((c) => c.tags))).sort(),
    [deck],
  );
  // The knowledge map opens a deck on just the cards about one concept: ?cards=id,id
  const cardsParam = searchParams.get("cards");
  const [showAllCards, setShowAllCards] = useState(false);
  const pickedCards = useMemo(() => {
    if (!cardsParam || showAllCards) return null;
    const ids = new Set(cardsParam.split(","));
    const picked = deck.filter((c) => ids.has(c.id));
    return picked.length ? picked : null;
  }, [cardsParam, showAllCards, deck]);
  const filteredDeck = useMemo(
    () =>
      pickedCards ??
      (selectedTags.length === 0
        ? deck
        : deck.filter((c) => c.tags.some((t) => selectedTags.includes(t)))),
    [deck, selectedTags, pickedCards],
  );

  const { dueCards, grade, stats, hardestCards } = useSpacedRepetition(key, filteredDeck);

  const resetSession = () => {
    setIndex(0);
    setFlipped(false);
    setExtraReview(false);
    setSession({ reviewed: 0, lapses: 0 });
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    resetSession();
  };

  const clearTags = () => {
    setSelectedTags([]);
    resetSession();
  };

  const queue = dueCards.length > 0 ? dueCards : filteredDeck;
  const card = itemAt(queue, index % queue.length);
  const sessionDone = dueCards.length === 0 && !extraReview;

  const handleGrade = (quality: number) => {
    if (!card) return;
    grade(card.id, quality);
    setSession((s) => ({
      reviewed: s.reviewed + 1,
      lapses: s.lapses + (quality < 3 ? 1 : 0),
    }));
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    if (sessionDone) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.closest(".explain-panel"))) {
        return;
      }
      if (!flipped && (e.code === "Space" || e.key === "Enter")) {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (flipped) {
        const matched = GRADES.find((g) => g.key === e.key);
        if (matched) {
          e.preventDefault();
          handleGrade(matched.quality);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, sessionDone, card?.id]);

  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [card?.id]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  if (deck.length === 0) {
    return (
      <section className="page">
        <p>{t("study.unknownSubject")}</p>
        <Link to="/flashcards">{t("cards.back")}</Link>
      </section>
    );
  }

  return (
    <section className="page subject-tinted" style={subjectHueStyle(subjectId) as CSSProperties}>
      <SubjectTrail blockId={blockId} subjectId={subjectId} current="flashcards" />
      <h1>{subjectLabel}</h1>
      <p className="subtitle">
        {t("cards.stats", { due: stats.due, mastered: stats.mastered, total: stats.total })}
        {pickedCards
          ? ` · ${t("cards.fromMap", { count: pickedCards.length })}`
          : selectedTags.length > 0 && ` · ${t("cards.filtered", { count: filteredDeck.length })}`}
        {pickedCards && (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={() => { setShowAllCards(true); }}>
              {t("cards.wholeDeck")}
            </button>
          </>
        )}
      </p>

      {allTags.length > 0 && (
        <div className="topic-filter">
          <div className="topic-filter-bar">
            <button
              type="button"
              className={`topic-filter-toggle${filterOpen ? " is-open" : ""}`}
              onClick={() => { setFilterOpen((o) => !o); }}
              aria-expanded={filterOpen}
              aria-controls="topic-filter-panel"
            >
              {t("cards.filterTopic")}
              {selectedTags.length > 0 && <span className="topic-filter-count">{selectedTags.length}</span>}
              <span aria-hidden="true">{filterOpen ? "▴" : "▾"}</span>
            </button>
            {selectedTags.map((tag) => (
              <button key={tag} type="button" className="tag tag-toggle tag-colored active" style={tagHueStyle(tag)} onClick={() => { toggleTag(tag); }} aria-label={t("cards.removeFilter", { tag })}>
                {tag} ×
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button type="button" className="tag-filter-clear" onClick={clearTags}>
                {t("cards.clear")}
              </button>
            )}
          </div>
          {filterOpen && (
            <div className="topic-filter-panel" id="topic-filter-panel">
              <input
                type="search"
                className="topic-filter-search"
                placeholder={t("cards.findTopicCount", { count: allTags.length })}
                value={tagQuery}
                onChange={(e) => { setTagQuery(e.target.value); }}
                aria-label={t("cards.findTopic")}
              />
              <div className="tag-filter-row">
                {allTags
                  .filter((tag) => tag.includes(tagQuery.trim().toLowerCase()))
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={selectedTags.includes(tag) ? "tag tag-toggle tag-colored active" : "tag tag-toggle tag-colored"}
                      style={tagHueStyle(tag)}
                      onClick={() => { toggleTag(tag); }}
                      aria-pressed={selectedTags.includes(tag)}
                    >
                      {tag} <span className="topic-filter-n">{tagCounts.get(tag)}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {filteredDeck.length === 0 ? (
        <EmptyState title={t("cards.noMatch")}>
          <button className="btn empty-state-action" onClick={clearTags}>
            {t("cards.clearFilters")}
          </button>
        </EmptyState>
      ) : sessionDone || !card ? (
        <div className="flashcard-empty">
          {session.reviewed > 0 ? (
            <div className="session-summary">
              <h2>{t("cards.sessionDone")}</h2>
              <div className="session-stats">
                <div>
                  <strong>{session.reviewed}</strong>
                  <span>{t("cards.reviewed")}</span>
                </div>
                <div>
                  <strong>{session.reviewed - session.lapses}</strong>
                  <span>{t("cards.recalled")}</span>
                </div>
                <div>
                  <strong>{session.lapses}</strong>
                  <span>{t("cards.missed")}</span>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIndex(0);
                  setExtraReview(true);
                  setSession({ reviewed: 0, lapses: 0 });
                }}
              >
                {t("cards.reviewAnyway")}
              </button>
            </div>
          ) : (
            <EmptyState title={t("cards.nothingDue")}>
              {t("cards.caughtUp")}
              <br />
              <button
                className="btn empty-state-action"
                onClick={() => {
                  setIndex(0);
                  setExtraReview(true);
                  setSession({ reviewed: 0, lapses: 0 });
                }}
              >
                {t("cards.reviewAnyway")}
              </button>
            </EmptyState>
          )}

          <NextUp />

          {hardestCards.length > 0 && (
            <div className="hardest-cards">
              <h3>{t("cards.hardest")}</h3>
              <ul>
                {hardestCards.map(({ card: c, lapses }) => (
                  <li key={c.id}>
                    {c.front} <span className="lapse-count">{t("cards.lapses", { count: lapses })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flashcard-session">
          <div
            className={flipped ? "flashcard flipped" : "flashcard"}
            onClick={() => { setFlipped((f) => !f); }}
            role="button"
            tabIndex={0}
            aria-pressed={flipped}
            aria-label={flipped ? t("cards.showingAnswer") : t("cards.showingQuestion")}
          >
            <div className="flashcard-inner">
              <div className="flashcard-face flashcard-front">
                <button
                  type="button"
                  className="icon-btn flashcard-speak-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(card.front);
                  }}
                  aria-label={t("cards.readQuestion")}
                  title={t("cards.readAloud")}
                >
                  <SpeakerIcon />
                </button>
                {card.image && (
                  <div className="flashcard-image" dangerouslySetInnerHTML={{ __html: card.image }} />
                )}
                <p>{card.front}</p>
                <span className="flashcard-hint">{t("cards.spaceReveal")}</span>
              </div>
              <div className="flashcard-face flashcard-back">
                <button
                  type="button"
                  className="icon-btn flashcard-speak-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(card.back);
                  }}
                  aria-label={t("cards.readAnswer")}
                  title={t("cards.readAloud")}
                >
                  <SpeakerIcon />
                </button>
                <p>{card.back}</p>
                <span className="flashcard-hint">{t("cards.answer")}</span>
              </div>
            </div>
          </div>

          {card.tags.length > 0 && (
            <div className="tag-row">
              {card.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={selectedTags.includes(tag) ? "tag tag-toggle tag-colored active" : "tag tag-toggle tag-colored"}
                  style={tagHueStyle(tag)}
                  onClick={() => { toggleTag(tag); }}
                  aria-pressed={selectedTags.includes(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {flipped && (
            <ExplainPanel subjectKey={key} subjectLabel={subjectLabel} question={card.front} answer={card.back} />
          )}

          {flipped && (
            <div className="grade-row">
              {GRADES.map((g) => (
                <button
                  key={g.quality}
                  className="btn btn-grade"
                  onClick={() => { handleGrade(g.quality); }}
                  title={t("grade.title", { hint: t(g.hint), key: g.key })}
                >
                  {t(g.label)}
                  <span className="key-hint">{g.key}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
