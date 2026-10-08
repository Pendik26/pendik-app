import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "../hooks/useAccount";
import { askAi, findNotes, type NotePassage } from "../lib/explain";
import { AiText } from "./AiText";
import { useI18n } from "../i18n/useI18n";

interface Props {
  /** "{blockId}/{subjectId}" */
  subjectKey: string;
  subjectLabel: string;
  question: string;
  options?: string[];
  answer: string;
  chosen?: string;
  explanation?: string;
}

type AiState =
  | { phase: "idle" }
  | { phase: "streaming"; text: string }
  | { phase: "done"; text: string; remaining: number | null }
  | { phase: "error"; message: string; text?: string };

/**
 * "Explain this" under a quiz answer or flashcard: the matching passages of the student's own
 * notes first (free, offline), then an AI explanation on request for signed-in students.
 */
export function ExplainPanel(props: Props) {
  const { subjectKey, question, answer } = props;
  const { t } = useI18n();
  const { status, config } = useAccount();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NotePassage[] | null>(null);
  const [ai, setAi] = useState<AiState>({ phase: "idle" });
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const abort = useRef<AbortController | null>(null);
  // Free models can take most of a minute before the first word; say so instead of looking stuck.
  const [slow, setSlow] = useState(false);
  const waiting = ai.phase === "streaming" && !ai.text;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => { setSlow(true); }, 8000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting]);

  // A new question starts closed again.
  const [shownFor, setShownFor] = useState(question);
  if (shownFor !== question) {
    setShownFor(question);
    setOpen(false);
    setNotes(null);
    setAi({ phase: "idle" });
  }

  useEffect(() => () => abort.current?.abort(), [question]);

  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!open || notes) return;
    let live = true;
    findNotes(subjectKey, `${question} ${answer}`).then(
      (found) => {
        if (live) setNotes(found);
      },
      () => {
        if (live) setNotes([]);
      },
    );
    return () => {
      live = false;
    };
  }, [open, notes, subjectKey, question, answer]);

  const ask = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAi({ phase: "streaming", text: "" });
    const found = notes ?? (await findNotes(subjectKey, `${question} ${answer}`).catch(() => []));
    const result = await askAi(
      {
        subject: props.subjectLabel,
        question,
        options: props.options ?? [],
        answer,
        chosen: props.chosen,
        explanation: props.explanation,
        notes: found,
      },
      (text) => { setAi({ phase: "streaming", text }); },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    setAi((prev) => {
      const text = prev.phase === "streaming" ? prev.text : "";
      return result.ok ? { phase: "done", text, remaining: result.remaining } : { phase: "error", message: result.message, text: result.partial ?? (text || undefined) };
    });
  };

  if (!open) {
    return (
      <div className="explain-panel">
        <button type="button" className="explain-toggle" onClick={() => { setOpen(true); }}>
          {t("explain.open")}
        </button>
      </div>
    );
  }

  const aiOn = config?.ai === true;
  return (
    <div className="explain-panel is-open">
      <div className="explain-head">
        <h3>{t("explain.notes")}</h3>
        <button type="button" className="explain-close" onClick={() => { setOpen(false); }} aria-label={t("explain.close")}>
          ×
        </button>
      </div>
      {notes === null ? (
        <p className="explain-muted">{t("explain.looking")}</p>
      ) : notes.length === 0 ? (
        <p className="explain-muted">{t("explain.noNotes")}</p>
      ) : (
        <ul className="explain-notes">
          {notes.map((n) => (
            <li key={n.title}>
              <Link to={n.to}>{n.title}</Link>
              <p>{n.text.length > 320 ? `${n.text.slice(0, 320).trimEnd()}…` : n.text}</p>
            </li>
          ))}
        </ul>
      )}

      {aiOn && (
        <div className="explain-ai">
          <h3>{t("explain.ai")}</h3>
          {!online ? (
            <p className="explain-muted">{t("explain.offline")}</p>
          ) : status !== "signed-in" ? (
            <p className="explain-muted">
              <Link to="/account">{t("auth.signIn")}</Link> {t("explain.signIn")}
            </p>
          ) : ai.phase === "idle" ? (
            <button type="button" className="btn btn-secondary explain-ask" onClick={ask}>
              {t("explain.ask")}
            </button>
          ) : (
            <>
              <div className="explain-ai-text" aria-live="polite">
                {waiting ? <p className="explain-muted">{slow ? t("alfond.slow") : t("alfond.thinking")}</p> : <AiText text={ai.phase === "error" ? (ai.text ?? "") : ai.text} />}
              </div>
              {ai.phase === "error" && (
                <p className="explain-error">
                  {ai.message}{" "}
                  <button type="button" className="explain-retry" onClick={ask}>
                    {t("drive.tryAgain")}
                  </button>
                </p>
              )}
              {ai.phase === "done" && (
                <p className="explain-foot">
                  {t("explain.canBeWrong")}
                  {ai.remaining !== null && ` ${t("alfond.left", { count: ai.remaining })}`}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
