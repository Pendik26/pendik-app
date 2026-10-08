import type { ReactNode } from "react";

// Line icons for the 3D atlas's controls (the rest come from the knowledge map's set): 24-unit grid, round 2-unit strokes, no fills.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const TurnLeftIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

export const TurnRightIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

export const ForwardIcon = () => (
  <Icon>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const PivotIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 3a9 9 0 0 1 8.5 6M12 21a9 9 0 0 1-8.5-6" />
    <path d="m20.5 3.5.2 5.4-5.3-.6M3.5 20.5l-.2-5.4 5.3.6" />
  </Icon>
);

/** A standing figure, for the whole body. */
export const BodyIcon = () => (
  <Icon>
    <circle cx="12" cy="4.5" r="2" />
    <path d="M12 7.5v7M7 9.5h10M12 14.5l-3 6.5M12 14.5l3 6.5" />
  </Icon>
);
