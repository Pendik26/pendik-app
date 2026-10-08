import type { ModulePdf } from "./content";

export interface ModuleSection {
  id: string;
  label: string;
  pdfs: ModulePdf[];
}

export interface ModuleGroup {
  id: string;
  label: string;
  sections: ModuleSection[];
}

// Shown in full (empty ones as placeholders) as soon as a subject puts any PDF in a subfolder.
const STANDARD_SECTIONS = ["lecture", "practicum/reports", "practicum/assistance"];

function titleize(segment: string): string {
  const spaced = segment.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Groups a subject's module PDFs by their subfolder path ("lecture", "practicum/assistance", …).
 * Returns null for a subject whose PDFs all sit directly in its folder — render that as a flat list.
 */
export function groupModules(pdfs: ModulePdf[]): ModuleGroup[] | null {
  if (!pdfs.some((p) => p.section)) return null;

  const extra = Array.from(new Set(pdfs.map((p) => p.section)))
    .filter((s) => s && !STANDARD_SECTIONS.includes(s))
    .sort();
  const sectionIds = [...STANDARD_SECTIONS, ...extra];
  if (pdfs.some((p) => !p.section)) sectionIds.push("");

  const groups: ModuleGroup[] = [];
  for (const id of sectionIds) {
    const [top, ...rest] = id ? id.split("/") : ["other"];
    let group = groups.find((g) => g.id === top);
    if (!group) {
      group = { id: top, label: titleize(top), sections: [] };
      groups.push(group);
    }
    group.sections.push({
      id,
      label: rest.map(titleize).join(" / "),
      pdfs: pdfs.filter((p) => p.section === id),
    });
  }
  return groups;
}
