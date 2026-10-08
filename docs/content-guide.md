# Content guide

Everything students study lives under `content/` as JSON, Markdown and PDF
files. The app finds them at build time (`import.meta.glob` in
`src/lib/content.ts`), so **adding a file is enough**: no code changes, and
nothing is fetched from a server at runtime. This guide is for anyone adding
or correcting study material.

Before you start, read the [privacy checklist](#privacy-checklist): the repo
is public.

## Where things go

```text
content/
  flashcards/block/{block}/{subject}/deck.json
  occlusion/block/{block}/{subject}/notes.json
  quizzes/block/{block}/{subject}/bank.json
  exams/block/{block}/{package}/bank.json + meta.json
  ebooks/block/{block}/{subject}/meta.json + chapter-NN.md (+ *.pdf)
  summaries/block/{block}/{subject}.md
  modules/block/{block}/{subject}/lecture/*.pdf
                                  practicum/reports/*.pdf
                                  practicum/assistance/*.pdf
  help/meta.json + {page}.md      the in-app help (/docs)
  tips/tips.json                  the tip of the day
  graph/glossary.json             knowledge-map "What it is" lines
  graph/relations.json            generated: knowledge-map link labels
public/
  ebook-figures/{subject}/…       figures used by chapters, quizzes, occlusion
  covers/{block}-{subject}.webp   subject card pictures (800×400)
```

## Blocks and subjects

The **folder path is the subject**: a file under
`content/quizzes/block/1.2/physiology/` belongs to physiology in Block 1.2.
The same subject id in two blocks (physiology in 1.1 and 1.2) is two separate
subjects with their own cards, quizzes and progress.

- The subject's display name is its folder name, capitalised (`biochem` →
  "Biochem"); an ebook's title comes from its `meta.json`.
- Block names live in `src/lib/blocks.ts` (`studyBlocks`), with an optional
  official `examDate`. A new block is one entry there plus its content
  folders; the content test fails for a block id that isn't listed.
- `upcomingSubjects` in the same file shows a "coming soon" card for a subject
  with no content yet. It disappears by itself once content arrives.
- Use short, lower-case ids without spaces: `anatomy`, `gi-metabolism`.

## Flashcards

`content/flashcards/block/{block}/{subject}/deck.json`:

```json
[
  {
    "id": "mphys-001",
    "front": "Define skeletal (striated) muscle.",
    "back": "Tissue of bundles of contractile cells (myofibers) able to contract.",
    "tags": ["structure"],
    "image": "/ebook-figures/physiology/sarcomere.webp"
  }
]
```

- `id` must be unique across **every** deck: review progress is stored by id.
  Use a subject prefix and a number (`mphys-001`), and never reuse or renumber
  an id that has shipped, or students' progress moves to the wrong card.
- `tags` are the topic filters; keep a small, consistent set per deck.
- `image` is optional: a path under `public/`.
- To fix a card's wording, edit it in place and keep its id.

## Quiz banks

`content/quizzes/block/{block}/{subject}/bank.json`:

```json
[
  {
    "id": "q-mphys-001",
    "question": "The connective tissue layer around each muscle fiber is the:",
    "options": ["Epimysium", "Perimysium", "Deep fascia", "Sarcolemma", "Endomysium"],
    "answer": 4,
    "explanation": "Endomysium wraps each fiber; perimysium, each fascicle."
  }
]
```

- `answer` is the **0-based index** of the correct option (4 is the fifth).
- Five options is the house style. The app shuffles questions and options on
  every attempt, so never write "all of the above" or "both A and B".
- Every question needs an `explanation`: say why the answer is right, and
  ideally why the tempting wrong option is wrong.
- `id` must be unique across every bank (a `q-` prefix keeps them apart from
  card ids). Missed-question lists are stored by id.
- A bank with more than 50 questions is split into sections automatically.

### Question images

`image` is an optional HTML string shown above the question:

- An `<img>` pointing into `public/`. Students can tap it to enlarge it.
- Wrap a labelled diagram so it uses the card's full width on a white
  background:

  ```html
  <div class="quiz-photo-diagram quiz-diagram-wide"
    style="aspect-ratio: 1100 / 673;">
    <img src="/ebook-figures/anatomy-quiz/q-anat-002.webp" alt="…"
      loading="lazy" />
  </div>
  ```

- An inline `<svg>` that uses the theme's colours (`var(--accent)`,
  `var(--text)`) so it works in light and dark mode.
- If the figure's own label is the answer, cover it (the anatomy quiz figures
  use a "?") so the picture doesn't give it away.
- Always write `alt` text that describes the figure without the answer.

## Exam packages

A block can offer several timed exams, one folder each:

```text
content/exams/block/1.1/ub2025/bank.json  QuizQuestion[], as above
content/exams/block/1.1/ub2025/meta.json  { "name": "UB 2025", "questions": 80 }
```

- `questions` must equal the number of questions in `bank.json`; the content
  test checks it.
- Packages are listed by name. A block with no packages gets an exam pooled
  from its subjects' quiz banks.
- Past-paper questions are never put in the prerendered pages, search or the
  knowledge map, and their images live under `public/exams/`, which
  `robots.txt` disallows. Keep it that way: don't copy past-paper questions
  into a quiz bank.

## Image occlusion

`content/occlusion/block/{block}/{subject}/notes.json` is a list of figures,
each with the boxes that cover its labels:

```json
{
  "id": "chapter-01-basic_p07_0",
  "image": "/ebook-figures/anatomy/chapter-01-basic_p07_0.webp",
  "width": 1100,
  "height": 673,
  "title": "The median, sagittal, frontal (coronal) and transverse planes",
  "region": "basic",
  "chapter": "/ebooks/1.2/anatomy/chapter-01",
  "masks": [
    { "id": "m0", "x": 310, "y": 6, "w": 60, "h": 42, "label": "Median plane" }
  ]
}
```

- `width`, `height` and the mask boxes are in the image's own pixels.
- `region` must be one of the keys of `REGION_LABELS` in
  `src/lib/occlusion.ts` (`basic`, `embryology`, `trunk`, `cranium`,
  `face-neck`, `upper-limb`, `lower-limb`); add a new one there first.
- `chapter` is the ebook chapter the figure comes from ("Read about this
  figure").
- Each label is its own review card, stored by `{figure id}:{mask id}`: don't
  rename figure or mask ids once they've shipped.
- The content test checks that every image exists, every box is inside its
  image, and ids are unique.

## Ebooks

`content/ebooks/block/{block}/{subject}/`:

```json
{
  "title": "Physiology: Muscle Contraction & Reflexes",
  "description": "Study notes for the Block 1.2 physiology practicum: …",
  "chapters": [
    { "id": "chapter-01", "title": "Skeletal Muscle Structure" },
    { "id": "chapter-02", "title": "How Skeletal Muscle Contracts" }
  ],
  "resources": [
    { "title": "OpenStax Anatomy & Physiology", "url": "https://openstax.org/" }
  ]
}
```

- Each chapter is `chapter-NN.md` matching its `id`, starting with one
  `# Chapter N: Title` heading. Only chapters listed in `meta.json` are shown.
- The description is also the page's search-engine description; keep the
  first 150 characters meaningful.
- A `*.pdf` in the folder is listed beside the chapters.
- Every `##` and `###` heading gets an anchor (`#how-skeletal-muscle-contracts`)
  that the knowledge map and search link to.

### Writing chapters and summaries

- Put key terms in `**bold**`: the knowledge map is built from bold terms (1–5
  words, mentioned 3+ times across the course). Keep a bold term on one line.
- Tables, lists and inline `<svg>` diagrams are fine. Use the theme's CSS
  variables in SVGs so they follow light and dark mode, and give each a
  `<title>` and `<desc>`.
- Figures from the slides go in `public/ebook-figures/{subject}/` as `.webp`,
  in a `<figure>` with a caption that names the source deck and slide:

  ```html
  <figure class="diagram slide-figure">
    <img src="/ebook-figures/physiology/chapter-02-….webp" alt="…"
      loading="lazy" width="1100" height="749" />
    <figcaption>What the figure shows. <span class="figure-source">Slide 15,
      deck name</span></figcaption>
  </figure>
  ```

- Wrap lines at 80 characters (tables are exempt); `npx markdownlint-cli2`
  checks this and the other Markdown rules.

## Summaries

`content/summaries/block/{block}/{subject}.md`: one Markdown page per subject,
the same rules as chapters. It is the short version of the subject for
revision, shown under **Summaries** and used by "Explain this".

## Modules (lecture and practicum PDFs)

```text
content/modules/block/{block}/{subject}/lecture/*.pdf
content/modules/block/{block}/{subject}/practicum/reports/*.pdf
content/modules/block/{block}/{subject}/practicum/assistance/*.pdf
```

- With no subfolders, the PDFs are shown as one plain list. Once a subject
  uses any subfolder, the viewer shows the full Lecture / Practicum layout,
  with empty sections marked "To be added". Other subfolder names are listed
  after the standard sections.
- The file name is the title shown: `.pdf` (and a `.pptx` before it), a
  leading number such as `01_` and underscores are dropped. Name files the way
  students should see them.
- PDFs are served as separate files and cached when first opened, never
  bundled. Compress large decks before adding them.
- **Remove pages with personal data first** (see below).

The **Class Drive** (`/drive`) is separate: it lists the class's Google Drive
folder live and needs no files in the repo. See
[deploying](deploying.md#class-drive-optional).

## Help pages

The in-app help at `/docs` is `content/help/`:

- `meta.json` lists the pages in reading order:
  `{ "id", "title", "group", "description", "keywords" }`. The description
  (40–158 characters) is shown on the help index and in search results.
- `{id}.md` is the page. It starts with `# {title}` and has no other `#`
  heading.
- Link to other help pages as `/docs/{id}` (or `/docs/{id}#heading`) and to
  app pages by path (`/account`); the help test fails on a broken link.
- Write for students: what to press, what happens, in the app's own button
  names (in **bold**). Use `<kbd>` for keys.

## Tip of the day

`content/tips/tips.json` is a list of strings. Everyone sees the same tip on
the same day.

## Knowledge-map descriptions

Each concept on the map has a short **What it is** line, shown at the top of
its note and on the hover card. They come from `content/graph/glossary.json`,
one entry per concept, keyed by the concept's id (the term in lower case,
singular, with dashes for spaces, as in the map's `?c=` links):

```json
{
  "epimysium": "The outermost layer of … surrounding the entire muscle.",
  "fascicle": "A bundle of muscle fibres (or nerve fibres) wrapped in …"
}
```

Keep each to one or two plain sentences (at most 260 characters), saying what
the thing is rather than everything about it, and end with a full stop. A
concept missing from the file falls back to a definition found in the ebooks
and summaries (a "**Term**: …" list item, a flashcard, or a sentence that
starts "**Term** is …"), and shows nothing when there isn't a clear one. When
new content adds concepts, add their lines here; the content tests check the
ids and lengths.

## Knowledge-map link labels

`content/graph/relations.json` holds optional AI-written labels for the map's
links ("innervates", "part of"). It's generated, not hand-written:

```bash
AI_BASE_URL=… AI_API_KEY=… AI_MODEL=… npm run graph:relations
```

Run it after big content changes, check the diff and commit the file.

## Privacy checklist

The repo is public and files are served as they are. Before adding anything
from the course:

- **Remove** pages with names of presenters or assistants together with their
  photos, student ids, phone numbers, birth dates, social-media handles,
  profile pages, class or group photos, and group invite links or QR codes.
- Don't add past exam questions anywhere but `content/exams/`.
- Don't add anything from the Class Drive to the repo: it stays behind sign-in.
- Check figure crops too: a slide's corner can carry a name or a face.

## Checks to run

```bash
npm run test                      # content integrity, help links, everything else
npx markdownlint-cli2 "**/*.md"   # Markdown style and 80-column lines
npm run build                     # type-check, build and prerender every page
```

The content tests check that:

- every content folder uses a configured block;
- flashcard and quiz ids are unique across all decks;
- every occlusion figure exists and its boxes fit inside it;
- exam `meta.json` counts match their banks;
- subject covers point at real images;
- every help page is listed once and its links resolve.

Then open the page in `npm run dev` and look at it, in light and dark mode
and at phone width.
