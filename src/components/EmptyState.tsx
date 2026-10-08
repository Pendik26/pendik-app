import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon ?? (
          <svg viewBox="0 0 96 24" width="72" height="18" aria-hidden="true">
            <path
              d="M0 12h30l6-6 6 6h54"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="empty-state-title">{title}</p>
      {children && <div className="empty-state-body">{children}</div>}
    </div>
  );
}
