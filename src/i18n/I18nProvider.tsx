import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { STORAGE_KEYS } from "../lib/storage";
import { I18nContext, translate, type Language, type MessageKey } from "./i18n";

// Interface language: Indonesian by default, English from the switch on the Account page. The
// choice belongs to this browser (like the theme), not the account.

function readLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.language) === '"en"' ? "en" : "id";
  } catch {
    return "id";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.language, JSON.stringify(next));
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
