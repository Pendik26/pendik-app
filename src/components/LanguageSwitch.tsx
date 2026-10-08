import { useI18n } from "../i18n/useI18n";
import type { Language } from "../i18n/i18n";

/** Indonesian / English. `compact` shows "ID | EN" for corners; otherwise a labelled select. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  if (compact) {
    return (
      <div className="lang-switch" role="group" aria-label={t("account.language")}>
        {(["id", "en"] as Language[]).map((l) => (
          <button
            key={l}
            type="button"
            className={l === language ? "lang-switch-on" : undefined}
            aria-pressed={l === language}
            onClick={() => { setLanguage(l); }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }
  return (
    <label className="account-field">
      <span>{t("account.language")}</span>
      <select className="form-select" value={language} onChange={(e) => { setLanguage(e.target.value as Language); }}>
        <option value="id">{t("account.languageId")}</option>
        <option value="en">{t("account.languageEn")}</option>
      </select>
    </label>
  );
}
