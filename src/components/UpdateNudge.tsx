import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate";
import { RefreshIcon } from "./icons";

/**
 * Floating toast for when a new deploy has finished downloading in the
 * background. Refresh is opt-in, never forced — reloading mid-quiz or
 * mid-exam would lose the attempt in progress.
 */
export function UpdateNudge() {
  const { needRefresh, applyUpdate } = useServiceWorkerUpdate();

  if (!needRefresh) return null;

  return (
    <div className="update-nudge" role="status">
      <RefreshIcon />
      <span>A new version is ready.</span>
      <button type="button" className="btn btn-small update-nudge-btn" onClick={applyUpdate}>
        Refresh
      </button>
    </div>
  );
}
