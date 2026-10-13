import { READING_FONT_SCALES, type ReadingPrefs } from "../hooks/useReadingPrefs";
import { PrinterIcon } from "./icons";
import { useI18n } from "../i18n/useI18n";

interface ReadingControlsProps {
  prefs: ReadingPrefs;
  onChange: (prefs: ReadingPrefs) => void;
}

export function ReadingControls({ prefs, onChange }: ReadingControlsProps) {
  const { t } = useI18n();
  const idx = READING_FONT_SCALES.indexOf(prefs.fontScale);
  const safeIdx = idx === -1 ? 1 : idx;

  const stepScale = (delta: number) => {
    const next = Math.min(READING_FONT_SCALES.length - 1, Math.max(0, safeIdx + delta));
    onChange({ ...prefs, fontScale: READING_FONT_SCALES.at(next) ?? prefs.fontScale });
  };

  return (
    <div className="reading-controls" role="group" aria-label={t("read.settings")}>
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { stepScale(-1); }}
        disabled={safeIdx === 0}
        aria-label={t("read.smaller")}
        title={t("read.smaller")}
      >
        A−
      </button>
      <span className="reading-control-scale">{Math.round(prefs.fontScale * 100)}%</span>
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { stepScale(1); }}
        disabled={safeIdx === READING_FONT_SCALES.length - 1}
        aria-label={t("read.larger")}
        title={t("read.larger")}
      >
        A+
      </button>
      <button
        type="button"
        className={prefs.accessibleFont ? "reading-control-btn active" : "reading-control-btn"}
        onClick={() => { onChange({ ...prefs, accessibleFont: !prefs.accessibleFont }); }}
        aria-pressed={prefs.accessibleFont}
        title={t("read.font")}
      >
        Aa
      </button>
      <button
        type="button"
        className="reading-control-btn"
        onClick={() => { window.print(); }}
        aria-label={t("read.print")}
        title={t("read.print")}
      >
        <PrinterIcon />
      </button>
    </div>
  );
}
