import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { totalCardsDue, totalQuizDue } from "../lib/dueCounts";
import { STORAGE_UPDATED_EVENT } from "../lib/sync";

/**
 * Reviews due now (flashcards studied before, quiz questions missed), re-counted on every page
 * change, when synced progress arrives, and every few minutes as intervals come due.
 */
export function useDueCounts(): { cards: number; questions: number } {
  const { pathname } = useLocation();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => { setVersion((v) => v + 1); };
    window.addEventListener(STORAGE_UPDATED_EVENT, bump);
    const timer = window.setInterval(bump, 5 * 60_000);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, bump);
      window.clearInterval(timer);
    };
  }, []);
  return useMemo(
    () => ({ cards: totalCardsDue(), questions: totalQuizDue() }),
    // pathname and version: re-count after studying on another page, or a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, version],
  );
}
