# Writing exam questions

Past papers and practice sets go into the app as Markdown files, imported from
**Admin → Import**. One file is one import: a header saying what the questions
are, then one `##` section per question. The import page checks the file and
shows every problem with its line number before anything is saved.

The parser is `src/lib/questionMarkdown.ts`; its tests
(`questionMarkdown.test.ts`) show more examples.

## A whole file

```markdown
---
title: Block 1.1 UB 2025
block: 1.1
source: ub
year: 2025
subject: Histology
---

## 1
Which bone is a sesamoid bone?

![Lateral knee X-ray](question-images/1.1/knee.jpg)

- [ ] Femur
- [x] Patella
- [ ] Tibia
- [ ] Fibula

> The patella sits inside the quadriceps tendon.

## 2
Subject: Biochemistry
Name the enzyme that unwinds DNA at the replication fork.

Answer: helicase | DNA helicase

> Helicase breaks the hydrogen bonds between the two strands.
```

## The header

Between two `---` lines, one `name: value` per line.

| Field | Needed | What it is |
| --- | --- | --- |
| `title` | yes | the paper's name; it becomes the package title (you can change it before saving) |
| `block` | yes | the study block, like `1.1` |
| `source` | no | where the paper is from, like `ub`, `costraver`, `original` |
| `year` | no | like `2025` |
| `subject` | no | the subject for every question that doesn't set its own |

## A question

Each question starts with a `##` line (the number after it is only for you;
questions keep the file's order). Then, in this order:

1. `Subject: …` (optional): this question's subject, overriding the header.
2. The question text. It can be several lines and paragraphs.
3. An image (optional, at most one): `![what it shows](path)`. The text in
   brackets is read out by screen readers, so describe the picture.
4. Either the options or an answer line:
   - **Multiple choice:** 2 to 8 lines starting `- [ ]`, with exactly one
     `- [x]` for the correct option. An option can be an image instead of
     text: `- [ ] ![A cuboidal cell layer](question-images/1.1/a.jpg)`.
   - **Short answer:** `Answer: main answer | another accepted answer`.
     In practice, an answer that matches one of these (ignoring case,
     accents, spacing and punctuation) is marked right, and students can mark
     their own answer right when it's worded differently. In exams short
     answers aren't scored, since a self-mark can't count toward a best
     score; the accepted answers show in the review.
5. `> explanation` (optional): shown after the question is answered in
   practice mode, and in the review after an exam. Several `>` lines make
   one explanation.

## Images

Images are files in this repo under `public/`, written as their path from
there: `question-images/1.1/knee.jpg` is `public/question-images/1.1/knee.jpg`.
Put new ones in `public/question-images/<block>/` and commit them before
importing (or the preview shows them missing). Web addresses aren't allowed.

SVG diagrams are drawn inline so they follow the light and dark themes: use
the app's colour variables (`var(--text)`, `var(--accent)`…) instead of fixed
colours.

`robots.txt` keeps `/question-images/` out of search engines, but the files
are public to anyone with the address, so a picture alone shouldn't give the
answer away.

## After importing

The import saves the questions and makes two packages from them, both drafts:

- an **exam** package: timed (the suggested time is about a minute per
  question), answers shown only after submitting, and the best score kept;
- a **practice** package: untimed, with the answer and explanation after each
  question.

Open **Admin → Packages** to check them, fix a question (it's edited in this
same Markdown, without the header), set the time, and **Publish**. Editing a
question bumps its revision, and each attempt records the revisions it was
taken with.

Grading happens in the database. An exam attempt never sends the correct
answers or explanations to the browser before it's submitted; a practice
attempt sends them with the questions, for instant feedback.
