import { Link } from "react-router-dom";
import { clearAlfond, useAlfond } from "../../lib/alfond";
import { AlfondIcon } from "../icons";
import { AlfondChat } from "./AlfondChat";
import { useI18n } from "../../i18n/useI18n";

const onPhone = () => window.matchMedia("(max-width: 960px)").matches;

/** The overlay's chat window (loaded the first time the floating button is pressed). */
export function AlfondPanel({ onClose }: { onClose: () => void }) {
  const { messages } = useAlfond();
  const { t } = useI18n();
  return (
    <>
      <div className="alfond-backdrop" onClick={onClose} aria-hidden="true" />
      <div id="alfond-panel" className="alfond-panel" role="dialog" aria-label={t("alfond.panel")}>
        <header className="alfond-panel-head">
          <span className="alfond-panel-title">
            <AlfondIcon />
            Alfond
          </span>
          <div className="alfond-panel-actions">
            <button type="button" className="icon-btn" onClick={clearAlfond} disabled={messages.length === 0} title={t("alfond.newChat")} aria-label={t("alfond.newChatLabel")}>
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <Link to="/alfond" className="icon-btn" onClick={onClose} title={t("alfond.openPage")} aria-label={t("alfond.openPage")}>
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="M14 5h5v5M19 5l-7 7M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </Link>
            <button type="button" className="icon-btn" onClick={onClose} title={t("drive.closeTitle")} aria-label={t("alfond.close")}>
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>
        <AlfondChat
          variant="overlay"
          autoFocus
          onNavigate={() => {
            if (onPhone()) onClose();
          }}
        />
      </div>
    </>
  );
}
