import { labTextId } from "./sections/labText";
import type { Language } from "./i18n";

/**
 * The Virtual Lab's content (activities, instructions, check questions, axis and column names)
 * is written once in English (lib/labActivities.ts, lib/labModes.ts). In Indonesian each English
 * string is looked up in labTextId; anything missing falls back to the English, and a test checks
 * that nothing is missing. Button names from the PhysioEx program (Stimulate, Record Data, Clear
 * Tracings, Plot Data, Measure…) are the program's own, so they stay in English in both.
 */
export function labText(language: Language, english: string): string {
  return language === "id" ? (labTextId[english] ?? english) : english;
}
