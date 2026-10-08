import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the #section in the address once the page's content (`ready`) has rendered, and
 * marks it briefly, so links from the knowledge map land on the right heading.
 */
export function useHashScroll(ready: unknown) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      el.classList.add("is-target");
      window.setTimeout(() => { el.classList.remove("is-target"); }, 2400);
    });
    return () => { cancelAnimationFrame(frame); };
  }, [ready, hash]);
}
