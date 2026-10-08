import { useEffect, useState, type FormEvent } from "react";
import { AlfondOverlaySetting } from "../components/alfond/AlfondSetting";
import { GoogleIcon } from "../components/GoogleIcon";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { useAccount } from "../hooks/useAccount";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../i18n/useI18n";
import { studyBlocks } from "../lib/blocks";
import { exportAllProgress, STORAGE_KEYS } from "../lib/storage";
import { ChangePasswordForm } from "./ChangePassword";
import { useMessage } from "../i18n/useMessage";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** The block the student is in; Home shows it first and the daily plan follows it. */
function CurrentBlockPicker() {
  const { t } = useI18n();
  const [currentBlock, setCurrentBlock] = useLocalStorage<string>(STORAGE_KEYS.currentBlock, "");
  return (
    <label className="account-field">
      <span>{t("account.currentBlock")}</span>
      <select className="form-select" value={currentBlock} onChange={(e) => { setCurrentBlock(e.target.value); }}>
        <option value="">—</option>
        {studyBlocks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileCard() {
  const { user, updateSettings } = useAccount();
  const { t } = useI18n();
  const message = useMessage();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await updateSettings({ displayName: displayName.trim() });
    setBusy(false);
    setNote(r.ok ? "account.saved" : (r.message ?? "common.error"));
  };

  return (
    <div className="account-card account-profile">
      <div className="account-profile-head">
        <span className="account-avatar" aria-hidden="true">{initials(user.fullName)}</span>
        <div>
          <p className="account-name">{user.fullName}</p>
          <p className="account-email">
            {[user.studentId, user.track && t(user.track === "IUP" ? "track.iup" : "track.reguler"), user.classGroup && `${t("account.class")} ${user.classGroup}`, user.cohort]
              .filter(Boolean)
              .join(" · ")}
            {user.role === "admin" && ` · ${t("account.roleAdmin")}`}
          </p>
        </div>
      </div>
      <form className="account-form" onSubmit={save}>
        <label className="account-field">
          <span>{t("account.displayName")}</span>
          <input className="form-input" minLength={2} maxLength={32} value={displayName}
            placeholder={user.fullName.split(" ")[0]} onChange={(e) => { setDisplayName(e.target.value); }} />
          <small>{t("account.displayNameHint")}</small>
        </label>
        <div className="account-row">
          <button type="submit" className="btn btn-small" disabled={busy}>{t("common.save")}</button>
          {note && <span className="account-note">{message(note)}</span>}
        </div>
      </form>
      <CurrentBlockPicker />
      <AlfondOverlaySetting />
    </div>
  );
}

/** What came back from linking Google (?error_description=…), read once. */
function useLinkResult() {
  const [result] = useState(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, "&"));
    return params.get("error_description");
  });
  useEffect(() => {
    if (result) window.history.replaceState(null, "", window.location.pathname);
  }, [result]);
  return result;
}

function SignInCard() {
  const { googleLinked, linkGoogle } = useAccount();
  const { t } = useI18n();
  const linkError = useLinkResult();
  const [error, setError] = useState<string | null>(linkError);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="account-card">
      <h2>{t("account.signInMethods")}</h2>
      {googleLinked ? (
        <p className="account-success">{t("account.googleLinked")}</p>
      ) : (
        <>
          <p className="account-note">{t("account.googleNotLinked")}</p>
          <button type="button" className="btn btn-secondary account-google" disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await linkGoogle();
              // On success the page is already on its way to Google.
              if (!r.ok) { setBusy(false); setError(r.message ?? null); }
            }}>
            <GoogleIcon />
            {t("account.linkGoogle")}
          </button>
        </>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-divider" />
      {showPassword ? (
        <ChangePasswordForm />
      ) : (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { setShowPassword(true); }}>
          {t("account.changePassword")}
        </button>
      )}
    </div>
  );
}

function AppearanceCard() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="account-card">
      <h2>{t("account.appearance")}</h2>
      <LanguageSwitch />
      <label className="account-field">
        <span>{t("account.theme")}</span>
        <select className="form-select" value={theme} onChange={(e) => { if (e.target.value !== theme) toggleTheme(); }}>
          <option value="light">{t("account.themeLight")}</option>
          <option value="dark">{t("account.themeDark")}</option>
        </select>
      </label>
    </div>
  );
}

/** Whether everything is saved; progress lives in the account, so this is worth seeing. */
export function SaveStatus() {
  const { save, saveNow } = useAccount();
  const { t } = useI18n();
  const line =
    save.phase === "saving"
      ? t("save.saving")
      : save.phase === "error"
        ? t("save.failed", { message: save.message ?? "" })
        : save.pending > 0
          ? t("save.pending", { count: save.pending })
          : t("save.saved");
  return (
    <div className="account-row">
      <p className={save.phase === "error" ? "account-sync account-sync-error" : "account-sync"}>
        <span className={`account-sync-dot account-sync-${save.phase === "saving" ? "syncing" : save.phase}`} aria-hidden="true" />
        {line}
      </p>
      {(save.phase === "error" || save.pending > 0) && (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void saveNow()}>
          {t("save.now")}
        </button>
      )}
    </div>
  );
}

function DataCard() {
  const { user, signOut } = useAccount();
  const { t } = useI18n();
  const [confirmClear, setConfirmClear] = useState(false);

  const download = () => {
    const data = { profile: user, progress: exportAllProgress(), exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pendik-${user?.studentId ?? "account"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="account-card">
      <h2>{t("account.data")}</h2>
      <SaveStatus />
      <p className="account-note">{t("account.downloadHint")}</p>
      <button type="button" className="btn btn-secondary btn-small" onClick={download}>{t("account.download")}</button>
      <div className="account-divider" />
      <div className="account-row">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void signOut()}>{t("auth.signOut")}</button>
        {confirmClear ? (
          <>
            <button type="button" className="btn btn-small account-danger" onClick={() => void signOut({ clearDevice: true })}>
              {t("common.yes")}
            </button>
            <button type="button" className="btn btn-link" onClick={() => { setConfirmClear(false); }}>{t("common.cancel")}</button>
          </>
        ) : (
          <button type="button" className="btn btn-link" onClick={() => { setConfirmClear(true); }}>{t("account.signOutClear")}</button>
        )}
      </div>
    </div>
  );
}

export function Account() {
  const { t } = useI18n();
  return (
    <section className="page account-page">
      <h1>{t("account.title")}</h1>
      <div className="account-grid">
        <ProfileCard />
        <SignInCard />
        <AppearanceCard />
        <DataCard />
      </div>
    </section>
  );
}
