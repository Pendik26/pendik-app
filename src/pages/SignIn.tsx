import { useState, type FormEvent } from "react";
import { GoogleIcon } from "../components/GoogleIcon";
import { useAccount } from "../hooks/useAccount";
import { useI18n } from "../i18n/useI18n";
import { useMessage } from "../i18n/useMessage";
import { ThemeToggle } from "../components/ThemeToggle";
import { LanguageSwitch } from "../components/LanguageSwitch";

/** The whole app sits behind this page until a roster student signs in. */
export function SignIn() {
  const { signIn, signInWithGoogle, notice } = useAccount();
  const { t } = useI18n();
  const message = useMessage();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("password");
    setError(null);
    const r = await signIn(studentId, password);
    // On success the account context takes over and this page goes away.
    if (!r.ok) {
      setBusy(null);
      setError(r.message ?? "auth.wrong");
    }
  };

  const google = async () => {
    setBusy("google");
    setError(null);
    const r = await signInWithGoogle();
    if (!r.ok) {
      setBusy(null);
      setError(r.message ?? "common.error");
    }
  };

  return (
    <main className="auth-page" id="main-content">
      <div className="auth-corner">
        <LanguageSwitch compact />
        <ThemeToggle />
      </div>
      <div className="account-card auth-card">
        <div className="auth-brand" aria-hidden="true">P</div>
        <h1>{t("auth.title")}</h1>
        <p className="account-note">{t("auth.subtitle")}</p>
        {(error ?? notice) && (
          <p className="account-error" role="alert">
            {message(error ?? notice)}
          </p>
        )}
        <form className="account-form" onSubmit={submit}>
          <label className="account-field">
            <span>{t("auth.studentId")}</span>
            <input
              className="form-input"
              required
              inputMode="numeric"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={studentId}
              onChange={(e) => { setStudentId(e.target.value); }}
            />
          </label>
          <label className="account-field">
            <span>{t("auth.password")}</span>
            <input
              className="form-input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
            />
          </label>
          <button type="submit" className="btn" disabled={busy !== null}>
            {busy === "password" ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>
        <p className="account-note">{t("auth.firstTime")}</p>
        <div className="account-divider"><span>{t("auth.or")}</span></div>
        <button type="button" className="btn btn-secondary account-google" disabled={busy !== null} onClick={() => void google()}>
          <GoogleIcon />
          {t("auth.google")}
        </button>
        <p className="account-note">{t("auth.googleHint")}</p>
      </div>
    </main>
  );
}
