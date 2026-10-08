import { describe, expect, it } from "vitest";
import { blocks, candidatesIn, cardTerm, DEFINITION_SCORE, describeConcepts, plain, tidy } from "./describe";
import { cleanTerm } from "./build";

const keyOf = (bold: string) => cleanTerm(bold)?.key ?? null;
const only = (keys: string[]) => (bold: string) => {
  const k = keyOf(bold);
  return k && keys.includes(k) ? k : null;
};

describe("plain and tidy", () => {
  it("strips Markdown and HTML", () => {
    expect(plain("A **bold** [link](/x) with `code` and <em>tags</em> (see Figure 2).")).toBe("A bold link with code and tags.");
  });

  it("capitalizes, ends with a full stop and cuts long text outside brackets", () => {
    expect(tidy("the outermost layer")).toBe("The outermost layer.");
    const long = `${"word ".repeat(20)}(one. two; three) ${"more ".repeat(60)}end.`;
    const out = tidy(long);
    expect(out.length).toBeLessThanOrEqual(261);
    expect((out.match(/\(/g) ?? []).length).toBe((out.match(/\)/g) ?? []).length);
    expect(out.endsWith("…") || out.endsWith(".")).toBe(true);
  });
});

describe("blocks", () => {
  it("joins wrapped list items and keeps table rows and fences apart", () => {
    const md = "1. **Epimysium**: the outer\n   layer.\n2. **Perimysium**: around fascicles.\n\n| **A** | b |\n```\n**Not** this\n```";
    expect(blocks(md)).toEqual(["**Epimysium**: the outer layer.", "**Perimysium**: around fascicles.", "| **A** | b |"]);
  });
});

describe("candidatesIn", () => {
  it("scores a definition list item highest", () => {
    const [c] = candidatesIn("**Epimysium**: the outermost layer of **dense irregular connective tissue**.", only(["epimysium"]));
    expect(c).toEqual({ key: "epimysium", text: "the outermost layer of dense irregular connective tissue.", score: 3 });
  });

  it("treats '**Term** is …' as a defining sentence and a passing mention as weak", () => {
    const defining = candidatesIn("**Osteology** is the study of bones.", only(["osteology"]));
    expect(defining[0].score).toBeGreaterThanOrEqual(DEFINITION_SCORE);
    const mention = candidatesIn("Strike the **tendon**, not the muscle belly.", only(["tendon"]));
    expect(mention[0].score).toBeLessThan(DEFINITION_SCORE);
  });

  it("ignores a lead-in that introduces a list", () => {
    expect(candidatesIn("**Types**: of muscle:", only(["type"])).filter((c) => c.score === 3)).toEqual([]);
  });

  it("needs words, not just values, in a table row", () => {
    expect(candidatesIn("| **Albumin** | 35–50 g/L |", only(["albumin"]))).toEqual([]);
    expect(candidatesIn("| **Albumin** | the main plasma protein, made in the liver |", only(["albumin"]))).toHaveLength(1);
  });
});

describe("cardTerm", () => {
  it("finds the term a card asks for", () => {
    expect(cardTerm("What is a sarcomere?")).toBe("sarcomere");
    expect(cardTerm("Define the latent period")).toBe("latent period");
    expect(cardTerm("Treppe?")).toBe("Treppe");
  });
});

describe("describeConcepts", () => {
  it("prefers a definition in the concept's own subject, then a flashcard, over mentions", () => {
    const sections = [
      { ref: { c: "1.2/histology/chapter-01", h: "Mentions", a: "mentions" }, subject: "1.2/histology", body: "Cut the **epimysium** with scissors." },
      { ref: { c: "1.2/histology/chapter-02", h: "Sheaths", a: "sheaths" }, subject: "1.2/histology", body: "1. **Epimysium**: the outermost layer of dense irregular connective tissue." },
    ];
    const decks = new Map([["1.2/physiology", [{ id: "c1", front: "What is a sarcomere?", back: "The unit between two Z discs.", tags: [] }]]]);
    const out = describeConcepts(new Set(["epimysium", "sarcomere"]), new Map([["epimysium", "1.2/histology"]]), { sections, decks }, keyOf);
    expect(out.get("epimysium")).toMatchObject({ text: "The outermost layer of dense irregular connective tissue.", from: { a: "sheaths" } });
    expect(out.get("sarcomere")).toMatchObject({ text: "The unit between two Z discs.", score: 2.8 });
  });
});
