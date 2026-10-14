import { currentT, type MessageKey, type Translate } from "./i18n";

/** The server's refusal codes (server/*.ts), grouped by what the student should be told. */
const CODE_TEXT: Record<string, MessageKey> = {
  not_signed_in: "err.signedOut",
  admins_only: "err.adminsOnly",
  server_error: "err.unreachable",
  server_unavailable: "err.unreachable",
  network: "err.unreachable",
  package_not_found: "err.notFound",
  question_not_found: "err.notFound",
  attempt_not_found: "err.notFound",
  student_not_found: "err.notFound",
  no_such_account: "err.notFound",
  no_such_sync: "err.notFound",
  no_such_chapter: "err.notFound",
  package_empty: "err.noQuestions",
  no_questions: "err.noQuestions",
  no_questions_match: "err.noQuestions",
  import_has_no_questions: "err.noQuestions",
  not_on_yourself: "err.notOnYourself",
  last_admin: "err.lastAdmin",
  student_has_account: "err.hasAccount",
  value_too_big: "err.tooMuch",
  progress_full: "err.tooMuch",
  too_many_reviews: "err.tooMuch",
  drive_not_set_up: "err.driveNotSetUp",
  lecturer_not_found: "err.notFound",
  not_found: "err.notFound",
  too_many_reports: "schedule.errTooManyReports",
  missing_field: "schedule.errMissing",
  too_long: "schedule.errTooLong",
  bad_phone: "schedule.errPhone",
  attempt_not_running: "err.attempt",
  attempt_not_finished: "err.attempt",
  time_up: "exam.errTimeUp",
  held_elsewhere: "exam.errElsewhere",
  cannot_abandon: "exam.errCannotAbandon",
  best_only_for_exams: "err.invalid",
  unknown_request: "err.invalid",
  holder_required: "err.invalid",
  exam_needs_time_limit: "err.invalid",
};

/** What to show for a failed call: a known server code in the reader's language, else the plain message. */
export function errorText(error: unknown, t: Translate = currentT): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!/^[a-z_]+$/.test(raw)) return raw;
  const key = CODE_TEXT[raw] ?? (raw.startsWith("bad_") ? "err.invalid" : undefined);
  return key ? t(key) : t("common.error", { message: raw });
}
