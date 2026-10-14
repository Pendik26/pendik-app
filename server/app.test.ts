import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testApp } from "./testApp.js";
import { ensureFirstAdmin } from "./people.js";
import { POINTS } from "./study.js";

// The whole API on a real MongoDB. Runs when MONGODB_TEST_URI is set (CI starts one); skipped otherwise.
const uri = process.env.MONGODB_TEST_URI;
const run = uri ? describe : describe.skip;

type T = Awaited<ReturnType<typeof testApp>>;

run("the API", () => {
  let t: T;
  beforeAll(async () => { t = await testApp(uri as string); });
  afterAll(async () => { await t.close(); });

  const request = (path: string, init: { body?: unknown; cookie?: string; headers?: Record<string, string>; method?: string } = {}) =>
    t.app(new Request(`http://localhost${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", origin: "http://localhost", ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }));

  async function signIn(nim: string, password: string): Promise<string | null> {
    const res = await request("/api/auth/sign-in/email", { body: { email: `${nim.toLowerCase()}@pendik26.internal`, password } });
    if (!res.ok) return null;
    return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }

  async function call(cookie: string, fn: string, args: object = {}) {
    const res = await request(`/api/rpc/${fn}`, { body: args, cookie });
    const body = (await res.json()) as { data?: any; error?: string };
    return { status: res.status, ...body };
  }

  it("has no sign-up and no function without a session", async () => {
    const signUp = await request("/api/auth/sign-up/email", { body: { email: "x@y.z", password: "password123", name: "X" } });
    expect(signUp.ok).toBe(false);
    expect((await request("/api/rpc/my_account", { body: {} })).status).toBe(401);
  });

  let admin = "";
  let student = "";

  it("makes the first admin once, who signs in with the first password and must change it", async () => {
    expect(await ensureFirstAdmin(t.c, t.auth, { nim: "A100", fullName: "Ada Admin" })).toBe(true);
    expect(await ensureFirstAdmin(t.c, t.auth, { nim: "B200", fullName: "Not Admin" })).toBe(false);
    expect(await signIn("A100", "wrong-password")).toBeNull();
    admin = (await signIn("A100", "pendik26A100")) ?? "";
    expect(admin).not.toBe("");
    const me = await call(admin, "my_account");
    expect(me.data).toMatchObject({ student_id: "A100", full_name: "Ada Admin", role: "admin", must_change_password: true });
  });

  it("sets tutorial groups by id without names and reports unknown ids", async () => {
    await call(admin, "admin_add_students", { p_rows: [{ student_id: "S301", full_name: "Gita Group", cohort: "2026" }] });
    const done = await call(admin, "admin_set_groups", { p_rows: [{ student_id: "S301", class_group: "2", track: "REGULER" }, { student_id: "NOPE2", class_group: "1" }] });
    expect(done.data).toEqual({ updated: 1, unknown: ["NOPE2"] });
    const roster = (await call(admin, "admin_list_roster")).data as { student_id: string; class_group: string | null; track: string | null }[];
    expect(roster.find((r) => r.student_id === "S301")).toMatchObject({ class_group: "2", track: "REGULER", class_section: null });
    await call(admin, "admin_set_groups", { p_rows: [{ student_id: "S301", class_group: "B4", track: "REGULER" }] });
    const again = (await call(admin, "admin_list_roster")).data as { student_id: string; class_group: string | null; class_section: string | null }[];
    expect(again.find((r) => r.student_id === "S301")).toMatchObject({ class_group: "B4", class_section: "B" });
    await call(admin, "admin_set_groups", { p_rows: [{ student_id: "S301", class_group: "IUP A", track: "IUP", class_section: "A" }] });
    // IUP is one class (IUP A and IUP B are tutorial groups), so a section given for it is dropped.
    expect(((await call(admin, "admin_list_roster")).data as { student_id: string; class_section: string | null }[]).find((r) => r.student_id === "S301")?.class_section).toBeNull();
    expect((await call(admin, "admin_set_groups", { p_rows: [] })).error).toBe("bad_rows");
  });

  it("stores an admin's picture and shows it to signed-in students only", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const send = (cookie: string, body: Uint8Array) =>
      t.app(new Request("http://localhost/api/question-image?name=q.png", { method: "POST", headers: { origin: "http://localhost", cookie }, body: new Uint8Array(body) }));
    const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    expect((await send(admin, svg)).status).toBe(400);
    const ok = await send(admin, png);
    expect(ok.status).toBe(200);
    const { data: { path } } = (await ok.json()) as { data: { path: string } };
    const shown = await t.app(new Request(`http://localhost/${path}`, { headers: { cookie: admin } }));
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/png");
    expect((await t.app(new Request(`http://localhost/${path}`))).status).toBe(401);
  });

  it("imports lecturers in bulk, merging numbers for a name already listed", async () => {
    const rows = [{ name: "Test Lecturer", phones: ["0811111111", "bad"] }, { name: "No Number", phones: ["x"] }];
    expect((await call(admin, "admin_import_lecturers", { p_rows: rows })).data).toEqual({ added: 1, updated: 0, skipped: ["Test Lecturer", "No Number"] });
    const again = await call(admin, "admin_import_lecturers", { p_rows: [{ name: "Test Lecturer", phones: ["0822222222"] }] });
    expect(again.data).toMatchObject({ added: 0, updated: 1 });
    const list = (await call(admin, "lecturers")).data as { name: string; phones: string[] }[];
    expect(list.find((l) => l.name === "Test Lecturer")?.phones).toEqual(["+62811111111", "+62822222222"]);
    expect((await call(admin, "admin_import_lecturers", { p_rows: [] })).error).toBe("bad_rows");
  });

  it("lets an admin add students, activate them, and lock or reset an account", async () => {
    await call(admin, "admin_add_students", { p_rows: [{ student_id: "S300", full_name: "Sari Student", class_group: "A", cohort: "2026", track: "IUP" }] });
    const activated = await call(admin, "admin_accounts", { action: "activate", student_ids: ["S300", "NOPE1"] });
    expect(activated.data.results).toEqual([
      { student_id: "S300", ok: true },
      { student_id: "NOPE1", ok: false, message: "not on the roster" },
    ]);
    student = (await signIn("S300", "pendik26S300")) ?? "";
    expect(student).not.toBe("");
    expect((await call(student, "admin_list_roster")).error).toBe("admins_only");

    const roster = (await call(admin, "admin_list_roster")).data as { student_id: string; account: string; user_id: string | null }[];
    const sari = roster.find((r) => r.student_id === "S300");
    expect(sari?.account).toBe("active");
    await call(admin, "admin_accounts", { action: "lock", user_id: sari?.user_id });
    expect((await call(student, "my_account")).error).toBe("not_signed_in");
    expect(await signIn("S300", "pendik26S300")).toBeNull();
    await call(admin, "admin_accounts", { action: "unlock", user_id: sari?.user_id });
    student = (await signIn("S300", "pendik26S300")) ?? "";
    expect(student).not.toBe("");
  });

  it("refuses an admin changing their own role", async () => {
    const me = (await call(admin, "my_account")).data;
    expect((await call(admin, "admin_set_role", { p_user_id: me.id, p_role: "student" })).error).toBe("not_on_yourself");
  });

  it("syncs student state, skipping unchanged values and refusing bad keys", async () => {
    const first = await call(student, "user_state_save", { p_rows: [{ key: "settings", value: { a: 1 } }, { key: "cards:1.1/biochem", value: [1, 2] }], p_cleared: [] });
    expect(first.status).toBe(200);
    const before = (await call(student, "user_state_list")).data as { key: string; updated_at: string }[];
    expect(before.map((r) => r.key)).toEqual(["cards:1.1/biochem", "settings"]);
    await new Promise((r) => setTimeout(r, 20));
    await call(student, "user_state_save", { p_rows: [{ key: "settings", value: { a: 1 } }], p_cleared: ["cards:1.1/biochem"] });
    const after = (await call(student, "user_state_list")).data as { key: string; updated_at: string }[];
    expect(after.map((r) => r.key)).toEqual(["settings"]);
    expect(after[0].updated_at).toBe(before.find((r) => r.key === "settings")?.updated_at);
    expect((await call(student, "user_state_save", { p_rows: [{ key: "BAD KEY", value: 1 }], p_cleared: [] })).error).toBe("bad_rows");
  });

  it("scores study records on the server: reviews on two days, quizzes once a day, chapters once", async () => {
    const card = { kind: "flashcard", deck: "1.1/biochem", item: "bio-001" };
    expect((await call(student, "record_reviews", { p_items: [card, card, { ...card, item: "nope" }] })).data).toBe(1);
    expect((await call(student, "record_reviews", { p_items: [card] })).data).toBe(0);
    const quiz = await call(student, "record_quiz", { p_answers: [{ deck: "1.1/biochem", item: "nope", choice: 0 }] });
    expect(quiz.data).toEqual({ correct: 0, total: 0 });
    // Learned needs a second day: the points stay at the study day's.
    const board = await call(student, "leaderboard", { p_period: "all" });
    expect(board.data.me.points).toBe(POINTS.days);
    expect((await call(student, "finish_chapter", { p_deck: "1.1/biochem", p_chapter: "nope" })).error).toBe("no_such_chapter");
  });

  it("runs an exam: keys stay hidden, answers are graded on the server, results earn points once", async () => {
    const importId = (await call(admin, "admin_import_questions", {
      p_title: "Paper",
      p_source_text: "…",
      p_questions: [
        { type: "single_choice", block: "1.1", stem: "2+2?", options: [{ text: "3" }, { text: "4" }], correct_index: 1 },
        { type: "short_answer", block: "1.1", stem: "Capital of France?", accepted_answers: ["Paris"] },
      ],
    })).data as string;
    const made = (await call(admin, "admin_packages_from_import", {
      p_import_id: importId, p_exam_title: "Exam", p_practice_title: "Practice", p_block: "1.1", p_source: null, p_year: 2024, p_time_limit_minutes: 30, p_track_best: true,
    })).data;
    expect(made.question_count).toBe(2);
    const drafts = (await call(admin, "admin_search_questions", { p_status: "draft" })).data;
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ status: "draft", revision: expect.any(Number), created_at: expect.any(String), updated_at: expect.any(String) });
    expect((await call(admin, "admin_search_questions", { p_status: "published" })).data).toEqual([]);
    // Earlier imports list what each still has and how many packages use it.
    expect((await call(admin, "admin_imports")).data[0]).toMatchObject({ id: importId, title: "Paper", question_count: 2, block: "1.1", year: null, package_count: 2 });
    // A form's own ids make a retry harmless: the second save is refused.
    const formImport = "6b0c8f0e-4d1a-4f43-9e55-0c7d2b0d9a11";
    const again = { p_title: "Retry", p_source_text: "…", p_import_id: formImport, p_questions: [{ type: "short_answer", block: "1.1", stem: "Again?", accepted_answers: ["yes"] }] };
    expect((await call(admin, "admin_import_questions", again)).status).toBe(200);
    expect((await call(admin, "admin_import_questions", again)).error).toBe("already_saved");
    const pkgIds = { p_exam_id: "0a1b2c3d-0000-4000-8000-000000000001", p_practice_id: "0a1b2c3d-0000-4000-8000-000000000002" };
    const pkgArgs = { p_import_id: formImport, p_exam_title: "E", p_practice_title: "P", p_block: "1.1", p_source: null, p_year: null, p_time_limit_minutes: 10, p_track_best: true, ...pkgIds };
    expect((await call(admin, "admin_packages_from_import", pkgArgs)).status).toBe(200);
    expect((await call(admin, "admin_packages_from_import", pkgArgs)).error).toBe("already_saved");
    expect((await call(admin, "admin_import_questions", { ...again, p_import_id: "nope" })).error).toBe("bad_id");
    await call(admin, "admin_delete_package", { p_package_id: pkgIds.p_exam_id });
    await call(admin, "admin_delete_package", { p_package_id: pkgIds.p_practice_id });
    expect((await call(student, "package_summaries")).data).toEqual([]);
    expect((await call(admin, "admin_set_package_status", { p_package_id: made.exam_id, p_status: "published" })).status).toBe(200);
    const visible = (await call(student, "package_summaries")).data;
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ title: "Exam", question_count: 2, mode: "exam" });

    const holder = "tab-one-holder";
    const started = (await call(student, "start_attempt", { p_package_id: made.exam_id, p_holder: holder })).data;
    expect(started.resumed).toBe(false);
    expect((await call(student, "start_attempt", { p_package_id: made.exam_id, p_holder: holder })).data).toEqual({ attempt_id: started.attempt_id, resumed: true });
    const running = (await call(student, "get_attempt", { p_attempt_id: started.attempt_id, p_holder: holder })).data;
    expect(running.holder_state).toBe("you");
    expect(running.questions).toHaveLength(2);
    for (const q of running.questions) expect(q).not.toHaveProperty("correct");
    expect((await call(student, "get_attempt", { p_attempt_id: started.attempt_id, p_holder: "another-tab-holder" })).data.questions).toBeNull();
    expect((await call(student, "save_attempt", { p_attempt_id: started.attempt_id, p_holder: "another-tab-holder", p_answers: {}, p_flagged: [], p_tab_leaves: 0 })).error).toBe("held_elsewhere");

    const choice = running.questions.find((q: any) => q.type === "single_choice");
    const rightPosition = choice.options.findIndex((o: any) => o.text === "4");
    const answers = { [choice.id]: { choice: rightPosition } };
    await call(student, "submit_attempt", { p_attempt_id: started.attempt_id, p_holder: holder, p_answers: answers });
    const result = (await call(student, "get_attempt_result", { p_attempt_id: started.attempt_id })).data;
    expect(result).toMatchObject({ correct_count: 1, wrong_count: 0, blank_count: 0 });
    expect(result.score).toBe(100);
    expect(result.questions.find((q: any) => q.id === choice.id).correct).toBe(rightPosition);
    // 5 for the study day, 1 for the right answer.
    expect((await call(student, "leaderboard", { p_period: "all" })).data.me.points).toBe(POINTS.days + POINTS.exam);
    expect((await call(admin, "get_attempt_result", { p_attempt_id: started.attempt_id })).status).toBe(200);
    expect((await call(student, "my_attempts")).data[0]).toMatchObject({ status: "finished", score: 100 });

    // A practice can be shortened and given its own timer; an exam ignores both.
    await call(admin, "admin_set_package_status", { p_package_id: made.practice_id, p_status: "published" });
    expect((await call(student, "start_attempt", { p_package_id: made.practice_id, p_holder: holder, p_count: 0 })).error).toBe("bad_count");
    const short = (await call(student, "start_attempt", { p_package_id: made.practice_id, p_holder: holder, p_count: 1, p_time_limit_minutes: 5 })).data;
    const shortRun = (await call(student, "get_attempt", { p_attempt_id: short.attempt_id, p_holder: holder })).data;
    expect(shortRun.questions).toHaveLength(1);
    expect(shortRun.seconds_left).toBeGreaterThan(290);
    expect(shortRun.seconds_left).toBeLessThanOrEqual(300);
  });

  it("keeps the leaderboard to students who joined, and shows the class average from 3 students", async () => {
    expect((await call(student, "leaderboard", { p_period: "week" })).data.rows).toEqual([]);
    await call(student, "update_my_settings", { p_leaderboard_joined: true });
    const board = (await call(student, "leaderboard", { p_period: "week" })).data;
    expect(board.rows).toEqual([{ rank: 1, name: "Sari Student", cohort: "2026", value: POINTS.days + POINTS.exam, me: true }]);
    await call(student, "save_readiness", { p_block: "1.1", p_value: 70 });
    expect((await call(student, "class_readiness", { p_block: "1.1" })).data).toEqual({ cohort: "2026", count: 1, average: null });
  });

  it("serves the Drive to signed-in students only, and runs a sync only for the secret or an admin", async () => {
    await t.c.driveFiles.insertMany([
      { _id: "1", drive_file_id: "f1", title: "A.pdf", kind: "pdf", folder_path: ["BLOK 1.1"], missing_since: null, hidden_at: null, sort_order: null, track: null, size_bytes: 1, drive_modified_at: null, created_at: "2026-01-01", synced_at: "2026-01-01" } as never,
      { _id: "2", drive_file_id: "f2", title: "Hidden.pdf", kind: "pdf", folder_path: [], missing_since: null, hidden_at: "2026-01-01", sort_order: null, track: null, size_bytes: 1, drive_modified_at: null, created_at: "2026-01-01", synced_at: "2026-01-01" } as never,
    ]);
    expect((await call(student, "drive_files")).data.map((f: any) => f.title)).toEqual(["A.pdf"]);
    expect((await request("/api/drive-sync", { body: {} })).status).toBe(401);
    expect((await request("/api/drive-sync", { body: {}, cookie: student })).status).toBe(403);
    expect((await request("/api/drive-sync", { body: {}, headers: { "x-sync-secret": "sync-secret" } })).status).toBe(503);
  });

  it("changes a password with Better Auth and clears the forced change", async () => {
    const res = await request("/api/auth/change-password", { body: { currentPassword: "pendik26S300", newPassword: "a-new-password-1" }, cookie: student });
    expect(res.ok).toBe(true);
    await call(student, "password_changed");
    expect((await call(student, "my_account")).data.must_change_password).toBe(false);
    expect(await signIn("S300", "pendik26S300")).toBeNull();
    expect(await signIn("S300", "a-new-password-1")).not.toBeNull();
  });
});
