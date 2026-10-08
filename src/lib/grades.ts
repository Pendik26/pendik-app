/** Self-grading buttons for spaced-repetition review (SM-2 quality), with their keyboard keys. */
export const GRADES = [
  { quality: 0, key: "1", label: "Blackout", hint: "No idea" },
  { quality: 2, key: "2", label: "Hard", hint: "Barely recalled" },
  { quality: 3, key: "3", label: "Okay", hint: "Recalled with effort" },
  { quality: 4, key: "4", label: "Good", hint: "Recalled easily" },
  { quality: 5, key: "5", label: "Easy", hint: "Instant recall" },
] as const;
