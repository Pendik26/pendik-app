# Development

## Quick start

```bash
git clone https://github.com/Pendik26/pendik-app.git
cd pendik-app
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL and the key
npm run dev                  # http://localhost:5173
```

Every page needs sign-in, so the app needs a Supabase project to talk to:
either the real one (add `http://localhost:5173` to its redirect URLs and
`APP_ORIGINS`, see [deploying](deploying.md)), or a local one with the
[Supabase CLI](https://supabase.com/docs/guides/cli). The database lives in
`database/`, not the CLI's usual `supabase/`, so run the CLI through
`npm run supabase --`, which points it there:

```bash
npm run supabase -- start              # Postgres, Auth and the API in Docker
npm run supabase -- db reset           # apply database/migrations/
npm run supabase -- functions serve    # the Edge Functions, reading database/functions/.env
```

`start` prints the local URL and publishable key for `.env.local`.
Make yourself an admin as in [deploying, step 6](deploying.md#6-first-admin-roster-and-past-papers).

## Scripts

```bash
npm run dev          # dev server on http://localhost:5173
npm run build        # type-check (tsc -b), build to dist/, then prerender
npm run preview      # serve the production build locally
npm run lint         # oxlint
npm run lint:css     # Stylelint
npm run test         # Vitest, single run
npm run test:watch   # Vitest, watch mode
npm run graph:relations   # AI labels for the knowledge map's links
npm run docs:wiki         # build the wiki pages into wiki-out/ (CI publishes them)
npm run supabase -- <command>   # the Supabase CLI, run on database/
npm run db:test      # SQL tests and the schema check, on a local Postgres (PGHOST etc.)
npm run db:push      # apply new migrations (add -- --db-url "$POSTGRES_URL_NON_POOLING" if not linked)
npm run db:types     # rewrite src/lib/db/types.ts from the linked project
npx markdownlint-cli2 "**/*.md"   # Markdown style
```

Before pushing, run the same checks CI would:

```bash
npx tsc -b && npm run lint && npm run lint:css && npm run test && npm run build
```

## Tests

Tests sit beside the code as `*.test.ts` and run in Node (no DOM). They cover:

- the pure logic in `src/lib`: SM-2, quiz scoring, shuffling and sections,
  exam format, readiness and today's plan, the muscle model and trace
  reading, image occlusion, the knowledge map, note matching, search
  indexing, text extraction, streaks, tip of the day, the key registry, the
  Class Drive helpers, the question Markdown parser, the admin helpers, the
  AI stream, help pages and route metadata;
- content integrity (`contentIntegrity.test.ts`) and the prerendered pages
  (`src/prerender/site.test.ts`, which also checks that no past-paper question
  is published);
- the Edge Functions' shared code in `database/functions/_shared/`: the AI
  requests and allowance, account actions, and the Drive sync with its path
  rules (against a fake Drive and store);
- the translations (`src/i18n/i18n.test.ts`: both languages have the same
  keys and the same `{placeholders}`).

A test that needs `window` stubs it with `vi.stubGlobal`; one that needs
Supabase mocks `./supabase`.

The database rules (exam attempts, grading, deadlines, the Drive functions)
have SQL tests that run against a local Postgres:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run db:test
```

There are no component tests; check UI changes in the browser, in light and
dark mode and at phone width (about 380 px).

## Conventions

- **Pure logic in `src/lib`, with a test.** Pages and hooks stay thin.
- **TypeScript is strict** with `erasableSyntaxOnly`: no enums, no
  namespaces, no constructor parameter properties.
- **Untrusted keys.** Ids from URLs, content or synced data never index plain
  objects directly. Use a `Map`, or the helpers in `src/lib/records.ts`
  (`own`, `setOwn`, `deleteOwn`, `entry`), and `itemAt` / `.at()` for arrays.
  A `/constructor` or `__proto__` in a URL or a sync must be just a string.
- **Storage** goes through `storageKey()` and the helpers in
  `src/lib/storage.ts`, never raw `localStorage` keys (see [storage and
  sync](storage-and-sync.md)).
- **CSS:** design tokens live in `src/styles/theme.css`; one stylesheet per
  area, imported by `src/index.css`. Colours use modern notation
  (`rgb(0 0 0 / 0.3)`), with alpha as a number. Every animation respects
  `prefers-reduced-motion`.
- **Markdown** wraps at 80 columns (tables exempt), with blank lines around
  lists. Bold terms stay on one line: the knowledge map reads them.
- **Comments** say why, not what.
- **Words on screen** come from `src/i18n/`: `t("key")` from `useI18n()`,
  with the English and Indonesian text side by side in a section file in
  `src/i18n/sections/`. Indonesian is the default. Code in `src/lib` that
  makes text takes a `t: Translate` argument (defaulting to English, for
  tests and the prerender).
- **Names in code are English**, including database tables and columns.
- **Privacy:** no secrets in the repo (the server's keys are Supabase
  Edge Function secrets), and no personal data in content. Anything only for signed-in
  students (the Class Drive) stays out of the prerendered pages, search and the
  knowledge map.

## Recipes

### A new page or section

1. Build the page in `src/pages/` and add a lazy import and a `<Route>` in
   `src/App.tsx`.
2. Add the section to `SECTIONS` in `src/lib/routeMeta.ts` (name, title,
   description, `indexable`), and its paths to `indexablePaths()`, or to
   `PRIVATE_PATHS` for a personal page.
3. Give it static content in `content()` in `src/prerender/site.ts` if it's
   indexable.
4. Add the section name to **both** section lists in `vercel.json`'s
   rewrites, so its prerendered pages are served.
5. Add it to the sidebar (`src/components/Sidebar.tsx`) and to `staticPages`
   in `src/lib/searchIndex.ts`.
6. Add a help page for it in `content/help/` if students need one.

### A Virtual Lab activity

Activities are data in `src/lib/labActivities.ts`: slug, number, title,
summary, background, steps, expected result and check questions, plus a
`mode` that picks the bench (`twitch`, `voltage`, `frequency`, `tetanus`,
`fatigue`, `length`, `load`). A new mode needs its simulation in
`src/lib/muscleSim.ts` (with tests) and its controls and table columns in
`src/pages/LabActivity.tsx`. Routes, search, the sitemap and the prerendered
page follow from the list.

### A new kind of saved progress

See [storage and sync](storage-and-sync.md#adding-a-new-kind-of-progress).

### Something that needs the server

Most things are a table or SQL function: add a migration in
`database/migrations/` with row level security and a header comment, make
the same change in that domain's file in `database/schema/`, add a SQL test
in `database/tests/` if it enforces a rule, and call it from `src/lib`
through `src/lib/db/client.ts` (see [database](database.md#changing-the-schema)).
Only what needs a secret (an API key, the service role) becomes an Edge
Function: put its logic in `database/functions/_shared/` with a Vitest test,
keep `index.ts` thin, and document it in [the server API](api.md).

### A new language string

Add the key to the English and Indonesian objects in the right
`src/i18n/sections/*.ts` file (a new section file is merged in
`src/i18n/messages.ts`). `npm test` fails if the two don't match.

### A new block

Add it to `studyBlocks` in `src/lib/blocks.ts` (with its `examDate` when it's
known), then add its content folders. See the [content guide](content-guide.md).

## Contributing

- **Content** (cards, questions, chapters, summaries, PDFs) never needs a code
  change: follow the [content guide](content-guide.md), including its privacy
  checklist.
- **Code:** run the checks above before opening a pull request.
- Open an issue first for changes to the data model (`src/types/content.ts`)
  or the content folder layout.
