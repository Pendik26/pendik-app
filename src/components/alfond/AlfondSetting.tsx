import { useAccount } from "../../hooks/useAccount";
import { useAlfondPrefs } from "../../lib/alfond";
import { useI18n } from "../../i18n/useI18n";

/** The switch for Alfond's floating button (on Alfond's page and in Account). */
export function AlfondOverlaySetting() {
  const { config } = useAccount();
  const { t } = useI18n();
  const [prefs, setPrefs] = useAlfondPrefs();
  if (config?.ai !== true) return null;
  const on = prefs.overlay !== false;
  return (
    <label className="alfond-switch">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => { setPrefs({ overlay: e.target.checked }); }} />
      <span className="alfond-switch-track" aria-hidden="true" />
      <span className="alfond-switch-text">
        <strong>{t("alfond.setting")}</strong>
        <small>{t("alfond.settingHint")}</small>
      </span>
    </label>
  );
}
