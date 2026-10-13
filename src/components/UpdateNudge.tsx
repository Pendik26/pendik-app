import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate";
import { RefreshIcon } from "./icons";
import { useI18n } from "../i18n/useI18n";

/**
 * Floating toast for when a new deploy has finished downloading in the
 * background. Refresh is opt-in, never forced — reloading mid-quiz or
 * mid-exam would lose the attempt in progress.
 */
export function UpdateNudge() {
  const { needRefresh, applyUpdate } = useServiceWorkerUpdate();
  const { t } = useI18n();

  if (!needRefresh) return null;

  return (
    <div className="update-nudge" role="status">
      <RefreshIcon />
      <span>{t("update.ready")}</span>
      <button type="button" className="btn btn-small update-nudge-btn" onClick={applyUpdate}>
        {t("update.refresh")}
      </button>
    </div>
  );
}
