import { useState, type CSSProperties } from "react";

const COLORS = ["var(--accent)", "var(--accent-2)", "var(--accent-3)", "var(--green)"];

function makePieces(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const distance = 60 + Math.random() * 80;
    return {
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 20,
      rot: Math.round((Math.random() - 0.5) * 540),
      delay: Math.random() * 0.15,
      color: COLORS[i % COLORS.length],
    };
  });
}

/** A brief burst of colored pieces flying outward from center — used to celebrate a perfect quiz score. */
export function ConfettiBurst({ count = 18 }: { count?: number }) {
  const [pieces] = useState(() => makePieces(count));

  return (
    <div className="confetti-burst" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              "--delay": `${p.delay}s`,
              background: p.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
