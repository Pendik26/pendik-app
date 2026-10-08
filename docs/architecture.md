# Architecture

Medicine is a single-page React app that works with no server at all. All
study material is bundled at build time, all progress lives in the browser,
and an optional API adds accounts, sync, the leaderboard, AI and the Class
Drive.

```text
          build time                              run time
content/*.json, *.md, *.pdf ──► Vite bundle ──► browser (React SPA, PWA)
                                   │                │  localStorage: medicine:*
                                   ▼                │
               scripts/prerender.mjs                ▼ (signed in)
               static page per route ◄── Vercel ──► /api  (api/index.ts)
               sitemap, robots, 404              server/app.ts ──► MongoDB
                                                   │         ──► AI gateway
                                                   └──────────► Google Drive API
```

## The stack

- **Vite 8, React 19, TypeScript 6** (strict, `erasableSyntaxOnly`), React
  Router 7.
- **vite-plugin-pwa / Workbox** for the service worker.
- **Vercel** for hosting and the one API Function; **MongoDB Atlas** for
  accounts and synced progress; **Better Auth** for sign-in.
- **Vitest** for tests, **oxlint** and **Stylelint** for linting,
  **markdownlint** for Markdown.
- Fuse.js for search, marked for Markdown, d3-force for the knowledge map's
  layout (once at build time, then live on the map page). The map draws on a
  2D canvas in both views; its 3D view has its own small physics and camera,
  with no WebGL library.
- three.js for the 3D anatomy atlas only (`/atlas`), in its own chunk that no
  other page loads.

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
  context/      AccountContext: session, sync scheduling, sign-in actions
  prerender/    site.ts: the static page for every public route
content/        the study material and help pages (see content-guide.md)
public/atlas/   the 3D anatomy models and index (CC BY-SA, see atlas-3d.md)
scripts/        prerender.mjs (after vite build), graph-relations.mjs,
                build-info.mjs (version and build for the footer), wiki.mjs,
                atlas/ (converts Z-Anatomy into public/atlas/)
api/
  index.ts      the Vercel Function; vercel.json rewrites /api/* here
server/         the API behind it:
  app.ts          routes: auth (Better Auth), config, sync, export,
                  leaderboard, readiness, AI, Drive (see api.md)
  schema.ts       every MongoDB collection and its indexes, created once per
                  cold start
  progressStore.ts  synced progress, one document per user per key
                    (MongoDB and in-memory)
  leaderboard.ts  scoring and ranking, one document per user (MongoDB and in-memory)
  ai.ts           "Explain this" and Alfond through the AI gateway, daily allowance
  drive.ts        the Class Drive: walks the Drive folder, caches the listing,
                  and reads archive folders when they're opened
  mongo.ts        the shared client (see database.md); devApi.ts serves the
                  API from the Vite dev server
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
| `/exam` → `/exam/:blockId[/:packageId]` | Block list → package picker → timed exam |
| `/modules` → `/modules/:blockId/:subjectId` | Subjects with PDFs → sectioned PDF viewer |
| `/ebooks` → `/ebooks/:blockId/:subjectId/:chapterId` | Book list with resume position → chapter reader |
| `/summaries` → `/summaries/:blockId/:subjectId` | Summary list → rendered summary |
| `/lab` → `/lab/:exerciseId/:activity` | Virtual Lab activities → simulator bench, data table, plot and check questions |
| `/search` | Fuzzy search with type and subject filters |
| `/progress` | Readiness, subject meters, trends, heatmap, weak spots, milestones, export/import |
| `/atlas` | 3D anatomy: the whole body by system, with search, descriptions, landmarks and muscle attachments (see [3D anatomy atlas](atlas-3d.md)) |
| `/map` | Knowledge map of every concept across all blocks |
| `/drive` | Class Drive: the class's Google Drive folder, live (signed-in only) |
| `/alfond` | Alfond, the study assistant's own page |
| `/docs` → `/docs/:pageId` | Help: the index of help pages → one page, with contents and previous/next |
| `/plan`, `/plan/:block` | Exam plan: today's plan, phases, readiness, mock trend, weak spots, class average |
| `/leaderboard` | Weekly, all-time and streak rankings, filtered to your cohort; join or leave, and pick a display name (signed-in only) |
| `/account` | Sign in or create an account; profile, sync status, current block, sign out, data download, account deletion |

Every page is code-split and loaded on demand.

`src/lib/routeMeta.ts` gives every route its title, description, breadcrumbs
and whether search engines may index it. The app uses it to set the document
title while navigating (`usePageMeta`), and the prerender step uses it for the
static pages, so the two always agree.

## Static pages for search engines

`npm run build` ends with `scripts/prerender.mjs`, which runs
`src/prerender/site.ts` against the built `index.html`:

- one page per public route (`indexablePaths()`), with its own title,
  description, canonical URL and breadcrumb data, and the content itself as
  plain HTML inside `#root` (card fronts, quiz questions, chapters,
  summaries, help pages);
- the personal pages (`PRIVATE_PATHS`) as `noindex` shells;
- `knowledge-graph.json` (the map, laid out once at build time),
  `sitemap.xml`, `robots.txt` and `404.html`.

React replaces the static content as soon as the app starts. Past-paper exam
questions and anything from the Class Drive are never written to these pages;
`src/prerender/site.test.ts` checks the first.

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

## Progress, accounts and sync

Progress is a set of `medicine:*` keys in `localStorage`, declared in one
registry (`src/lib/storageSchema.ts`). Signed in, changed keys are synced
with the server and merged per key. The whole design is in [Storage and
sync](storage-and-sync.md); the endpoints are in [the API reference](api.md).

## Pure logic in src/lib

Pages stay thin: anything that computes something lives in `src/lib` as a
pure function with a `*.test.ts` beside it. The formulas are written out in
[How the numbers are worked out](calculations.md).

| File | Responsibility |
| --- | --- |
| `content.ts` | Discovers every content file at build time and exposes decks, banks, exam packages, ebooks, summaries and modules |
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
| `explain.ts` | Finds the note passages that match a question, asks the AI to explain |
| `knowledgeGraph/` | Builds the knowledge map (concepts, links, layout, each concept's "What it is" from `describe.ts` and the glossary), its shared physics (`layout.ts`), the 3D physics (`layout3d.ts`) and orbit camera (`camera3d.ts`), the compact file format (`wire.ts`), the graph settings and each concept's mastery |
| `buildInfo.ts` | The version and build the footer shows, put in at build time |
| `drive.ts` | The Class Drive listing: device cache, folder lookup, search, new files |
| `help.ts` | The in-app help pages: the list from `content/help/meta.json`, each page loaded on demand |
| `markdownHtml.ts` | Markdown to HTML with heading anchors (chapters, summaries, help) |
| `records.ts` | Safe reads and writes of objects keyed by untrusted ids |
| `backupReminder.ts` | When to show the export reminder |
| `tipOfDay.ts` | Deterministic daily tip (same for everyone, no server) |
| `subjectStyle.ts` | Stable per-subject hue from the subject id, avoiding the red and green used for wrong/right |
| `storageSchema.ts` | The registry of every `localStorage` key type: id, sync and merge rule, clearing (shared with the server) |
| `routeMeta.ts` | Title, description, breadcrumbs and indexability for every route (the app and the prerendered pages), and each subject's materials for the study pages' tabs (`subjectMaterials`) |
| `storage.ts` | `localStorage` helpers, the key builders, and export/import of all `medicine:*` keys |
| `progressMigration.ts` | Renames progress saved under old subject-only keys to per-block keys |
| `syncMerge.ts` | How two copies of one key are merged, by the key's rule in the registry (shared with the server) |
| `sync.ts` | The sync round: upload changed keys, download the account's changes, apply them safely |
| `syncDirty.ts` | Records which synced keys changed on this device since the last sync |

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
