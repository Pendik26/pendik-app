// The in-app help (/docs): one Markdown page per topic in content/help/, listed in order by
// content/help/meta.json. The list is small and loads with the app (titles, search, page
// meta); each page's text is its own chunk, fetched when it's opened. Indonesian versions live
// in content/help/id/ (pages) and content/help/meta.id.json (titles); a page without one shows
// in English.

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
const metaIdModules = import.meta.glob<Partial<HelpPage>[]>("../../content/help/meta.id.json", { eager: true, import: "default" });
const pageIdModules = import.meta.glob<string>("../../content/help/id/*.md", { import: "default", query: "?raw" });

export type HelpLanguage = "id" | "en";

/** Every help page, in reading order. */
export const helpPages: readonly HelpPage[] = Object.values(metaModules).at(0) ?? [];

/** Ids of the Markdown files present (meta.json may only list these). */
export const helpFileIds: readonly string[] = Object.keys(pageModules).map((path) => path.replace(/^.*\/|\.md$/g, ""));

export function helpPage(id: string): HelpPage | undefined {
  return helpPages.find((p) => p.id === id);
}

/** Ids of the Indonesian Markdown files present. */
export const helpFileIdsId: readonly string[] = Object.keys(pageIdModules).map((path) => path.replace(/^.*\/|\.md$/g, ""));

const indonesianMeta = new Map((Object.values(metaIdModules).at(0) ?? []).map((p) => [p.id ?? "", p]));

/** Every help page in reading order, titled in `language` where a translation exists. */
export function helpPagesIn(language: HelpLanguage): readonly HelpPage[] {
  if (language === "en") return helpPages;
  return helpPages.map((p) => {
    const t = indonesianMeta.get(p.id);
    return t ? { ...p, title: t.title ?? p.title, description: t.description ?? p.description, group: t.group ?? p.group, keywords: `${t.keywords ?? ""} ${p.keywords ?? ""}`.trim() } : p;
  });
}

/** The page's Markdown in `language` (English when it has no translation), or undefined for an unknown id. */
export async function loadHelpPage(id: string, language: HelpLanguage = "en"): Promise<string | undefined> {
  if (language === "id") {
    const translated = new Map(Object.entries(pageIdModules)).get(`../../content/help/id/${id}.md`);
    if (translated && helpPage(id)) return translated();
  }
  const load = new Map(Object.entries(pageModules)).get(`../../content/help/${id}.md`);
  return load ? load() : undefined;
}

/** The help pages grouped for the index, groups in the order they first appear. */
export function helpGroups(language: HelpLanguage = "en"): { label: string; pages: HelpPage[] }[] {
  const groups = new Map<string, HelpPage[]>();
  for (const page of helpPagesIn(language)) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  return [...groups].map(([label, pages]) => ({ label, pages }));
}
