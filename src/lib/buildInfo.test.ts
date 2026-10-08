import { describe, expect, it } from "vitest";
import { versionFromCount } from "../../scripts/build-info.mjs";
import { BUILD, commitUrl, SOURCE_URL } from "./buildInfo";

describe("version", () => {
  it("counts commits: hundreds are the minor version, the rest the patch", () => {
    expect(versionFromCount(149)).toBe("v0.1.49");
    expect(versionFromCount(7)).toBe("v0.0.7");
    expect(versionFromCount(1000)).toBe("v0.10.0");
    expect(versionFromCount(0)).toBe("v0.0.0");
  });

  it("links the build's commit, or the repository without one", () => {
    expect(commitUrl({ ...BUILD, sha: "abc123" })).toBe(`${SOURCE_URL}/commit/abc123`);
    expect(commitUrl({ ...BUILD, sha: "" })).toBe(SOURCE_URL);
  });
});
