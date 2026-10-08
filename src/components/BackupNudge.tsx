import { useState } from "react";
import { Link } from "react-router-dom";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { getActivityDays } from "../lib/activity";
import { shouldNudgeBackup } from "../lib/backupReminder";
import { useAccount } from "../hooks/useAccount";

interface BackupNudgeProps {
  /** Show a link to the Progress page's export button. Off when already on that page. */
  showLink?: boolean;
}

export function BackupNudge({ showLink = true }: BackupNudgeProps) {
  const [dismissed, setDismissed] = useState(false);
  const { status } = useAccount();
  const lastExport = readJSON<string | null>(STORAGE_KEYS.lastExport, null);
  const hasActivity = getActivityDays().length > 0;

  // Signed-in progress is already saved to the account.
  if (status === "signed-in" || dismissed || !shouldNudgeBackup(lastExport, hasActivity)) return null;

  return (
    <div className="backup-nudge">
      <span>
        {lastExport
          ? "It's been a while since your last backup — export a fresh copy of your progress."
          : "You haven't backed up your progress yet. Everything lives only in this browser."}
      </span>
      <div className="backup-nudge-actions">
        {showLink && (
          <Link to="/progress" className="btn btn-secondary btn-small">
            Back up now
          </Link>
        )}
        <button
          type="button"
          className="backup-nudge-dismiss"
          onClick={() => { setDismissed(true); }}
          aria-label="Dismiss backup reminder"
        >
          ×
        </button>
      </div>
    </div>
  );
}
