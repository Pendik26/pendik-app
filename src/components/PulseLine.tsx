/** The app's signature motif: an EKG pulse trace. Draws itself in on mount. */
export function PulseLine({
  width = 96,
  height = 24,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 24"
      width={width}
      height={height}
      className={className ? `pulse-line ${className}` : "pulse-line"}
      aria-hidden="true"
    >
      <path
        d="M0 12h16l6-9 8 18 6-13 4 4h16l6-9 8 18 6-9h20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
