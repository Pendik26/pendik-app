/** Self-grading buttons for spaced-repetition review (SM-2 quality), with their keyboard keys and message keys. */
export const GRADES = [
  { quality: 0, key: "1", label: "grade.blackout", hint: "grade.blackoutHint" },
  { quality: 2, key: "2", label: "grade.hard", hint: "grade.hardHint" },
  { quality: 3, key: "3", label: "grade.okay", hint: "grade.okayHint" },
  { quality: 4, key: "4", label: "grade.good", hint: "grade.goodHint" },
  { quality: 5, key: "5", label: "grade.easy", hint: "grade.easyHint" },
] as const;
