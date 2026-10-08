import { READING_FONT_SCALES, type ReadingPrefs } from "../hooks/useReadingPrefs";
import { PrinterIcon } from "./icons";

interface ReadingControlsProps {
  prefs: ReadingPrefs;
  onChange: (prefs: ReadingPrefs) => void;
}

export function ReadingControls({ prefs, onChange }: ReadingControlsProps) {
  const idx = READING_FONT_SCALES.indexOf(prefs.fontScale);
  const safeIdx = idx === -1 ? 1 : idx;

  const stepScale = (delta: number) => {
    const next = Math.min(READING_FONT_SCALES.length - 1, Math.max(0, safeIdx + delta));
    onChange({ ...prefs, fontScale: READING_FONT_SCALES.at(next) ?? prefs.fontScale });
  };

  return (
    <div className="reading-controls" role="group" aria-label="Reading display settings">
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { stepScale(-1); }}
        disabled={safeIdx === 0}
        aria-label="Decrease text size"
        title="Decrease text size"
      >
        A−
      </button>
      <span className="reading-control-scale">{Math.round(prefs.fontScale * 100)}%</span>
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { stepScale(1); }}
        disabled={safeIdx === READING_FONT_SCALES.length - 1}
        aria-label="Increase text size"
        title="Increase text size"
      >
        A+
      </button>
      <button
        type="button"
        className={prefs.accessibleFont ? "reading-control-btn active" : "reading-control-btn"}
        onClick={() => { onChange({ ...prefs, accessibleFont: !prefs.accessibleFont }); }}
        aria-pressed={prefs.accessibleFont}
        title="Toggle accessible font (Atkinson Hyperlegible)"
      >
        Aa
      </button>
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { window.print(); }}
        aria-label="Print or save as PDF"
        title="Print or save as PDF"
      >
        <PrinterIcon />
      </button>
    </div>
  );
}
