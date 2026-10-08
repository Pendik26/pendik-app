import { useState } from "react";
import { totalQuizDue } from "../lib/dueCounts";
import { QuizIcon } from "./icons";

export function QuizDueBadge() {
  const [due] = useState(totalQuizDue);

  if (due === 0) return null;

  return (
    <span className="quiz-due-badge" title={`${due} quiz question${due === 1 ? "" : "s"} due for review`}>
      <QuizIcon />
      {due}
    </span>
  );
}
