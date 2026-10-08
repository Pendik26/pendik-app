import { describe, expect, it } from "vitest";
import { groupByBlock } from "./blocks";

describe("groupByBlock", () => {
  it("buckets subjects into the block their content folder is in, in block order", () => {
    const subjects = [
      { id: "physiology", blockId: "1.2" },
      { id: "histology", blockId: "1.1" },
      { id: "physiology", blockId: "1.1" },
    ];
    const groups = groupByBlock(subjects);
    expect(groups.map((g) => g.block.id)).toEqual(["1.1", "1.2", "1.3"]);
    expect(groups[0].subjects.map((s) => s.id)).toEqual(["histology", "physiology"]);
    expect(groups[1].subjects.map((s) => s.id)).toEqual(["physiology"]);
  });

  it("includes a block with only upcoming subjects, with no real subjects", () => {
    const groups = groupByBlock([]);
    const block12 = groups.find((g) => g.block.id === "1.2")!;
    expect(block12.subjects).toEqual([]);
    expect(block12.upcoming.map((u) => u.id)).toEqual(["anatomy"]);

    const block13 = groups.find((g) => g.block.id === "1.3")!;
    expect(block13.upcoming.map((u) => u.id)).toEqual(["gi-metabolism"]);
  });

  it("hides an upcoming placeholder once that subject has real content in the list", () => {
    const block12 = groupByBlock([{ id: "anatomy", blockId: "1.2" }]).find((g) => g.block.id === "1.2")!;
    expect(block12.subjects.map((s) => s.id)).toEqual(["anatomy"]);
    expect(block12.upcoming).toEqual([]);
  });

  it("drops a block that has neither real nor upcoming subjects", () => {
    const groups = groupByBlock([{ id: "histology", blockId: "1.1" }]);
    for (const g of groups) {
      expect(g.subjects.length > 0 || g.upcoming.length > 0).toBe(true);
    }
  });

  it("ignores a subject whose block isn't configured", () => {
    const groups = groupByBlock([{ id: "mystery", blockId: "9.9" }]);
    expect(groups.flatMap((g) => g.subjects.map((s) => s.id))).not.toContain("mystery");
  });
});
