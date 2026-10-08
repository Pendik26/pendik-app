import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Scroll position per history entry, kept for this tab's session. */
const positions = new Map<string, number>();

/**
 * Opening a page starts it at the top; Back and Forward return to where the page was left. The
 * browser's own restoration runs before a lazily loaded page has its content, so it lands short;
 * this waits (up to about a second) for the page to grow tall enough first.
 */
export function ScrollManager() {
  const location = useLocation();
  const navigation = useNavigationType();
  const lastPath = useRef(location.pathname);
  const currentKey = useRef(location.key);
  const restoring = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    // Saved under the browser's current history entry (the router's key lives in history.state),
    // which changes the moment a link is followed, before the router swaps the page: the jumps
    // that swap causes are never saved against the page being left.
    const save = () => {
      if (restoring.current) return;
      const key = (history.state as { key?: string } | null)?.key ?? currentKey.current;
      positions.set(key, window.scrollY);
    };
    // Back/Forward: hold saving until the page is put back where it was.
    const pop = () => {
      restoring.current = true;
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("popstate", pop);
    };
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    if (navigation !== "POP") {
      // A new page starts at the top (or at its #anchor); a query change on the same page stays put.
      if (!samePage && !location.hash) window.scrollTo(0, 0);
      return;
    }
    const target = positions.get(location.key) ?? 0;
    restoring.current = true;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= target || tries++ > 60) {
        window.scrollTo(0, Math.min(target, Math.max(0, max)));
        restoring.current = false;
      } else frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
    };
  }, [location.key, location.pathname, location.hash, navigation]);

  return null;
}
