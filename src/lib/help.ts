// The in-app help (/docs): one Markdown page per topic in content/help/, listed in order by
// content/help/meta.json. The list is small and loads with the app (titles, search, page
// meta); each page's text is its own chunk, fetched when it's opened.

export interface HelpPage {
  id: string;
  title: string;
  /** One sentence: shown on the help index, in search results and as the page description. */
  description: string;
  /** The heading the page is listed under on the help index. */
  group: string;
  /** Extra words search should match (not shown). */
  keywords?: string;
}

const metaModules = import.meta.glob<HelpPage[]>("../../content/help/meta.json", { eager: true, import: "default" });
const pageModules = import.meta.glob<string>("../../content/help/*.md", { import: "default", query: "?raw" });

/** Every help page, in reading order. */
export const helpPages: readonly HelpPage[] = Object.values(metaModules).at(0) ?? [];

/** Ids of the Markdown files present (meta.json may only list these). */
export const helpFileIds: readonly string[] = Object.keys(pageModules).map((path) => path.replace(/^.*\/|\.md$/g, ""));

export function helpPage(id: string): HelpPage | undefined {
  return helpPages.find((p) => p.id === id);
}

/** The page's Markdown, or undefined for an unknown id. */
export async function loadHelpPage(id: string): Promise<string | undefined> {
  const load = new Map(Object.entries(pageModules)).get(`../../content/help/${id}.md`);
  return load ? load() : undefined;
}

/** The help pages grouped for the index, groups in the order they first appear. */
export function helpGroups(): { label: string; pages: HelpPage[] }[] {
  const groups = new Map<string, HelpPage[]>();
  for (const page of helpPages) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  return [...groups].map(([label, pages]) => ({ label, pages }));
}
