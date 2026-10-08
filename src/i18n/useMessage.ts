import { useI18n } from "./useI18n";
import type { MessageKey } from "./i18n";

/** Messages from the account context are i18n keys when they look like one. */
export function useMessage() {
  const { t } = useI18n();
  return (message: string | null | undefined) =>
    message ? (/^[a-z]+\.[A-Za-z]+$/.test(message) ? t(message as MessageKey) : message) : "";
}
