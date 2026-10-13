# database

The Supabase side of Pendik: the schema, its migrations, the Edge Functions
and their tests. The map is [docs/database.md](../docs/database.md).

- `schema/`: the current schema, one file per domain. Read this.
- `migrations/`: what `db push` applies. `0001_baseline.sql` builds the whole
  schema; each later change is the next number and a few words, like
  `0002_quiz_streaks.sql`. Never edit one that has run.
- `seeds/`: data that isn't schema, run by hand: `first-admin.sql`
  (`npm run db:first-admin`). The study catalog comes from `content/`
  (`npm run db:content`).
- `functions/`: the Edge Functions ([docs/api.md](../docs/api.md)).
- `tests/`: SQL tests and the schema check (`npm run db:test`).
- `config.toml`: the Supabase CLI's local settings.

The Supabase CLI expects a folder named `supabase/`, so run it as
`npm run supabase -- <command>` (see `scripts/supabase.mjs`).
