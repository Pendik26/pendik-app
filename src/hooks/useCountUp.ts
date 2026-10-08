import { useEffect, useRef, useState } from "react";

/** Animates a number counting up from 0 to `value` on mount/change — a small "alive" touch for stat tiles. */
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0,
  );
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}
