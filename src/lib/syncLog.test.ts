import { describe, expect, it } from "vitest";
import type { SyncRunRow } from "./admin";
import { logTime, runLog } from "./syncLog";

const run: SyncRunRow = {
  id: "abcdef12-0000", status: "held", started_by: "admin", files_found: 100, files_added: 3, files_updated: 2, files_missing: 40,
  calls: 4, notes: { reason: "too_many_missing", unseen: 40 }, error: null, started_at: "2026-01-01T10:00:00.000Z", finished_at: "2026-01-01T10:00:09.000Z",
};

describe("sync log", () => {
  it("lists what a run did, how long it took and its notes", () => {
    const lines = runLog(run);
    expect(lines[0]).toContain("abcdef12");
    expect(lines).toContain("finished 2026-01-01T10:00:09.000Z  took 9s");
    expect(lines).toContain("reason: too_many_missing");
    expect(lines).toContain("unseen: 40");
  });
  it("says when a run has not finished and shows its error", () => {
    const lines = runLog({ ...run, finished_at: null, error: "Left unfinished" });
    expect(lines).toContain("not finished");
    expect(lines.at(-1)).toBe("error: Left unfinished");
  });
  it("formats the time as HH:MM:SS", () => {
    expect(logTime(new Date(2026, 0, 1, 9, 5, 7))).toBe("09:05:07");
  });
});
