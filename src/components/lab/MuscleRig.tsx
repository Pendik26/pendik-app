interface Props {
  /** Resting length in mm (50–100): sets how far apart the clamps are. */
  lengthMm: number;
  /** 0–1: how hard the muscle is contracting, shown as it bulges and darkens. */
  activation: number;
  /** Stimulator light. */
  stimulating: boolean;
  /** Isotonic set-up: the muscle hangs a weight instead of being clamped at both ends. */
  weightG?: number | null;
  /** How far the muscle has shortened, mm (isotonic only). */
  shorteningMm?: number;
}

const TOP = 70;
const PX_PER_MM = 2.1;
// Shortening is only a few millimetres; exaggerated so it's visible.
const LIFT_PX_PER_MM = 9;

/** The muscle hanging in its holder, drawn to follow the simulation. */
export function MuscleRig({ lengthMm, activation, stimulating, weightG = null, shorteningMm = 0 }: Props) {
  const isotonic = weightG != null;
  const len = lengthMm * PX_PER_MM - (isotonic ? shorteningMm * LIFT_PX_PER_MM : 0);
  const bottom = TOP + len;
  const mid = TOP + len / 2;
  const bulge = 15 + activation * 5;
  const body = `M100,${TOP + 10} C${100 + bulge * 1.5},${TOP + len * 0.28} ${100 + bulge * 1.5},${bottom - len * 0.28} 100,${bottom - 10} C${100 - bulge * 1.5},${bottom - len * 0.28} ${100 - bulge * 1.5},${TOP + len * 0.28} 100,${TOP + 10} Z`;
  const shade = Math.round(40 + activation * 18);

  return (
    <svg className="lab-rig" viewBox="0 0 200 360" role="img" aria-label={`Muscle at ${lengthMm} mm${isotonic ? ` holding a ${weightG} g weight` : ""}`}>
      {/* Stand */}
      <rect x="22" y="20" width="10" height="330" rx="3" className="lab-rig-metal" />
      <rect x="14" y="340" width="70" height="10" rx="3" className="lab-rig-metal" />
      <rect x="22" y="40" width="96" height="9" rx="3" className="lab-rig-metal" />
      {/* Force transducer */}
      <rect x="84" y="30" width="32" height="28" rx="4" className="lab-rig-box" />
      <text x="100" y="47" textAnchor="middle" className="lab-rig-small">
        g
      </text>
      <line x1="100" y1="58" x2="100" y2={TOP + 10} className="lab-rig-thread" />
      {/* Muscle */}
      <line x1="100" y1={TOP} x2="100" y2={TOP + 12} className="lab-rig-tendon" />
      <path d={body} className="lab-rig-muscle" style={{ fill: `hsl(4 62% ${72 - shade * 0.35}%)` }} />
      <path d={`M100,${TOP + 16} L100,${bottom - 16}`} className="lab-rig-fibres" />
      <path d={`M${100 - bulge * 0.6},${mid - len * 0.25} Q100,${mid} ${100 - bulge * 0.6},${mid + len * 0.25}`} className="lab-rig-fibres" />
      <path d={`M${100 + bulge * 0.6},${mid - len * 0.25} Q100,${mid} ${100 + bulge * 0.6},${mid + len * 0.25}`} className="lab-rig-fibres" />
      <line x1="100" y1={bottom - 12} x2="100" y2={bottom} className="lab-rig-tendon" />
      {/* Stimulating electrodes */}
      <path d={`M140,${mid - 22} H118 V${mid - 10}`} className="lab-rig-wire" />
      <path d={`M140,${mid + 22} H118 V${mid + 10}`} className="lab-rig-wire" />
      <rect x="138" y={mid - 30} width="46" height="60" rx="6" className="lab-rig-box" />
      <circle cx="161" cy={mid - 12} r="6" className={`lab-rig-led${stimulating ? " is-on" : ""}`} />
      <text x="161" y={mid + 14} textAnchor="middle" className="lab-rig-small">
        stim
      </text>
      {isotonic ? (
        <g>
          <line x1="100" y1={bottom} x2="100" y2={bottom + 22} className="lab-rig-thread" />
          <rect x="80" y={bottom + 22} width="40" height={20 + weightG * 8} rx="4" className="lab-rig-weight" />
          <text x="100" y={bottom + 36 + weightG * 4} textAnchor="middle" className="lab-rig-weight-label">
            {weightG.toFixed(1)} g
          </text>
          {/* Platform the weight rests on before it is lifted */}
          <rect x="66" y={TOP + lengthMm * PX_PER_MM + 42 + weightG * 8} width="68" height="6" rx="2" className="lab-rig-metal" />
        </g>
      ) : (
        <g>
          <rect x="22" y={bottom} width="96" height="9" rx="3" className="lab-rig-metal" />
          <rect x="88" y={bottom - 4} width="24" height="12" rx="3" className="lab-rig-box" />
        </g>
      )}
    </svg>
  );
}
