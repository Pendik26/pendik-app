import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount } from "../../hooks/useAccount";
import { useOnline } from "../../hooks/useOnline";
import { readPageContext, retryAlfond, sendToAlfond, stopAlfond, useAlfond } from "../../lib/alfond";
import { pageMeta } from "../../lib/routeMeta";
import { SITE_NAME } from "../../lib/site";
import { AiText } from "../AiText";
import { AlfondIcon } from "../icons";
import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "../../i18n/i18n";

interface Props {
  /** "overlay": beside any page, reading it; "page": Alfond's own page, with no page to read. */
  variant: "overlay" | "page";
  /** After following a link in the chat (the overlay closes on phones). */
  onNavigate?: () => void;
  autoFocus?: boolean;
}

const PAGE_PROMPTS: MessageKey[] = ["alfond.promptExplain", "alfond.promptQuiz", "alfond.promptRemember"];
const GENERAL_PROMPTS: MessageKey[] = ["alfond.promptPlan", "alfond.promptSpaced", "alfond.promptCardiac"];
const SLOW_MS = 8000;

/** The conversation and the message box, shared by the overlay and Alfond's page. */
export function AlfondChat({ variant, onNavigate, autoFocus }: Props) {
  const { t } = useI18n();
  const { status, config } = useAccount();
  const { messages, busy, remaining } = useAlfond();
  const online = useOnline();
  const { pathname } = useLocation();
  const [draft, setDraft] = useState("");
  const [usePage, setUsePage] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const readsPage = variant === "overlay" && usePage;
  const rawPageTitle = pageMeta(pathname).title;
  const titleSuffix = ` · ${SITE_NAME}`;
  const pageTitle = rawPageTitle.endsWith(titleSuffix) ? rawPageTitle.slice(0, -titleSuffix.length) : rawPageTitle;
  const last = messages.at(-1);
  const waiting = busy && last?.role === "assistant" && !last.content;

  // Free models can take most of a minute to start; say so instead of looking stuck.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => { setSlow(true); }, SLOW_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting]);

  // Follows the answer as it streams in, unless the student has scrolled up to read.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stick.current) log.scrollTop = log.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    stick.current = true;
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "";
    void sendToAlfond(text, readsPage ? readPageContext() : null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const followLink = () => onNavigate?.();

  let blocked: ReactNode = null;
  if (config && !config.ai) blocked = <p className="alfond-note">{t("alfond.off")}</p>;
  else if (config && status !== "signed-in" && status !== "checking")
    blocked = (
      <p className="alfond-note">
        <Link to="/account" onClick={followLink}>
          {t("auth.signIn")}
        </Link>{" "}
        {t("alfond.signIn")}
      </p>
    );

  const prompts = (variant === "overlay" ? PAGE_PROMPTS : GENERAL_PROMPTS).map((key) => t(key));
  const canSend = !blocked && online && status === "signed-in";

  return (
    <div className={`alfond-chat alfond-chat-${variant}`}>
      <div
        className="alfond-log"
        ref={logRef}
        role="log"
        aria-label={t("alfond.log")}
        aria-busy={busy}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {messages.length === 0 ? (
          <div className="alfond-empty">
            <span className="alfond-avatar" aria-hidden="true">
              <AlfondIcon />
            </span>
            <p>
              <strong>{t("alfond.hi")}</strong>{" "}
              {variant === "overlay" ? t("alfond.askPage") : t("alfond.askStudies")}
            </p>
            {canSend && (
              <div className="alfond-prompts">
                {prompts.map((p) => (
                  <button key={p} type="button" onClick={() => { send(p); }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} className="alfond-msg alfond-msg-user">
                <p>{m.content}</p>
                {m.page && (
                  <Link className="alfond-msg-page" to={m.page.path} onClick={followLink}>
                    {t("alfond.on", { page: m.page.title })}
                  </Link>
                )}
              </div>
            ) : (
              <div key={m.id} className="alfond-msg alfond-msg-bot">
                {m.content ? (
                  <AiText text={m.content} />
                ) : busy && i === messages.length - 1 ? (
                  <p className="alfond-thinking">
                    <span className="alfond-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    {slow ? t("alfond.slow") : t("alfond.thinking")}
                  </p>
                ) : null}
                {m.error && (
                  <p className="alfond-error">
                    {m.error === "Stopped." ? t("alfond.stopped") : m.error}
                    {i === messages.length - 1 && !busy && m.error !== "Stopped." && canSend && (
                      <>
                        {" "}
                        <button type="button" onClick={() => void retryAlfond(readsPage ? readPageContext() : null)}>
                          {t("drive.tryAgain")}
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>
            ),
          )
        )}
      </div>

      {blocked ?? (
        <form className="alfond-composer" onSubmit={onSubmit}>
          {variant === "overlay" && (
            <div className="alfond-context">
              {usePage ? (
                <>
                  <span className="alfond-context-chip" title={t("alfond.readingHint")}>
                    {t("alfond.reading")} <strong>{pageTitle}</strong>
                  </span>
                  <button type="button" className="alfond-context-x" onClick={() => { setUsePage(false); }} aria-label={t("alfond.dropPage")}>
                    ×
                  </button>
                </>
              ) : (
                <button type="button" className="alfond-context-add" onClick={() => { setUsePage(true); }}>
                  + {t("alfond.includePage")}
                </button>
              )}
            </div>
          )}
          <div className="alfond-input-row">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={3000}
              placeholder={online ? t("alfond.placeholder") : t("common.offline")}
              aria-label={t("alfond.message")}
              disabled={!online}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={onKeyDown}
            />
            {busy ? (
              <button type="button" className="alfond-send" onClick={stopAlfond} aria-label={t("alfond.stop")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button type="submit" className="alfond-send" disabled={!draft.trim() || !canSend} aria-label={t("alfond.send")}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
            )}
          </div>
          <p className="alfond-foot">
            {online ? t("alfond.canBeWrong") : t("alfond.needsInternet")}
            {online && remaining !== null && ` ${t("alfond.left", { count: remaining })}`}
          </p>
        </form>
      )}
    </div>
  );
}
