# Deploying

Pendik is two pieces on one Vercel project:

- the built static site (`npm run build` → `dist/`), and
- one Vercel Function, [`api/index.ts`](../api/index.ts), that serves every `/api/*` request
  (`vercel.json` rewrites them there). It talks to **MongoDB Atlas** and handles sign-in with
  [Better Auth](https://www.better-auth.com).

A GitHub Action (`.github/workflows/drive-sync.yml`) copies the class Google Drive into the database
every morning.

## 1. A MongoDB database

1. In [MongoDB Atlas](https://www.mongodb.com/atlas), create a free cluster (region: Singapore) and a
   database user.
2. Network Access: allow `0.0.0.0/0` (Vercel's addresses change).
3. Copy the connection string (`mongodb+srv://…`). The database is created on first use; its default name is
   `pendik` (`MONGODB_DB` changes it). The indexes are created by the function itself.

## 2. Settings on Vercel

Project → Settings → Environment Variables (Production, and Preview if you use previews):

| Variable | |
| --- | --- |
| `MONGODB_URI` | the connection string from step 1 (required) |
| `BETTER_AUTH_SECRET` | a long random string, e.g. `openssl rand -base64 32` (required) |
| `MONGODB_DB` | database name, default `pendik` |
| `FIRST_ADMIN_NIM`, `FIRST_ADMIN_NAME` | the first admin, see step 3 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional "Continue with Google" |
| `APP_ORIGINS` | optional other addresses allowed to call the API, comma separated |
| `VITE_AI_ENABLED`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_DAILY_LIMIT` | optional "Explain this" and Alfond: `VITE_AI_ENABLED=true` shows them, the `AI_*` settings point at an OpenAI-compatible gateway |
| `DRIVE_SYNC_SECRET`, `GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID` | optional class Drive sync, see step 5 |

Without `MONGODB_URI` and `BETTER_AUTH_SECRET` every `/api` route answers 503 and the app shows its
"couldn't load" page.

## 3. The first admin

Students are never self-registered: an admin adds them to the roster and activates their accounts.
To get the first admin, set `FIRST_ADMIN_NIM` and `FIRST_ADMIN_NAME` and deploy. The first request creates that
student on the roster with an account (password `pendik26<NIM>`, changed at first sign-in) and the admin role — but only
while the site has no admin at all. Remove the two settings afterwards.

## 4. Google sign-in (optional)

In Google Cloud → APIs & Services → Credentials, create an OAuth client (web). Authorised redirect URI:
`https://<your site>/api/auth/callback/google`. Students link Google from the Account page; "Continue with
Google" then signs in only an account that was linked. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 5. The class Drive sync (optional)

Share the class Drive folder by link ("anyone with the link can view"). In Google Cloud turn on the Drive API and create
an API key (APIs & Services → Credentials), then set `GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID` (the folder's id
or its share link) and `DRIVE_SYNC_SECRET` on Vercel. A private folder works too: share it with a Google service
account (viewer) and set `GOOGLE_SERVICE_ACCOUNT_JSON` instead of the API key. In the GitHub repository add the secrets
`APP_URL` (the site's address) and `DRIVE_SYNC_SECRET` (same value). The Action calls `POST /api/drive-sync` until the
sync is done; admins can also run it from Admin → Drive.

## 6. Roster and past papers

Sign in as the admin, paste the roster under Admin → Students, activate accounts, then import past papers under
Admin → Questions. Students sign in with their NIM and the first password.

## Study catalog

Points for flashcards, quizzes and chapters are checked against `server/catalog.generated.ts`, built from
`content/`. After a content change run `npm run content:catalog` and commit the result; CI fails when it is stale
(`npm run content:check`).
