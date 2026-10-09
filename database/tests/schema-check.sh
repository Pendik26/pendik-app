#!/usr/bin/env bash
# Checks that database/schema/ (the current schema, by domain) describes exactly what the
# migrations build: loads each into its own scratch database and compares their schema dumps.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres database/tests/schema-check.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
from_migrations="pendik_migrations_$$"
from_schema="pendik_schema_$$"
out="$(mktemp -d)"
cleanup() {
  psql -q -d postgres -c "drop database if exists $from_migrations" -c "drop database if exists $from_schema" >/dev/null
  rm -rf "$out"
}
trap cleanup EXIT

load() { # database, files...
  local db="$1"; shift
  psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db" >/dev/null
  psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$db" -f "$here/local-stub.sql"
  for f in "$@"; do psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$db" -f "$f" 2>&1 | { grep -v NOTICE || true; }; done
}
dump() { # Schema only; grants are sorted, since only which ones exist matters, not their order.
  pg_dump --schema-only --no-owner --schema=public "$1" | grep -v '^--' | grep -v '^$' | grep -v '^\\\(un\)\?restrict' >"$out/$1.sql"
  grep -v '^\(GRANT\|REVOKE\)' "$out/$1.sql" >"$out/$1.objects"
  grep '^\(GRANT\|REVOKE\)' "$out/$1.sql" | sort >"$out/$1.grants"
}

load "$from_migrations" "$here"/../migrations/*.sql
load "$from_schema" "$here"/../schema/*.sql
dump "$from_migrations"
dump "$from_schema"

if diff -u "$out/$from_migrations.objects" "$out/$from_schema.objects" >"$out/diff" \
  && diff -u "$out/$from_migrations.grants" "$out/$from_schema.grants" >>"$out/diff"; then
  echo "database/schema matches the migrations"
else
  cat "$out/diff"
  echo "database/schema differs from what the migrations build (- migrations, + schema): update database/schema/ to match" >&2
  exit 1
fi
