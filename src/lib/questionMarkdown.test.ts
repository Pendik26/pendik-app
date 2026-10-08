import { describe, expect, it } from "vitest";
import { parseQuestionMarkdown, questionMarkdown } from "./questionMarkdown";

const file = `---
title: Block 1.1 UB 2025
block: 1.1
source: ub
year: 2025
subject: Histology
---

## 1
Subject: Anatomy
Which bone is a sesamoid bone?

It sits in a tendon.

![Lateral knee X-ray](/question-images/1.1/knee.jpg)

- [ ] Femur
- [x] Patella

> The patella sits inside the quadriceps tendon.
> It is the largest sesamoid bone.

## 2
Name the cells lining the thyroid follicles.

Answer: follicular cells | thyrocytes
`;

describe("parseQuestionMarkdown", () => {
  it("reads the header, choice and short-answer questions", () => {
    const { header, questions, problems } = parseQuestionMarkdown(file);
    expect(problems).toEqual([]);
    expect(header).toEqual({ title: "Block 1.1 UB 2025", block: "1.1", source: "ub", year: 2025, subject: "Histology" });
    expect(questions).toHaveLength(2);
    expect(questions[0]).toEqual({
      block: "1.1",
      source: "ub",
      year: 2025,
      subject: "Anatomy",
      type: "single_choice",
      stem: "Which bone is a sesamoid bone?\n\nIt sits in a tendon.",
      stem_image: "question-images/1.1/knee.jpg",
      stem_image_alt: "Lateral knee X-ray",
      options: [{ text: "Femur", image: null }, { text: "Patella", image: null }],
      correct_index: 1,
      accepted_answers: null,
      explanation: "The patella sits inside the quadriceps tendon.\nIt is the largest sesamoid bone.",
    });
    expect(questions[1]).toMatchObject({ type: "short_answer", subject: "Histology", accepted_answers: ["follicular cells", "thyrocytes"], options: null });
  });

  it("lists problems with line numbers and leaves those questions out", () => {
    const bad = `---
title: T
block: 1.1
---

## 1
No correct option
- [ ] A
- [ ] B

## 2
Two correct
- [x] A
- [x] B

## 3
Fine
- [x] A
- [ ] B

## 4
- [x] Only an option
- [ ] B
`;
    const { questions, problems } = parseQuestionMarkdown(bad);
    expect(questions.map((q) => q.stem)).toEqual(["Fine"]);
    expect(problems.map((p) => p.line)).toEqual([6, 11, 21]);
    expect(problems[0].message).toMatch(/exactly one/);
    expect(problems[2].message).toMatch(/no text/);
  });

  it("needs a header with a title and block, and refuses image addresses outside the repo", () => {
    expect(parseQuestionMarkdown("## 1\nQ\n- [x] A\n- [ ] B").problems[0].message).toMatch(/header/);
    expect(parseQuestionMarkdown("---\ntitle: T\nblock: one\n---\n## 1\nQ\n- [x] A\n- [ ] B").problems[0].message).toMatch(/block like 1.1/);
    const remote = parseQuestionMarkdown("---\ntitle: T\nblock: 1.1\n---\n## 1\nQ\n![x](https://evil.example/a.png)\n- [x] A\n- [ ] B");
    expect(remote.problems[0].message).toMatch(/paths in the repo/);
  });

  it("writes a file the parser reads back the same", () => {
    const { header, questions } = parseQuestionMarkdown(file);
    if (!header) throw new Error("no header");
    expect(parseQuestionMarkdown(questionMarkdown(header, questions)).questions).toEqual(questions);
  });
});
