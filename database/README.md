# database

The Supabase side of Pendik: the schema, its migrations, the Edge Functions
and their tests. The map is [docs/database.md](../docs/database.md).

- `schema/`: the current schema, one file per domain. Read this.
- `migrations/`: how the live database got there. Add new files; never edit
  one that has run.
- `seeds/`: data that isn't schema, run by hand: `first-admin.sql`
  (`npm run db:first-admin`).
- `functions/`: the Edge Functions ([docs/api.md](../docs/api.md)).
- `tests/`: SQL tests and the schema check (`npm run db:test`).
- `config.toml`: the Supabase CLI's local settings.

The Supabase CLI expects a folder named `supabase/`, so run it as
`npm run supabase -- <command>` (see `scripts/supabase.mjs`).
