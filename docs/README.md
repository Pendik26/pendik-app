# Documentation

These pages, and the student help, are also published to the [GitHub
wiki](https://github.com/neccrr/medicine/wiki) on every push to `major`
(`.github/workflows/wiki.yml`). Edit them here: the wiki is a generated copy.

**Students:** the help for using the app is built in. Open **Help** in the
app's sidebar, or go to [/docs](https://medicine.necr.help/docs). Its pages
are written in [`content/help/`](../content/help/).

## Adding and editing study material

- [Content guide](content-guide.md): where every kind of material goes, the
  file formats with examples, figures and images, the privacy checklist, and
  the checks to run.

## Working on the code

- [Architecture](architecture.md): how the app is put together, the pages,
  the build and prerender, offline support, and what each `src/lib` module
  does.
- [Development](development.md): running it locally, scripts, tests,
  conventions, and recipes for common changes.
- [Storage and sync](storage-and-sync.md): the `localStorage` key registry,
  merge rules, the sync round and the database.
- [Database](database.md): the MongoDB connection, every collection's
  documents and indexes, what each request reads and writes, sizes, privacy,
  testing and operations.
- [MongoDB Atlas cluster](atlas.md): the cluster's tier, region, replica set
  and network access, its limits, and how to scale it.
- [3D anatomy atlas](atlas-3d.md): the `/atlas` page's models, where they
  come from and their licence, the viewer, and how to rebuild them from
  Z-Anatomy.
- [API reference](api.md): every `/api` route with its requests and
  responses.
- [How the numbers are worked out](calculations.md): every formula and
  constant, from the Virtual Lab's muscle model to readiness, today's plan,
  streaks and leaderboard points.

## Running it

- [Deploying](deploying.md): Vercel, environment variables, MongoDB Atlas,
  Google sign-in, the AI provider, the Class Drive and search engines.
