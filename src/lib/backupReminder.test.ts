import { describe, expect, it } from "vitest";
import { daysSinceExport, shouldNudgeBackup } from "./backupReminder";

const NOW = new Date(2024, 0, 20);

describe("daysSinceExport", () => {
  it("returns null when never exported", () => {
    expect(daysSinceExport(null, NOW)).toBeNull();
  });

  it("returns null for an unparsable date", () => {
    expect(daysSinceExport("not-a-date", NOW)).toBeNull();
  });

  it("computes whole days elapsed since the export", () => {
    expect(daysSinceExport(new Date(2024, 0, 10).toISOString(), NOW)).toBe(10);
  });
});

describe("shouldNudgeBackup", () => {
  it("never nudges a user with no study activity", () => {
    expect(shouldNudgeBackup(null, false, NOW)).toBe(false);
  });

  it("nudges an active user who has never exported", () => {
    expect(shouldNudgeBackup(null, true, NOW)).toBe(true);
  });

  it("does not nudge a recent export", () => {
    const recent = new Date(2024, 0, 18).toISOString();
    expect(shouldNudgeBackup(recent, true, NOW)).toBe(false);
  });

  it("nudges once the export is stale", () => {
    const stale = new Date(2024, 0, 1).toISOString();
    expect(shouldNudgeBackup(stale, true, NOW)).toBe(true);
  });
});
