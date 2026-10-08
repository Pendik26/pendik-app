import { describe, expect, it } from "vitest";
import { markdownToPlainText, splitMarkdownSections, truncate } from "./textExtract";

describe("markdownToPlainText", () => {
  it("strips heading markers", () => {
    expect(markdownToPlainText("## Epithelial Tissue")).toBe("Epithelial Tissue");
  });

  it("strips bold and italic emphasis but keeps the text", () => {
    expect(markdownToPlainText("**Simple squamous** is *flat*.")).toBe("Simple squamous is flat.");
  });

  it("unwraps markdown links to their label", () => {
    expect(markdownToPlainText("See [the AHA](https://heart.org) for more.")).toBe(
      "See the AHA for more.",
    );
  });

  it("strips list markers", () => {
    expect(markdownToPlainText("- first\n- second")).toBe("first second");
  });

  it("removes an entire embedded <svg> block, including its coordinate data", () => {
    const md = 'Before.\n<figure><svg viewBox="0 0 10 10"><rect x="1" y="2" /></svg><figcaption>A diagram.</figcaption></figure>\nAfter.';
    const text = markdownToPlainText(md);
    expect(text).not.toContain("viewBox");
    expect(text).not.toContain("rect");
    expect(text).toContain("Before.");
    expect(text).toContain("A diagram.");
    expect(text).toContain("After.");
  });

  it("collapses repeated whitespace and trims the result", () => {
    expect(markdownToPlainText("  a\n\n\n  b  ")).toBe("a b");
  });
});

describe("splitMarkdownSections", () => {
  it("splits on ## headings and drops the H1 title line", () => {
    const md = "# Chapter 1\n\nIntro text.\n\n## First\nbody one\n\n## Second\nbody two";
    const sections = splitMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("First");
    expect(sections[0].body).toContain("body one");
    expect(sections[1].heading).toBe("Second");
    expect(sections[1].body).toContain("body two");
  });

  it("returns an empty array when there are no ## headings", () => {
    expect(splitMarkdownSections("# Just a title\n\nNo sections here.")).toEqual([]);
  });
});

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  it("truncates long text and appends an ellipsis", () => {
    const result = truncate("a".repeat(30), 10);
    expect(result).toBe(`${"a".repeat(10)}…`);
  });
});
