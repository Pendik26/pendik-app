// Runs the Supabase CLI on database/. The CLI only looks for a folder named `supabase/`, so this
// links one to database/ in node_modules/.cache and points the CLI's --workdir there.
//   npm run supabase -- db push --db-url "$POSTGRES_URL_NON_POOLING"
//   npm run supabase -- functions deploy ai
// Uses a `supabase` on the PATH if there is one, otherwise `npx supabase`.
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const database = join(root, "database");
const workdir = join(root, "node_modules", ".cache", "supabase-cli");
const link = join(workdir, "supabase");

function linked() {
  try {
    return lstatSync(link).isSymbolicLink() && resolve(workdir, readlinkSync(link)) === database;
  } catch {
    return false;
  }
}

if (!linked()) {
  mkdirSync(workdir, { recursive: true });
  rmSync(link, { recursive: true, force: true });
  // A junction needs no special rights on Windows; elsewhere it's a plain symlink.
  symlinkSync(database, link, process.platform === "win32" ? "junction" : "dir");
}

const args = ["--workdir", workdir, ...process.argv.slice(2)];
const shell = process.platform === "win32";
let run = spawnSync("supabase", args, { stdio: "inherit", shell });
if (run.error && run.error.code === "ENOENT") run = spawnSync("npx", ["--yes", "supabase@2", ...args], { stdio: "inherit", shell });
if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}
process.exit(run.status ?? 1);
