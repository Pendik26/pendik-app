import { useState } from "react";
import { getActivityDays, getCurrentStreak } from "../lib/activity";
import { FlameIcon } from "./icons";

export function StreakBadge() {
  const [streak] = useState(() => getCurrentStreak(getActivityDays()));

  if (streak === 0) return null;

  return (
    <span className="streak-badge" title={`${streak}-day study streak`}>
      <FlameIcon />
      {streak}
    </span>
  );
}
