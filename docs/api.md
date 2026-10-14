# API

One Vercel Function ([`api/index.ts`](../api/index.ts)) serves `/api/*`; the routes are in
[`server/app.ts`](../server/app.ts).

| Route | |
| --- | --- |
| `/api/auth/*` | Better Auth: sign-in (`/sign-in/email`), sign-out, change password, session, Google |
| `POST /api/rpc/<name>` | the app's functions, below |
| `POST /api/ai/explain`, `/api/ai/chat` | AI answers, streamed as plain text (needs sign-in; daily allowance) |
| `POST /api/drive-sync` | one step of the Drive sync (the `x-sync-secret` header, or an admin) |
| `GET /api/config` | what the site has switched on |

`POST /api/rpc/<name>` takes a JSON object and answers `{ "data": … }` or `{ "error": "code" }` with an HTTP status
(401 `not_signed_in`, 403 `admins_only` / `locked` / `not_on_roster`, 400 for a refused argument). Argument names
start with `p_`.

**Student functions:** `my_account`, `update_my_settings`, `password_changed`, `leaderboard`, `save_readiness`,
`class_readiness`, `record_reviews`, `record_quiz`, `finish_chapter`, `record_study_day`, `user_state_list`,
`user_state_save`, `package_summaries`, `my_attempts`, `start_attempt`, `get_attempt`, `save_attempt`,
`take_over_attempt`, `submit_attempt`, `abandon_attempt`, `get_attempt_result`, `bank_options`,
`start_bank_practice`, `bookmark_ids`, `set_bookmark`, `my_bookmarks`, `drive_files`, and the schedule: `schedule_events`,
`schedule_groups`, `schedule_docs`, `lecturers`, `report_lecturer`.

**Admin functions** (refused for anyone else): `admin_list_roster`, `admin_add_students`, `admin_set_track`,
`admin_remove_student`, `admin_set_role`, `admin_accounts` (activate, lock, unlock, reset), `admin_audit_log`,
`admin_search_questions`, `admin_question_facets`, `admin_update_question`, `admin_delete_question`,
`admin_import_questions`, `admin_package_questions`, `admin_packages_from_import`, `admin_set_package_status`,
`admin_update_package`, `admin_delete_package`, `admin_drive_files`, `admin_set_file_order`,
`admin_set_file_hidden`, `admin_sync_runs`, `admin_save_events`, `admin_delete_events`,
`admin_save_lecturer`, `admin_delete_lecturer`, `admin_save_schedule_doc`,
`admin_delete_schedule_doc`, `admin_lecturer_reports`, `admin_resolve_report`.

Exams and quizzes are graded on the server; the browser only sends what the student chose.

Tests: `npm test` runs everything; the API's integration tests need `MONGODB_TEST_URI` (a throwaway MongoDB; each run
makes and drops its own database).
