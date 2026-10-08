// The app's version and build, put in by the build (scripts/build-info.mjs via vite.config.ts):
// the version counts the repository's commits (149 → v0.1.49), the build is the commit.

export interface BuildInfo {
  /** "v0.1.49", or "dev" when the count couldn't be worked out. */
  version: string;
  commits: number | null;
  sha: string;
  short: string;
  /** The commit's subject line. */
  subject: string;
  builtAt: string;
}

declare const __BUILD_INFO__: BuildInfo | undefined;

export const BUILD: BuildInfo =
  typeof __BUILD_INFO__ === "undefined" ? { version: "dev", commits: null, sha: "", short: "", subject: "", builtAt: "" } : __BUILD_INFO__;

export const SOURCE_URL = "https://github.com/Pendik26/pendik-app";

/** The commit on GitHub, or the repository when the build doesn't know its commit. */
export const commitUrl = (info: BuildInfo = BUILD) => (info.sha ? `${SOURCE_URL}/commit/${info.sha}` : SOURCE_URL);
