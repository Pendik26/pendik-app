import { createContext } from "react";
import { en, id, type Messages } from "./messages";

export type Language = "id" | "en";
export type MessageKey = keyof Messages;

export interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  /** The message for `key` in the current language, with {name} placeholders filled in. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);

const dictionaries: Record<Language, Messages> = { id, en };

export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = dictionaries[language][key] ?? en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : match));
}

export type Translate = I18nValue["t"];

/** For code that runs outside the app's language (tests, the prerendered pages). */
export const englishT: Translate = (key, vars) => translate("en", key, vars);
