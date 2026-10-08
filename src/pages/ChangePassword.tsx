import { useState, type FormEvent } from "react";
import { useAccount } from "../hooks/useAccount";
import { useI18n } from "../i18n/useI18n";
import { useMessage } from "../i18n/useMessage";

/**
 * A new password. On first sign-in (`required`) it's the only page there is until it's done;
 * from the Account page it also asks for the current password.
 */
export function ChangePasswordForm({ required = false, onDone }: { required?: boolean; onDone?: () => void }) {
  const { changePassword } = useAccount();
  const { t } = useI18n();
  const message = useMessage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== repeat) { setError("password.mismatch"); return; }
    setBusy(true);
    const r = await changePassword({ current: required ? undefined : current, next });
    setBusy(false);
    if (!r.ok) { setError(r.message ?? "common.error"); return; }
    setDone(true);
    setCurrent(""); setNext(""); setRepeat("");
    onDone?.();
  };

  return (
    <form className="account-form" onSubmit={submit}>
      {!required && (
        <label className="account-field">
          <span>{t("password.current")}</span>
          <input className="form-input" type="password" required autoComplete="current-password" value={current}
            onChange={(e) => { setCurrent(e.target.value); }} />
        </label>
      )}
      <label className="account-field">
        <span>{t("password.new")}</span>
        <input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={next}
          onChange={(e) => { setNext(e.target.value); }} />
      </label>
      <label className="account-field">
        <span>{t("password.confirm")}</span>
        <input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={repeat}
          onChange={(e) => { setRepeat(e.target.value); }} />
      </label>
      {error && <p className="account-error" role="alert">{message(error)}</p>}
      {done && !required && <p className="account-success">{t("password.done")}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? t("common.saving") : t("password.save")}</button>
    </form>
  );
}

export function ChangePassword() {
  const { signOut } = useAccount();
  const { t } = useI18n();
  return (
    <main className="auth-page" id="main-content">
      <div className="account-card auth-card">
        <h1>{t("password.title")}</h1>
        <p className="account-note">{t("password.subtitle")}</p>
        <ChangePasswordForm required />
        <button type="button" className="btn btn-link" onClick={() => void signOut()}>{t("auth.signOut")}</button>
      </div>
    </main>
  );
}
