-- Intentionally empty. This migration used to seed the first admin with a real student's NIM and
-- name; that data no longer lives in the repo. Seed an admin with `npm run db:first-admin`
-- (database/seeds/first-admin.sql, docs/deploying.md step 6), which takes who it is from the
-- environment. The file stays so the live database's migration history still lines up; a database
-- that already ran the old version keeps its admin.
select 1;
