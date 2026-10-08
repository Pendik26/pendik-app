import { useLocalStorage } from "./useLocalStorage";
import { STORAGE_KEYS } from "../lib/storage";

export interface ReadingPrefs {
  fontScale: number;
  accessibleFont: boolean;
}

export const READING_FONT_SCALES = [0.9, 1, 1.15, 1.3, 1.5];

const DEFAULT_READING_PREFS: ReadingPrefs = { fontScale: 1, accessibleFont: false };

export function useReadingPrefs() {
  return useLocalStorage<ReadingPrefs>(STORAGE_KEYS.readingPrefs, DEFAULT_READING_PREFS);
}
