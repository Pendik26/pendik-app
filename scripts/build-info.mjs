// The app's version and build, worked out from git when the site is built (see vite.config.ts):
// the version comes from how many commits the repository has (149 → v0.1.49), and the build is
// the commit's short hash and subject. Vercel clones only the latest commits, so the count is
// completed by fetching the rest of the history, or asked from GitHub, before giving up.
import { execFileSync } from "node:child_process";

const REPO = "neccrr/medicine";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 }).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

/** v0.{hundreds}.{rest}: 149 commits → v0.1.49. */
export function versionFromCount(count) {
  if (!Number.isInteger(count) || count < 1) return "v0.0.0";
  return `v0.${Math.floor(count / 100)}.${count % 100}`;
}

/** The commit count from GitHub: the page number of the last page, one commit per page. */
async function countFromGitHub(sha) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=${sha}&per_page=1`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "medicine-build" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(res.headers.get("link") ?? "")?.[1];
    return last ? Number(last) : (await res.json()).length || null;
  } catch {
    return null;
  }
}

export async function buildInfo(env = process.env) {
  const sha = tryGit("rev-parse", "HEAD") || env.VERCEL_GIT_COMMIT_SHA || "";
  const subject = tryGit("log", "-1", "--format=%s") || (env.VERCEL_GIT_COMMIT_MESSAGE ?? "").split("\n")[0];
  let count = null;
  if (sha) {
    if (tryGit("rev-parse", "--is-shallow-repository") === "true") tryGit("fetch", "--unshallow", "--quiet");
    if (tryGit("rev-parse", "--is-shallow-repository") === "false") count = Number(tryGit("rev-list", "--count", "HEAD")) || null;
    count ??= await countFromGitHub(sha);
  }
  return {
    version: count ? versionFromCount(count) : "dev",
    commits: count,
    sha,
    short: sha.slice(0, 7),
    subject: subject.slice(0, 120),
    builtAt: new Date().toISOString(),
  };
}
