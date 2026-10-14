import type { PackageSummary } from "./exams";

export interface PackageFilter {
  text: string;
  status: "" | "published" | "draft";
  mode: "" | "exam" | "practice";
  block: string;
  source: string;
  year: string;
}

export const NO_FILTER: PackageFilter = { text: "", status: "", mode: "", block: "", source: "", year: "" };

/** The values that occur, without gaps, in natural order. */
export const distinct = <T extends string | number>(xs: (T | null)[]): T[] =>
  [...new Set(xs.filter((x): x is T => x !== null))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

/** The packages that match every filter that is set. */
export function filterPackages(packages: readonly PackageSummary[], f: PackageFilter): PackageSummary[] {
  const text = f.text.trim().toLowerCase();
  return packages.filter(
    (p) =>
      (!text || p.title.toLowerCase().includes(text)) &&
      (!f.status || p.status === f.status) &&
      (!f.mode || p.mode === f.mode) &&
      (!f.block || p.block === f.block) &&
      (!f.source || p.source === f.source) &&
      (!f.year || String(p.year) === f.year),
  );
}

/** The spelling already in use for this value, ignoring case and extra spaces; else the value tidied. */
export function matchSpelling(value: string, existing: readonly string[]): string {
  const tidy = value.replace(/\s+/g, " ").trim();
  const key = tidy.toLowerCase();
  return existing.find((x) => x.replace(/\s+/g, " ").trim().toLowerCase() === key) ?? tidy;
}
