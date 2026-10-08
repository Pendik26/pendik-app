import { describe, expect, it } from "vitest";
import { buildFromContent, buildKnowledgeGraph, cleanTerm, splitSections, termKey } from "./build";
import { nodeMastery } from "./mastery";
import { renderMarkdown } from "../markdownHtml";

describe("concept terms", () => {
  it("keeps bold concepts and drops labels, numbers and filler", () => {
    expect(cleanTerm("Radial nerve (C5–T1)")).toEqual({ key: "radial nerve", label: "Radial nerve" });
    expect(cleanTerm("Desmosomes")?.key).toBe("desmosome");
    for (const junk of ["Procedure:", "8.5 V", "Through the", "Directly", "Thick", "C5–T1", "(about", "Nuclei peripheral?", "OL = transverse"]) expect(cleanTerm(junk), junk).toBeNull();
    expect(termKey("Sesamoid Bones")).toBe("sesamoid bone");
  });

  it("gives sections the same anchors the reader renders", () => {
    const md = "# Bones\n\nIntro\n\n## Shapes\n\ntext\n\n## Shapes\n\nmore\n\n### The **patella**\n";
    const anchors = splitSections(md).map((s) => s.anchor);
    const rendered = [...renderMarkdown(md).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toEqual(rendered);
    expect(anchors).toEqual(["bones", "shapes", "shapes-2", "the-patella"]);
  });
});

describe("building the map", () => {
  const md = (body: string) => `# Chapter\n\n${body}`;
  const input = {
    chapters: new Map([
      ["8.1/histology/ch1", md("## Junctions\n\n**Desmosomes** anchor cells in the **epidermis**.\n\nThe **epidermis** has desmosomes.\n\nDesmosomes and epidermis again.")],
      ["8.2/anatomy/ch1", md("## Skin\n\nThe **epidermis** covers the body over the **dermis**.\n\nEpidermis on dermis.\n\nThe dermis lies under the epidermis.")],
    ]),
    summaries: new Map<string, string>(),
    occlusion: new Map(),
    relations: new Map([["desmosome|epidermis", "found in"]]),
    minMentions: 1,
  };

  it("joins the same concept from two blocks into one node, with its sections", () => {
    const g = buildKnowledgeGraph(input);
    const epidermis = g.nodes.find((n) => n.id === "epidermis")!;
    expect(epidermis.label).toBe("Epidermis");
    expect(epidermis.subjects.sort()).toEqual(["8.1/histology", "8.2/anatomy"]);
    expect(epidermis.sections.map((s) => s.c).sort()).toEqual(["8.1/histology/ch1", "8.2/anatomy/ch1"]);
    expect(epidermis.sections[0].a).toMatch(/junctions|skin/);
  });

  it("links concepts that come up together, with AI labels when there are any", () => {
    const g = buildKnowledgeGraph(input);
    const name = (i: number) => g.nodes.at(i)?.id;
    const links = g.edges.map((e) => [name(e.s), name(e.t)].sort().join("|"));
    expect(links).toContain("dermis|epidermis");
    expect(links).toContain("desmosome|epidermis");
    expect(g.edges.find((e) => [name(e.s), name(e.t)].includes("desmosome"))?.rel).toBe("found in");
    expect(g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it("lays the map out the same way every time", () => {
    expect(JSON.stringify(buildKnowledgeGraph(input))).toBe(JSON.stringify(buildKnowledgeGraph(input)));
  });
});

describe("the course's map", () => {
  it("covers every block and joins subjects", async () => {
    const g = await buildFromContent();
    expect(g.nodes.length).toBeGreaterThan(200);
    const blocks = new Set(g.nodes.flatMap((n) => n.subjects.map((s) => s.split("/")[0])));
    expect(blocks.has("1.1") && blocks.has("1.2")).toBe(true);
    const bridging = g.nodes.filter((n) => new Set(n.subjects.map((s) => s.split("/")[0])).size > 1);
    expect(bridging.length).toBeGreaterThan(10);
  }, 60_000);
});

describe("mastery on the map", () => {
  it("averages the cards, labels and quiz questions about a concept", () => {
    const node = { cards: { "1.2/anatomy": ["a", "b"] }, labels: {}, questions: { "1.2/anatomy": ["q1", "q2"] } } as never;
    const state = {
      cards: { "1.2/anatomy": { a: { interval: 21, easeFactor: 2.5, dueDate: "", reps: 3, lapses: 0 } } },
      labels: {},
      quiz: { "1.2/anatomy": { missed: new Set(["q2"]), taken: true } },
    };
    expect(nodeMastery(node, state)).toBeCloseTo((1 + 1 + 0) / 3);
    expect(nodeMastery(node, { cards: {}, labels: {}, quiz: {} })).toBeNull();
  });
});
