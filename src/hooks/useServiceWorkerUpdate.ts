import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker and surfaces when a new version has finished
 * downloading in the background. Update installs are never forced — a quiz
 * or timed exam in progress shouldn't get yanked out from under the user —
 * the caller decides when to actually reload.
 */
export function useServiceWorkerUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisteredSW(_url, registration) {
        registrationRef.current = registration ?? null;
      },
    });

    const checkForUpdate = () => registrationRef.current?.update();

    // The browser's own SW update check only fires on a full navigation — a PWA that's
    // reopened from the background (or a tab that's just been left open) needs its own
    // nudge, so re-check on a shorter poll and whenever the app regains focus/visibility.
    const CHECK_INTERVAL_MS = 30 * 60 * 1000;
    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkForUpdate);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  const applyUpdate = () => {
    updateRef.current?.(true);
  };

  return { needRefresh, applyUpdate };
}
