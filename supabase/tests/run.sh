#!/usr/bin/env bash
# Loads every migration into a fresh database on a local Postgres and runs the SQL tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="pendik_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/local-stub.sql"
for f in "$here"/../migrations/*.sql; do psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
for f in "$here"/*.test.sql; do echo "== $(basename "$f")"; psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
echo "all SQL tests passed"
