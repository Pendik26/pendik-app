import { useEffect } from "react";

// Glass surfaces that catch a pointer-following specular highlight (see the ::after rules
// on .nav-card, .btn and .icon-btn).
const SPOTLIGHT_SELECTOR = ".nav-card, .btn, .icon-btn";

/** Pointer-following highlight on glass cards and buttons, tracked via CSS custom properties. */
export function useCardSpotlight() {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(SPOTLIGHT_SELECTOR) : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty("--spot-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
