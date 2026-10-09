import type { ReactNode } from "react";
import { useAccount } from "../hooks/useAccount";
import { useI18n } from "../i18n/useI18n";
import { supabaseConfigError } from "../lib/db/client";
import { ChangePassword } from "../pages/ChangePassword";
import { SignIn } from "../pages/SignIn";
import { PulseLine } from "./PulseLine";

/**
 * The one place that decides whether the app shows. Every page needs a roster student signed
 * in, with their profile and progress loaded and their first password replaced.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, signOut, retry } = useAccount();
  const { t } = useI18n();

  if (supabaseConfigError) {
    return <main className="auth-status"><p>{t("auth.notConfigured")}</p></main>;
  }
  if (status === "checking" || status === "loading") {
    return (
      <main className="auth-status" role="status" aria-label={t("common.loading")}>
        <PulseLine />
      </main>
    );
  }
  if (status === "signed-out") return <SignIn />;
  if (status === "failed" || !user) {
    return (
      <main className="auth-status">
        <div>
          <p>{t("auth.progressFailed")}</p>
          <div className="account-row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <button type="button" className="btn" onClick={retry}>{t("common.retry")}</button>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>{t("auth.signOut")}</button>
          </div>
        </div>
      </main>
    );
  }
  if (user.mustChangePassword) return <ChangePassword />;
  return children;
}
