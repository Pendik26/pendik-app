import { useCallback, useEffect, useState } from "react";

/** iPhone Safari has no element fullscreen, so there the prompt is not shown. */
const SUPPORTED = typeof document !== "undefined" && document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";

/**
 * The whole page's fullscreen state. `leaveOnUnmount` closes fullscreen when the page that asked
 * for it goes away, so a finished exam doesn't leave the student stuck in it.
 */
export function useFullscreen(leaveOnUnmount = false) {
  const [active, setActive] = useState(() => SUPPORTED && document.fullscreenElement !== null);

  useEffect(() => {
    if (!SUPPORTED) return;
    const onChange = () => { setActive(document.fullscreenElement !== null); };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (leaveOnUnmount && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [leaveOnUnmount]);

  const enter = useCallback(() => {
    if (SUPPORTED) void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  return { supported: SUPPORTED, active, enter };
}
