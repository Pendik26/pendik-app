// Exam focus mode: while a timed exam is open, the app's navigation, search, shortcuts and the
// Alfond assistant are put away (CSS on body.exam-focus), so only the exam is on screen.

const CLASS = "exam-focus";

export function setExamFocus(on: boolean) {
  document.body.classList.toggle(CLASS, on);
}

/** True while an exam is open; shortcuts that would open something else check this. */
export function inExamFocus(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains(CLASS);
}
