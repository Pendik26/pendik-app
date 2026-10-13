import { useCallback } from "react";
import { labText } from "./labText";
import { useI18n } from "./useI18n";

/** Translates a Virtual Lab string (see labText) into the language in use. */
export function useLabText(): (english: string) => string {
  const { language } = useI18n();
  return useCallback((english: string) => labText(language, english), [language]);
}
