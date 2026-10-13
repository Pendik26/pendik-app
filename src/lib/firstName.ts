/**
 * "Muhammad" is a very common first word in Indonesian names, so it says little about who a person is.
 * These spellings (and abbreviations such as "M." or "Moh.") are skipped when a short name is taken.
 * Pure on purpose: the server imports it too, so greetings, avatars and the leaderboard agree.
 */
const COMMON_PREFIXES = new Set([
  "muhammad", "muhamad", "mohammad", "mohamad", "mohammed", "muhammed", "mohd", "mhd", "moh", "muh", "m",
]);

const words = (fullName: string): string[] => fullName.trim().split(/\s+/).filter(Boolean);

const isCommonPrefix = (word: string): boolean => COMMON_PREFIXES.has(word.toLowerCase().replace(/[.,]+$/, ""));

/** Words of a name with a leading "Muhammad"-style prefix dropped, unless nothing else is left. */
function significantWords(fullName: string): string[] {
  const all = words(fullName);
  const first = all[0];
  return first !== undefined && all.length > 1 && isCommonPrefix(first) ? all.slice(1) : all;
}

/** "Muhammad Affan Hassya Purnomo" → "Affan"; "Budi Santoso" → "Budi"; "" → "". */
export function firstName(fullName: string): string {
  return significantWords(fullName)[0] ?? "";
}

/** Up to two capital letters for an avatar, skipping the prefix: "Muhammad Affan Hassya" → "AH". */
export function initialsOf(fullName: string): string {
  return (
    significantWords(fullName)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
