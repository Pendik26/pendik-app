/** Small circular progress ring — used for per-subject mastery readouts. */
export function RadialGauge({
  percent,
  size = 36,
  strokeWidth = 3.5,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <svg
      className="radial-gauge"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={strokeWidth} />
      <circle
        className="radial-gauge-fill"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x="50%" y="51%" textAnchor="middle" dominantBaseline="middle" className="radial-gauge-text">
        {Math.round(clamped)}
      </text>
    </svg>
  );
}
