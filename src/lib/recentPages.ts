import { pageMeta } from "./routeMeta";
import { SITE_NAME } from "./site";
import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

// The pages a student opened last, for the command palette: "jump back to that chapter" is the
// most common thing anyone opens it for.

export interface RecentPage {
  path: string;
  title: string;
}

const KEPT = 8;
/** Pages not worth jumping back to. */
const SKIP = new Set(["/", "/search"]);

/** A page's short title: "Anatomy flashcards", not "Anatomy flashcards · Medicine". */
export function shortTitle(path: string): string {
  return pageMeta(path).title.replace(new RegExp(`\\s*[·|]\\s*${SITE_NAME}$`), "");
}

export function recentPages(): RecentPage[] {
  const list = readJSON<unknown>(STORAGE_KEYS.recentPages, []);
  return Array.isArray(list)
    ? list.filter((p): p is RecentPage => typeof p === "object" && p !== null && typeof (p as RecentPage).path === "string" && typeof (p as RecentPage).title === "string")
    : [];
}

/** Records a page as just opened (unknown pages and Home are skipped). */
export function rememberPage(path: string): void {
  if (SKIP.has(path)) return;
  const meta = pageMeta(path);
  if (!meta.indexable && !["/progress", "/plan", "/alfond", "/drive", "/leaderboard", "/account"].some((p) => path === p || path.startsWith(`${p}/`))) return;
  const page = { path, title: shortTitle(path) };
  writeJSON(STORAGE_KEYS.recentPages, [page, ...recentPages().filter((p) => p.path !== path)].slice(0, KEPT));
}
