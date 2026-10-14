import { describe, expect, it } from "vitest";
import type { SyncRunRow } from "./admin";
import { syncAlarm } from "./syncAlarm";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const run = (status: SyncRunRow["status"], h: number): SyncRunRow => ({
  id: `${status}-${h}`,
  status,
  started_by: "schedule",
  files_found: 0,
  files_added: 0,
  files_updated: 0,
  files_missing: 0,
  calls: 0,
  notes: {},
  error: null,
  started_at: hoursAgo(h),
  finished_at: hoursAgo(h),
});

describe("syncAlarm", () => {
  it("says never when nothing has ever run", () => {
    expect(syncAlarm([], NOW)).toBe("never");
  });
  it("says never when only failed runs exist before any good one", () => {
    expect(syncAlarm([run("running", 1), run("failed", 30)], NOW)).toBe("never");
  });
  it("is quiet after a recent good run", () => {
    expect(syncAlarm([run("done", 5), run("done", 29)], NOW)).toBeNull();
  });
  it("warns when the last good run is over 48 hours old", () => {
    expect(syncAlarm([run("done", 49)], NOW)).toBe("stale");
  });
  it("warns about a held run first, even after a recent good one", () => {
    expect(syncAlarm([run("held", 1), run("done", 20)], NOW)).toBe("held");
  });
  it("warns about a failed latest run", () => {
    expect(syncAlarm([run("failed", 1), run("done", 20)], NOW)).toBe("failed");
  });
  it("ignores a sync still running", () => {
    expect(syncAlarm([run("running", 0), run("done", 20)], NOW)).toBeNull();
  });
});
