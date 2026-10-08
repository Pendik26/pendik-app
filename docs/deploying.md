# Deploying

Pendik is two pieces:

- **Supabase** (one project): sign-in, the Postgres database, and three Edge
  Functions (`ai`, `admin-accounts`, `drive-sync`). Everything in
  [`supabase/`](../supabase/).
- **Vercel**: the built static site (`npm run build` → `dist/`). There is no
  server code on Vercel.

A GitHub Action (`.github/workflows/drive-sync.yml`) copies the class Google
Drive into the database every morning.

The steps below go in order. Each one says how to check it worked.

## With Vercel's Supabase integration

Connecting Supabase from the Vercel project (Storage / Integrations →
Supabase) creates the Supabase project and sets these on Vercel for you:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `…_ANON_KEY`) | the app: the build reads them in place of `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` | also accepted by the build, as a fallback |
| `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | nothing in the app; the build never puts them in the page, and stops if one is set as the public key |
| `POSTGRES_URL_NON_POOLING` | applying the schema from your computer (step 1) |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, the other `POSTGRES_*` | nothing |

So with the integration, step 4's two Supabase variables are already done,
and "create the project" in step 1 is too. The integration sets them for
**Production** only: a Preview deployment shows "Supabase isn't configured"
until you tick Preview for the two `NEXT_PUBLIC_` variables in Vercel →
Settings → Environment Variables.

Everything else below is still by hand: applying the schema (step 1),
sign-in settings and Google (step 2), Edge Function secrets and deploy (step
3), `VITE_AI_ENABLED` (step 4), the Drive sync (step 5), and the first admin,
roster and past papers (step 6).

## 1. Create the Supabase project

Use a **new** project. The tables here were written from scratch in English
(`questions`, `packages`, `attempts`, `drive_files`…), and penpro's old
project has its own `roster` and `profiles` tables that would clash. The old
data comes over through the admin pages instead (roster paste, question
import), see [step 6](#6-first-admin-roster-and-past-papers).

1. At [supabase.com](https://supabase.com), create a project. Region:
   Singapore (`ap-southeast-1`), next to the students.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link
   this repo to the project:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   ```

3. Apply the schema:

   ```sh
   supabase db push
   ```

   This runs `supabase/migrations/*.sql` in order. Without `supabase
   link`, give it the database directly: `supabase db push --db-url
   "$POSTGRES_URL_NON_POOLING"` (with the integration, copy that value from
   Vercel; it holds the database password, so keep it off GitHub).
   **Check:** Table Editor shows `roster`, `profiles`, `questions`,
   `packages`, `attempts`, `drive_files`, `progress` and the rest.

## 2. Sign-in settings

In the dashboard, **Authentication**:

1. **Sign In / Providers → Email**: keep it enabled (NIM sign-in uses it
   behind the scenes), turn **off** "Allow new users to sign up" and
   "Confirm email". Students never sign themselves up: an admin activates
   them from the roster.
2. **Sign In / Providers → Allow manual linking**: on. This lets a signed-in
   student link Google from the Account page.
3. **URL Configuration**: Site URL = the app's address (for example
   `https://pendik-app.vercel.app`). Redirect URLs: add
   `https://pendik-app.vercel.app/**` and, for local work,
   `http://localhost:5173/**`.

### Google

1. In the [Google Cloud console](https://console.cloud.google.com/), open
   **Google Auth Platform**: app name "Pendik", audience **External**, then
   **Publish app** (it only asks for name and email, so there's no review).
2. **Clients → Create client → Web application**. Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase → Authentication → Sign In / Providers → **Google**, paste the
   client ID and secret and enable it.

A Google account only gets in after the student has linked it from their
Account page while signed in with their NIM. Anyone else's Google sign-in is
refused (`auth.notOnRoster`).

## 3. Edge Function secrets and deploy

Set the secrets (Project Settings → Edge Functions → Secrets, or the CLI):

```sh
supabase secrets set \
  APP_ORIGINS=https://pendik-app.vercel.app,http://localhost:5173 \
  AI_BASE_URL=https://<gateway>/v1 \
  AI_API_KEY=... \
  AI_MODEL=model-a,model-b \
  AI_DAILY_LIMIT=30 \
  GOOGLE_SERVICE_ACCOUNT="$(cat service-account.json)" \
  DRIVE_ROOT_FOLDER_ID=https://drive.google.com/drive/folders/... \
  DRIVE_SYNC_SECRET="$(openssl rand -hex 32)"
```

| Secret | Used by | What it is |
| --- | --- | --- |
| `APP_ORIGINS` | all three | the app's addresses, comma-separated; other sites' browsers are refused |
| `AI_BASE_URL` | `ai` | an OpenAI-compatible gateway, up to and including `/v1` |
| `AI_API_KEY` | `ai` | the gateway's key |
| `AI_MODEL` | `ai` | one model id, or several comma-separated as fallbacks |
| `AI_DAILY_LIMIT` | `ai` | answers per student per day (optional, default 30) |
| `GOOGLE_SERVICE_ACCOUNT` | `drive-sync` | a Google Cloud service account's JSON key (see [step 5](#5-class-drive-sync)) |
| `DRIVE_ROOT_FOLDER_ID` | `drive-sync` | the class folder's id or share link |
| `DRIVE_SYNC_SECRET` | `drive-sync` | a random string the GitHub Action sends; keep a copy for step 5 |
| `DRIVE_SYNC_BUDGET_MS` | `drive-sync` | optional: how long one call walks the Drive before handing over |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions
automatically.

Then deploy the functions:

```sh
supabase functions deploy ai
supabase functions deploy admin-accounts
supabase functions deploy drive-sync --no-verify-jwt
```

`drive-sync` is called by the GitHub Action with the shared secret rather
than a user's token, so it skips Supabase's own token check and does its
own (`supabase/config.toml` records the same settings). **Check:** the
Edge Functions page lists all three.

## 4. Vercel

1. Import the GitHub repo in Vercel. `vercel.json` already sets the build
   command, output directory and rewrites.
2. Environment variables (Settings → Environment Variables; they're built
   into the page, so only public values):

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` (or the integration's `NEXT_PUBLIC_SUPABASE_URL`) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → publishable (anon) key (or the integration's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |
   | `VITE_AI_ENABLED` | `true` once the `AI_*` secrets are set, otherwise leave it out |
   | `SITE_URL` | optional: the public address, if it isn't `https://pendik-app.vercel.app` |

3. Deploy. **Check:** the site opens on the sign-in page.

If the address isn't `pendik-app.vercel.app`, also update the Supabase Site
URL and redirect URLs (step 2) and `APP_ORIGINS` (step 3).

## 5. Class Drive sync

The Class Drive page reads the `drive_files` table, which `drive-sync` fills
from the class's Google Drive folder. Students never talk to Google's API
themselves.

1. In Google Cloud, enable the **Google Drive API** and create a **service
   account** (IAM & Admin → Service Accounts). Create a JSON key for it: that
   file is `GOOGLE_SERVICE_ACCOUNT`.
2. Share the class folder with the service account's email as **Viewer**.
   Linked folders (Drive shortcuts inside the class folder) are followed too,
   so share their targets with it as well.
3. In the GitHub repo → Settings → Secrets and variables → Actions, add:
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `DRIVE_SYNC_SECRET`: the same value as the function's secret.
4. Run it once: Actions → **Drive sync** → Run workflow. After that it runs
   every day at 05:00 WIB.

Each call walks the Drive for a limited time and saves where it got to, so
the Action calls again until the run is done. A run that would hide more
than 30% of the files (and more than 10), or that couldn't read some
folders, is **held** instead of applied, in case the Drive was only
half-readable. An admin can look at it and let it go ahead from **Admin →
Drive**, or run a sync from there. **Check:** Admin → Drive shows a finished
run, and the Class Drive page lists files.

Students open files in Google's viewer with the folder's own sharing rights,
so share the class folder with students as **Viewer** and keep editing for
the people who upload.

## 6. First admin, roster and past papers

Admins are students with `role = 'admin'`. The first one has to be made by
hand, once, in the SQL editor (replace the NIM and name):

```sql
insert into public.roster (student_id, full_name, class_group, cohort)
values ('2601001', 'Nama Lengkap', 'A', '2026');
```

Then Authentication → Users → **Add user → Create new user**: email
`2601001@pendik26.internal` (the NIM, lower case), password `pendik262601001`
(`pendik26` + NIM), **Auto Confirm User** on. Then:

```sql
insert into public.profiles (id, student_id, full_name, class_group, cohort, role)
select u.id, r.student_id, r.full_name, r.class_group, r.cohort, 'admin'
from auth.users u
join public.roster r on u.email = lower(r.student_id) || '@pendik26.internal'
where r.student_id = '2601001';
```

Sign in to the app with that NIM and password; it asks for a new password
first. **Admin** now shows in the sidebar. From there:

1. **Admin → Students → Add students**: paste the roster, one student per
   line as `NIM, full name, class, cohort`. A cell that says `IUP` or
   `Reguler` anywhere after the name puts that student in that class; the
   **Class for lines that don't say** menu sets it for everyone else in the
   paste, and the Class column changes it later. Select them and
   **Activate**:
   each gets the first password `pendik26` + NIM, and must change it on
   first sign-in. Make other admins with **Make admin**.
2. **Admin → Import**: import the past papers, one Markdown file at a time
   (the format is in [questions.md](questions.md)). The three Block 1.1
   papers the medicine app had (Original Set, Costraver, UB 2025) have been
   converted to this format as `block-1.1-original.md`,
   `block-1.1-costraver.md` and `block-1.1-ub2025.md`. They're kept outside
   the repo so the answer keys don't sit in it; their images are already in
   `public/question-images/1.1/`. Each import makes an exam package and a
   practice package as drafts.
3. **Admin → Packages**: check the questions, set the package's class (both
   by default, or IUP or Reguler only), then **Publish**. Students only see
   published packages, and the questions in published practice packages
   make up the bank for **Practice from the bank**. **Admin → Questions**
   searches every question across packages.

Question images live in the repo under `public/question-images/` and are
referenced from the Markdown by path (`![figure](/question-images/1.1/x.svg)`).

## Version and build

The footer of every page shows the app's version and build, worked out by
`scripts/build-info.mjs` when the site is built: the version counts the
repository's commits (149 commits is `v0.1.49`: hundreds are the minor
version, the rest the patch), and the build is the commit's short hash,
linking to it on GitHub with its subject as the tooltip. Vercel clones only
the latest commits, so the script fetches the rest of the history first (or,
failing that, asks GitHub's API for the count). Without git it shows `dev`.

## Search engines

Every page needs sign-in, so the app isn't meant to be found by search. The
build still prerenders a static page per route (`scripts/prerender.mjs`) so
deep links load fast, and `robots.txt` keeps question images, lecture PDFs and
slide figures out. Deployments on `*.vercel.app` send `X-Robots-Tag: noindex`
(see `vercel.json`).

The study content (flashcards, quizzes, ebooks, summaries, lecture PDFs) is
part of the built site, so anyone with a file's address can fetch it even
without signing in. Exam questions and answer keys are not: they're only in
the database, and an exam's answer keys never reach the browser before the
attempt is submitted.
