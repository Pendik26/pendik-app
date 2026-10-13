#!/usr/bin/env bash
# npm run db:first-admin: runs first-admin.sql against the live database with who to make an admin
# taken from the environment, so it never ends up in the repo.
#   FIRST_ADMIN_NIM, FIRST_ADMIN_NAME   required
#   FIRST_ADMIN_COHORT                  optional, e.g. 2026
#   FIRST_ADMIN_PASSWORD                optional; defaults to pendik26 + NIM
#   POSTGRES_URL_NON_POOLING            the direct connection string (Vercel's Supabase integration
#                                       sets it), or DATABASE_URL
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
url="${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-}}"
: "${url:?set POSTGRES_URL_NON_POOLING (or DATABASE_URL) to the database connection string}"
: "${FIRST_ADMIN_NIM:?set FIRST_ADMIN_NIM}"
: "${FIRST_ADMIN_NAME:?set FIRST_ADMIN_NAME}"
psql "$url" -q -v ON_ERROR_STOP=1 \
  -v nim="$FIRST_ADMIN_NIM" -v full_name="$FIRST_ADMIN_NAME" \
  -v cohort="${FIRST_ADMIN_COHORT:-}" -v password="${FIRST_ADMIN_PASSWORD:-}" \
  -f "$here/first-admin.sql"
echo "first admin: $FIRST_ADMIN_NIM is an admin; sign in with that NIM"
