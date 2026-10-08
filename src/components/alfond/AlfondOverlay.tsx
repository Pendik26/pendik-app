import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAccount } from "../../hooks/useAccount";
import { OPEN_ALFOND_EVENT, useAlfond, useAlfondPrefs } from "../../lib/alfond";
import { AlfondIcon } from "../icons";

// The chat itself loads the first time it's opened, so the button costs next to nothing.
const AlfondPanel = lazy(() => import("./AlfondPanel").then((m) => ({ default: m.AlfondPanel })));

/**
 * Where the button and window live: a box on the page that moves into whatever is shown full
 * screen (the 3D atlas, the knowledge map), since the browser shows nothing outside that.
 * Moving the box keeps the chat as it was: React doesn't mind where its container sits.
 */
function useLayer(): HTMLDivElement {
  const [box] = useState(() => {
    const div = document.createElement("div");
    div.className = "alfond-layer";
    return div;
  });
  useEffect(() => {
    const place = () => {
      const into = document.fullscreenElement ?? document.body;
      if (box.parentElement !== into) into.appendChild(box);
    };
    place();
    document.addEventListener("fullscreenchange", place);
    return () => {
      document.removeEventListener("fullscreenchange", place);
      box.remove();
    };
  }, [box]);
  return box;
}

/**
 * Alfond's floating button and chat window, on every page except Alfond's own. Hidden when the
 * site has no AI, or when the student has turned it off (Alfond page or Account).
 */
export function AlfondOverlay() {
  const { config } = useAccount();
  const [prefs] = useAlfondPrefs();
  const { busy } = useAlfond();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const layer = useLayer();
  const enabled = config?.ai === true && prefs.overlay !== false && pathname !== "/alfond";

  // "Ask Alfond" buttons elsewhere open the window.
  useEffect(() => {
    const show = () => { setOpen(true); };
    window.addEventListener(OPEN_ALFOND_EVENT, show);
    return () => { window.removeEventListener(OPEN_ALFOND_EVENT, show); };
  }, []);

  useEffect(() => {
    if (!open || !enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [open, enabled]);

  if (!enabled) return null;
  return createPortal(
    <>
      {open && (
        <Suspense fallback={null}>
          <AlfondPanel onClose={() => { setOpen(false); }} />
        </Suspense>
      )}
      <button
        ref={button}
        type="button"
        className={`alfond-fab${open ? " open" : ""}${busy && !open ? " busy" : ""}`}
        onClick={() => { setOpen((o) => !o); }}
        aria-expanded={open}
        aria-controls={open ? "alfond-panel" : undefined}
        aria-label={open ? "Close Alfond" : "Ask Alfond about this page"}
        title={open ? "Close Alfond" : "Ask Alfond"}
      >
        <AlfondIcon />
      </button>
    </>,
    layer,
  );
}
