# Deploying

The app deploys to [Vercel](https://vercel.com) as a static site plus one
Function for the API. With no environment variables it is a guest-only static
site; each group of variables below switches on one more feature, and
`/api/config` reports which are on:

```json
{ "accounts": true, "google": true, "ai": true, "drive": true }
```

## Environment variables

Set them in Vercel → Project → Settings → Environment Variables, never in the
repo (`.env*` files are git-ignored; `.env.example` lists them with comments).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `MONGODB_URI` | accounts | Atlas connection string for a user with `readWrite` on the database |
| `MONGODB_DB` | accounts | database name, default `medicine` |
| `BETTER_AUTH_SECRET` | accounts | signs sessions: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | accounts | the public URL, e.g. `https://medicine.necr.help` |
| `TRUSTED_ORIGINS` | optional | extra comma-separated origins allowed to call the auth API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in | see [Google sign-in](#google-sign-in) |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | "Explain this" AI and Alfond | see [AI](#ai-explanations-and-alfond-optional-free-tier) |
| `AI_DAILY_LIMIT` | optional | AI answers per student per day, default 30 |
| `GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID` | Class Drive | see [Class Drive](#class-drive-optional) |
| `GOOGLE_DRIVE_REFRESH_MINUTES` | optional | how long a Drive listing is reused, default 5 |
| `GOOGLE_SITE_VERIFICATION` | optional | Search Console HTML-tag token, at build time |
| `SITE_URL` | optional | origin for link-preview tags in a fork, at build time |

## What vercel.json does

`vercel.json` sets the build command, the `dist` output directory and the
function region (`sin1`, Singapore, next to the Atlas cluster; change both
together if you move either). Its rewrites, in order:

1. `/api/*` goes to the API function (`api/index.ts`).
2. `/privacy` and `/terms` go to the static legal pages in `public/legal/`.
3. Each app section (`/flashcards`, `/docs/getting-started`…) goes to its
   prerendered page, `dist/{path}/index.html` (see [Search
   engines](#search-engines)). A new top-level section needs adding to both
   section lists there.
4. Anything else falls back to the app shell, so deep links work on refresh.

It also marks `sw.js`, the manifest and `index.html` as `no-cache`, so a new
deploy reaches installed copies promptly, and sends `X-Robots-Tag: noindex` on
`*.vercel.app` preview deployments.

## Accounts

Without environment variables the app deploys as guest-only. To turn on
accounts (see `.env.example`):

1. In MongoDB Atlas, create a database user with **readWrite** on the
   `medicine` database only, and allow network access from Vercel: either
   `0.0.0.0/0` (the database user's password is then the protection) or the
   Vercel ↔ Atlas integration.
2. In Vercel → Settings → Environment Variables, set `MONGODB_URI`,
   `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL`
   (`https://medicine.necr.help`).
3. Redeploy. `/api/config` answering `{"accounts":true,...}` means it worked.

## AI: explanations and Alfond (optional, free tier)

"Ask AI to explain" and Alfond's chat call any OpenAI-compatible gateway from
the server; the
site is set up for [NaraRouter](https://bynara.id/) and its free daily
allowance. In Vercel → Environment Variables (never in the repo):

- `AI_BASE_URL`: the gateway's OpenAI-compatible address from its API docs,
  up to and including `/v1` (`/chat/completions` is added)
- `AI_API_KEY`: your NaraRouter API key
- `AI_MODEL`: a model id from its model list (a free one). List backups after it,
  comma-separated (`fast-model,backup-model`); a model that fails or doesn't start
  answering within a minute hands over to the next
- `AI_DAILY_LIMIT` (optional): AI answers per student per day (explanations and
  Alfond's replies together), default 30

Redeploy; `/api/config` then answers `"ai":true`: the AI button and Alfond appear.
Without these variables the AI button and Alfond's floating button stay hidden,
Alfond's page says it isn't switched on, and "Explain this" shows only the
matching passages from the notes.

## Class Drive (optional)

The Class Drive page lists a shared Google Drive folder for signed-in
students. The server walks the folder with the Drive API, keeps the listing
for five minutes (a student's Refresh asks again after 30 seconds) and saves
the latest copy in MongoDB for cold starts. Only names and file ids reach the
browser, never folder ids, and nothing from the Drive goes into the static
pages, the search index or the knowledge map.

1. In [Google Cloud](https://console.cloud.google.com/), enable the **Google
   Drive API** and create an **API key** under APIs & Services → Credentials.
   Restrict it to the Drive API.
2. Share the folder as "Anyone with the link" (**Viewer** is enough; see
   below).
3. In Vercel → Environment Variables, set `GOOGLE_DRIVE_API_KEY` and
   `GOOGLE_DRIVE_FOLDER_ID` (the folder's id, or its whole share link).
   `GOOGLE_DRIVE_REFRESH_MINUTES` (optional) changes the five minutes.
4. Linked folders. A big folder from elsewhere, such as past cohorts'
   PENDPRODUKTIF, would use up the walk's budget of 600 folders and push
   other files out. Add a **shortcut** to it anywhere in the class folder
   (in Drive: right-click → Organize → Add shortcut): every folder shortcut
   is loaded on demand. Its own files and folder names are listed, and each
   of its folders is read from Drive, with a budget of its own, only when a
   student opens it. The linked folder must be shared by link too. A folder
   you'd rather not add a shortcut for can be put in
   `GOOGLE_DRIVE_ON_DEMAND_FOLDERS` instead (ids or share links, separated by
   commas); it then appears at the top of the Class Drive the same way.
5. Redeploy. `/api/config` then answers `"drive":true`.

Students open files in Google's viewer, so they get the folder's own sharing
rights: if the folder is shared as "Anyone with the link can **edit**", any
student can rename, change or remove the class's files from there. Share it as
**Viewer** and keep editing for the people who upload.

## Version and build

The footer of every page shows the app's version and build, worked out by
`scripts/build-info.mjs` when the site is built: the version counts the
repository's commits (149 commits is `v0.1.49`: hundreds are the minor
version, the rest the patch), and the build is the commit's short hash,
linking to it on GitHub with its subject as the tooltip. Vercel clones only
the latest commits, so the script fetches the rest of the history first (or,
failing that, asks GitHub's API for the count). Without git it shows `dev`.

## Search engines

`npm run build` ends with `scripts/prerender.mjs`, which writes a static page for
every public route into `dist/`: its own title, description, canonical URL and
breadcrumbs, with the content itself (card fronts, quiz questions, full ebook
chapters, summaries and help pages) as plain HTML. Past exam papers are listed
by name only.
`vercel.json` serves those pages directly, so search engines don't have to run
the app to read them, and people get the app as usual (React replaces the static
content on start). The same step writes `sitemap.xml`, `robots.txt` (which keeps
the API, lecture PDFs, slide figures and past-paper images out of search) and
`404.html`. Titles and descriptions come from `src/lib/routeMeta.ts`, which the
app also uses to update the page title while you navigate. Personal pages
(progress, account, leaderboard, search, exam plan, Alfond, Class Drive) are
`noindex`, and preview deployments on `*.vercel.app` send
`X-Robots-Tag: noindex`.

To get indexed:

1. In [Google Search Console](https://search.google.com/search-console), add a
   **Domain** property for `necr.help` and verify it with the DNS TXT record it
   shows you (at your domain registrar). Alternatively add a URL-prefix property
   for `https://medicine.necr.help`, choose the **HTML tag** method, and put the
   token (the `content` value only) in Vercel as `GOOGLE_SITE_VERIFICATION`, then
   redeploy.
2. **Sitemaps**: submit `https://medicine.necr.help/sitemap.xml`.
3. **URL inspection**: inspect the home page and a chapter page, and **Request
   indexing**.

## Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project, then open **Google Auth Platform** and **Get started**: app name
   "Medicine", your support email, audience **External**.
2. **Branding**: home page `https://medicine.necr.help`, privacy policy
   `https://medicine.necr.help/privacy`, terms of service
   `https://medicine.necr.help/terms`, authorized domain `necr.help`. Skip
   the logo (uploading one starts a Google review).
3. **Audience**: **Publish app**. While it's in "Testing", only listed test
   users can sign in. The app asks only for name, email and profile picture, so
   publishing needs no review.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origin: `https://medicine.necr.help`
   - Authorized redirect URI: `https://medicine.necr.help/api/auth/callback/google`
5. Copy the client ID and secret into Vercel as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, and redeploy. `/api/config` then answers
   `"google":true` and the button appears.

Google doesn't accept wildcard redirect URIs, so preview deployments on
`*.vercel.app` can't use Google sign-in unless you add their exact callback
URL. For local testing, add `http://localhost:5173` and
`http://localhost:5173/api/auth/callback/google` to the client and run
`npm run dev:api` with both variables set.

The link-preview tags in `index.html` (Open Graph, Twitter) point at
`https://medicine.necr.help`. A fork deployed elsewhere sets `SITE_URL` at build
time.

Collections and indexes (listed in `server/schema.ts`) are created
automatically. Any static host with an SPA
fallback works for guest-only mode, if it sends the same no-cache headers.
