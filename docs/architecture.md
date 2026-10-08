# Architecture

Pendik is a single-page React app for the Pendik 26 class. Study material
(flashcards, quizzes, ebooks, summaries, lecture PDFs, the knowledge map and
atlas) is bundled at build time; everything students and admins save is in
one Supabase project: sign-in, progress, past-paper exams, the class Drive
listing, the leaderboard and the AI allowance. Every page needs sign-in, and
only students on the class roster can have an account.

```text
          build time                              run time
content/*.json, *.md, *.pdf ──► Vite bundle ──► browser (React SPA, PWA)
                                   │                │  supabase-js (signed in)
                                   ▼                ▼
               scripts/prerender.mjs         Supabase: Auth, Postgres + RLS, SQL functions
               static page per route           Edge Functions: ai ──► AI gateway
               (served by Vercel)                              admin-accounts
                                                               drive-sync ◄── GitHub Action (daily)
                                                                   └──► Google Drive API
```

## The stack

- **Vite 8, React 19, TypeScript 6** (strict, `erasableSyntaxOnly`), React
  Router 7.
- **vite-plugin-pwa / Workbox** for the service worker.
- **Vercel** hosts the static site. **Supabase** for sign-in (Auth), the
  database (Postgres with row level security and SQL functions) and three
  Edge Functions (Deno).
- **Vitest** for tests, **oxlint** and **Stylelint** for linting,
  **markdownlint** for Markdown; SQL tests for the database rules.
- Fuse.js for search, marked for Markdown, d3-force for the knowledge map's
  layout (once at build time, then live on the map page). The map draws on a
  2D canvas in both views; its 3D view has its own small physics and camera,
  with no WebGL library.
- three.js for the 3D anatomy atlas only (`/atlas`), in its own chunk that no
  other page loads.
- The interface is in **Indonesian by default, with English** from the
  sidebar or Account page (`src/i18n/`).

## Project layout

```text
src/
  pages/        one component per route (lazy-loaded)
  components/   sidebar, command palette, shortcuts overlay (?), subject
                trail, heatmap, badges, nudges, error boundary…
    plan/       Today.tsx: Home's next step and "Up next" after a session;
                the exam plan's parts
    map/        the knowledge map: GraphCanvas (2D), Graph3D, GraphControls,
                render.ts (palette, sphere sprites, label placement, hover card)
    atlas/      viewer.ts: the 3D anatomy atlas's three.js viewer
  hooks/        useSpacedRepetition, useQuizProgress, useExamHistory, useTheme,
                useReadingPrefs, useServiceWorkerUpdate, useLocalStorage…
  lib/          pure logic (each piece has a *.test.ts beside it)
  styles/       theme.css (design tokens) plus one stylesheet per area,
                imported by index.css
  types/        content.ts: Flashcard, QuizQuestion, ExamAttempt, EbookMeta…
  context/      AccountContext: the session, the student's profile, loading and
                saving progress, sign-in actions
  i18n/         the Indonesian and English text (sections/*.ts), useI18n()
  prerender/    site.ts: the static page for every route
content/        the study material and help pages (see content-guide.md)
public/atlas/   the 3D anatomy models and index (CC BY-SA, see atlas-3d.md)
public/question-images/  pictures for exam questions (see questions.md)
scripts/        prerender.mjs (after vite build), graph-relations.mjs,
                build-info.mjs (version and build for the footer), wiki.mjs,
                atlas/ (converts Z-Anatomy into public/atlas/)
supabase/
  migrations/   the database: tables, row level security, SQL functions
                (see database.md)
  functions/    the Edge Functions ai, admin-accounts, drive-sync, and
                _shared/ (their logic, tested with Vitest; see api.md)
  tests/        SQL tests for the exam and Drive rules
```

## How content gets into the app

`src/lib/content.ts` globs every content folder. Small files (decks, banks,
summaries, exam and ebook metadata) are imported eagerly; large ones (ebook
chapters, exam banks, occlusion notes, help pages) are separate chunks loaded
on demand, and PDFs are plain static files. Every map is keyed by
`{blockId}/{subjectId}` and exposed as a `ReadonlyMap`, so a key from the URL
can never reach `Object.prototype`. See the [content guide](content-guide.md)
for the formats.

## Routing and pages

Every page is its own lazily loaded chunk (`src/App.tsx`). The pages:

| Route | What's there |
| --- | --- |
| `/` | Home: today's next step (Start), the day's plan, block picker on a first visit, "continue" list, the current block's subject cards (others folded), activity, explore links |
| `/subjects` → `/subjects/:blockId/:subjectId` | Every subject → its page: cover, what's due next, every section, chapters and labs |
| `/flashcards` → `/flashcards/:blockId/:subjectId` | Subject list with due counts → SM-2 review session |
| `/occlusion` → `/occlusion/:blockId/:subjectId` | Subjects with figures → image occlusion (review or browse, figure gallery) |
| `/quizzes` → `/quizzes/:blockId/:subjectId` | Subject list with last score and due counts → quiz (with section picker for large banks) |
| `/exam` | Past papers and practice sets for the student's block, their best scores and a running attempt; the pooled block exam |
| `/exam/papers/:packageId` → `/exam/attempt/:attemptId` → `/exam/result/:attemptId` | A package's details and past attempts → taking it (server timer, saved as you go, one tab at a time) → the graded result and review |
| `/exam/practice` | Practice from the bank: pick block, papers, years, subjects, count and timer, and get a random set |
| `/exam/bookmarks` | Bookmarked questions with their answers; practise them as a set |
| `/exam/:blockId` | The pooled block exam, drawn from the block's quiz banks |
| `/modules` → `/modules/:blockId/:subjectId` | Subjects with PDFs → sectioned PDF viewer |
| `/ebooks` → `/ebooks/:blockId/:subjectId/:chapterId` | Book list with resume position → chapter reader |
| `/summaries` → `/summaries/:blockId/:subjectId` | Summary list → rendered summary |
| `/lab` → `/lab/:exerciseId/:activity` | Virtual Lab activities → simulator bench, data table, plot and check questions |
| `/search` | Fuzzy search with type and subject filters |
| `/progress` | Readiness, subject meters, trends, heatmap, weak spots, milestones |
| `/atlas` | 3D anatomy: the whole body by system, with search, descriptions, landmarks and muscle attachments (see [3D anatomy atlas](atlas-3d.md)) |
| `/map` | Knowledge map of every concept across all blocks |
| `/drive` | Class Drive: the class's Google Drive folder, as copied by the daily sync; the student's class's folders (the other's on request) and recently opened files |
| `/alfond` | Alfond, the study assistant's own page |
| `/docs` → `/docs/:pageId` | Help: the index of help pages → one page, with contents and previous/next |
| `/plan`, `/plan/:block` | Exam plan: today's plan, phases, readiness, mock trend, weak spots, class average |
| `/leaderboard` | Weekly, all-time and streak rankings, filtered to your cohort; join or leave, and pick a display name |
| `/account` | Profile, language and theme, current block, password, linking Google, save status, sign out |
| `/admin/students`, `/packages`, `/questions`, `/import`, `/drive` | Admins only: the roster, accounts and classes; exam packages, their class and questions; searching every question; importing a Markdown file of questions; the Drive sync, hidden files and file order |

Signed out, every address shows the sign-in page (NIM and password, or
Google). A student still on their first password sees the change-password
page first.

Every page is code-split and loaded on demand.

`src/lib/routeMeta.ts` gives every route its title, description, breadcrumbs
and whether search engines may index it. The app uses it to set the document
title while navigating (`usePageMeta`), and the prerender step uses it for the
static pages, so the two always agree.

## Static pages

`npm run build` ends with `scripts/prerender.mjs`, which runs
`src/prerender/site.ts` against the built `index.html`: one page per route
with its own title and description, plus `knowledge-graph.json` (the map,
laid out once at build time), `sitemap.xml`, `robots.txt` and `404.html`.
Vercel serves those pages directly, so a deep link loads fast; React then
starts and shows the sign-in page if needed. Past-paper questions and
anything from the Class Drive are never written to these pages.

## Offline and updates

- The service worker (vite-plugin-pwa / Workbox) precaches the app shell,
  styles, fonts and images, so the app loads with no connection after the
  first visit.
- PDFs are cached the first time you open them, which keeps the first visit
  fast even though the modules add up to about 300 MB.
- The 3D atlas's models are cached the same way, one body system at a time
  (about 15 MB for all of them). Their URLs carry the file size, so a rebuilt
  model replaces the cached one.
- When a new version is deployed, the app checks for it on focus and every
  30 minutes, then shows a **"A new version is ready"** prompt. It never
  reloads on its own, so a quiz or exam in progress isn't lost.

## Accounts and progress

Students sign in with their NIM (as `<nim>@pendik26.internal` in Supabase
Auth) or with Google once they've linked it. Their progress is kept in their
account only: loaded into memory at sign-in and saved a moment after each
change. The keys are declared in one registry, `src/lib/storageSchema.ts`.
The whole design is in [Storage and saving](storage-and-sync.md), the tables
in [Database](database.md), the Edge Functions in [Server API](api.md).

## Pure logic in src/lib

Pages stay thin: anything that computes something lives in `src/lib` as a
pure function with a `*.test.ts` beside it. The formulas are written out in
[How the numbers are worked out](calculations.md).

| File | Responsibility |
| --- | --- |
| `content.ts` | Discovers every content file at build time and exposes decks, banks, ebooks, summaries and modules |
| `blocks.ts` | Block display names, "coming soon" subjects, grouping lists by block |
| `sm2.ts` | SM-2 scheduling: a 0–5 grade becomes the next interval, ease factor and due date |
| `quizScoring.ts` | Scores an attempt and keeps the "due for review" queue of missed questions |
| `quizShuffle.ts` | Per-attempt shuffle of question order and option order (answer index remapped) |
| `quizSections.ts` | Splits large banks into even sections |
| `examFormat.ts` | Exam length and time limit (100 questions max, 60 s each) |
| `moduleSections.ts` | Groups module PDFs into Lecture / Practicum sections |
| `searchIndex.ts` | Builds the Fuse.js index over all content |
| `textExtract.ts` | Strips Markdown, HTML and inline SVG down to searchable plain text |
| `activity.ts` | Study days and streaks, and the study log (what was studied each day, per subject) |
| `readiness.ts` | Readiness per subject and block, mock-score projection |
| `examPlan.ts` | Exam dates, days left and the plan's phases |
| `todayPlan.ts` | Today's plan, sized to the student's minutes; `planStatus` (the next unfinished item, for Home's Start and "Up next") and `unfinishedToday` (the palette's suggestions) |
| `dueCounts.ts` | Reviews due now across every deck and quiz bank (the sidebar and tab-bar counts) |
| `recentPages.ts` | The pages opened last on this device, for the command palette |
| `keys.ts` | `isTyping`: whether a key press is going into a text box (single-key shortcuts stay quiet) |
| `weakSpots.ts` | Weakest flashcard topics, most-missed questions, slipping labels |
| `studyStats.ts` | Daily series, this week against last, best study time, heatmap amounts |
| `milestones.ts` | Milestones and the next one to earn |
| `hardestCards.ts` | Ranks cards by lapses, then ease factor |
| `muscleSim.ts` | The Virtual Lab's muscle model (recruitment, twitch, summation, length–tension, fatigue, load–velocity) |
| `labTraces.ts` | Oscilloscope tracing colours and reading a value off a trace |
| `occlusion.ts` | Image-occlusion cards, figure navigation and the zoom window |
| `explain.ts` | Finds the note passages that match a question for "Explain this" |
| `knowledgeGraph/` | Builds the knowledge map (concepts, links, layout, each concept's "What it is" from `describe.ts` and the glossary), its shared physics (`layout.ts`), the 3D physics (`layout3d.ts`) and orbit camera (`camera3d.ts`), the compact file format (`wire.ts`), the graph settings and each concept's mastery |
| `buildInfo.ts` | The version and build the footer shows, put in at build time |
| `drive.ts` | The Class Drive: the tree from the `drive_files` rows, folder lookup, search, new files, labels |
| `help.ts` | The in-app help pages: the list from `content/help/meta.json`, each page loaded on demand |
| `markdownHtml.ts` | Markdown to HTML with heading anchors (chapters, summaries, help) |
| `records.ts` | Safe reads and writes of objects keyed by untrusted ids |
| `tipOfDay.ts` | Deterministic daily tip (same for everyone) |
| `subjectStyle.ts` | Stable per-subject hue from the subject id, avoiding the red and green used for wrong/right |
| `storageSchema.ts` | The registry of every kind of saved value: its id and whether it's saved in the account or on the device |
| `routeMeta.ts` | Title, description, breadcrumbs and indexability for every route (the app and the prerendered pages), and each subject's materials for the study pages' tabs (`subjectMaterials`) |
| `storage.ts` | Reading and writing saved values (progress in memory, device settings in `localStorage`) and the key builders |
| `progressSync.ts` | Loading the account's progress at sign-in and saving changes |
| `supabase.ts` | The Supabase client and the NIM sign-in address |
| `exams.ts` | Past-paper packages and attempts: the store loaded at sign-in, and the attempt functions |
| `questionMarkdown.ts` | The question import format: parsing and writing it |
| `admin.ts` | The admin pages' calls: roster, accounts, packages, imports, Drive sync |
| `aiStream.ts` | Streams an answer from the `ai` Edge Function |
| `leaderboard.ts`, `classReadiness.ts` | The leaderboard and the class average, from SQL functions |

## Design

The look is **frosted glass over a clinical monitor**: translucent,
blurred panels float over slowly drifting color blobs, on a faint graph-paper
grid. An EKG pulse trace is the logo and hero decoration.

- **Type:** Fraunces (headings), Archivo (UI), IBM Plex Mono for anything that
  reads as data (counts, stats, badges, shortcut hints), and Atkinson
  Hyperlegible as the accessible reading font
- **Color:** a phosphor-teal accent; a fixed color per content type
  (flashcards, quizzes, exams, modules, ebooks, summaries); a hue per subject
  derived from its id
- **Theming:** all tokens live in `src/styles/theme.css`, with a dark default
  and a warm-paper light theme. Change the variables to retheme the app.
- **Accessibility:** skip-to-content link, visible focus outlines, ARIA roles
  on quiz options, toggles and timers, and `prefers-reduced-motion` respected
  by every animation
