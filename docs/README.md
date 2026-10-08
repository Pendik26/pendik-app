# Documentation

These pages, and the student help, are also published to the repository's
GitHub wiki on every push to `major` (`.github/workflows/wiki.yml`) when the
wiki is switched on. Edit them here: the wiki is a generated copy.

**Students:** the help for using the app is built in. Open **Help** in the
app's sidebar, or go to `/docs`. Its pages are written in
[`content/help/`](../content/help/).

## Adding and editing study material

- [Content guide](content-guide.md): where every kind of material goes, the
  file formats with examples, figures and images, the privacy checklist, and
  the checks to run.
- [Writing exam questions](questions.md): the Markdown format past papers
  and practice sets are imported in, and what happens after importing.

## Working on the code

- [Architecture](architecture.md): how the app is put together, the pages,
  the build, offline support, and what each `src/lib` module does.
- [Development](development.md): running it locally, scripts, tests,
  conventions, and recipes for common changes.
- [Storage and saving](storage-and-sync.md): the key registry and how
  progress is loaded from and saved to the account.
- [Database](database.md): the Supabase tables, who can see what, the SQL
  functions, tests and schema changes.
- [Server API](api.md): the Edge Functions (`ai`, `admin-accounts`,
  `drive-sync`) with their requests and responses.
- [3D anatomy atlas](atlas-3d.md): the `/atlas` page's models, where they
  come from and their licence, the viewer, and how to rebuild them from
  Z-Anatomy.
- [How the numbers are worked out](calculations.md): every formula and
  constant, from the Virtual Lab's muscle model to readiness, today's plan,
  streaks and leaderboard points.

## Running it

- [Deploying](deploying.md): the Supabase project, sign-in, Edge Function
  secrets, Vercel, the Class Drive sync, the first admin, the roster and the
  past papers.
