import { useAccount } from "../../hooks/useAccount";
import { useAlfondPrefs } from "../../lib/alfond";

/** The switch for Alfond's floating button (on Alfond's page and in Account). */
export function AlfondOverlaySetting() {
  const { config } = useAccount();
  const [prefs, setPrefs] = useAlfondPrefs();
  if (config?.ai !== true) return null;
  const on = prefs.overlay !== false;
  return (
    <label className="alfond-switch">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => { setPrefs({ overlay: e.target.checked }); }} />
      <span className="alfond-switch-track" aria-hidden="true" />
      <span className="alfond-switch-text">
        <strong>Alfond button on every page</strong>
        <small>A button in the corner opens Alfond beside the page you're on, ready to answer questions about it.</small>
      </span>
    </label>
  );
}
