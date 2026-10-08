import { AlfondChat } from "../components/alfond/AlfondChat";
import { AlfondOverlaySetting } from "../components/alfond/AlfondSetting";
import { clearAlfond, useAlfond } from "../lib/alfond";
import { useI18n } from "../i18n/useI18n";

/** Alfond's own page: the same conversation as the overlay, full size, and its setting. */
export function AlfondPage() {
  const { messages } = useAlfond();
  const { t } = useI18n();
  return (
    <section className="page alfond-page">
      <div className="alfond-page-head">
        <div>
          <h1>Alfond</h1>
          <p className="subtitle">{t("alfond.pageIntro")}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={clearAlfond} disabled={messages.length === 0}>
          {t("alfond.newChat")}
        </button>
      </div>
      <div className="alfond-page-chat">
        <AlfondChat variant="page" autoFocus />
      </div>
      <div className="alfond-page-settings" id="settings">
        <AlfondOverlaySetting />
      </div>
    </section>
  );
}
