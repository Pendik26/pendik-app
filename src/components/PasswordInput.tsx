import { useState, type InputHTMLAttributes } from "react";
import { useI18n } from "../i18n/useI18n";

/** A password field with a Show/Hide button, so a student can check what they typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input {...props} className="form-input" type={shown ? "text" : "password"} />
      <button type="button" className="password-toggle" aria-pressed={shown} onClick={() => { setShown(!shown); }}>
        {shown ? t("password.hide") : t("password.show")}
      </button>
    </div>
  );
}
