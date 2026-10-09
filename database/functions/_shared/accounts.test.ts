import { describe, expect, it } from "vitest";
import { firstPassword, parseAccountAction, studentEmail } from "./accounts.ts";
import * as app from "../../../src/lib/db/client.ts";

describe("admin account requests", () => {
  it("accepts the four actions and nothing else", () => {
    expect(parseAccountAction({ action: "activate", student_ids: ["2601", "2602", "2601"] })).toEqual({ action: "activate", student_ids: ["2601", "2602"] });
    expect(parseAccountAction({ action: "activate", student_ids: ["2601", "bad id"] })).toBeNull();
    expect(parseAccountAction({ action: "lock", user_id: "00000000-0000-0000-0000-000000000001" })).toMatchObject({ action: "lock" });
    expect(parseAccountAction({ action: "delete", user_id: "00000000-0000-0000-0000-000000000001" })).toBeNull();
    expect(parseAccountAction({ action: "reset", user_id: "x" })).toBeNull();
  });
  it("matches the app's sign-in address and first password", () => {
    expect(studentEmail(" 2601ABC ")).toBe(app.studentEmail(" 2601ABC "));
    expect(app.isFirstPassword("2601", firstPassword("2601"))).toBe(true);
  });
});
