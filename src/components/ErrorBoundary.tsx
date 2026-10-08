import { Component, useContext, type ErrorInfo, type ReactNode } from "react";
import { I18nContext, storedLanguage, translate, type Translate } from "../i18n/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere below it so a single bad value (most often
 * a localStorage entry whose shape no longer matches what the current build expects,
 * e.g. after a content/schema change) can't take down the whole app with a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    const prefix = "pendik:";
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return <ErrorScreen onReload={this.handleReload} onReset={this.handleClearAndReload} />;
  }
}

/** The fallback screen, in the app's language even when the error happened outside its provider. */
function ErrorScreen({ onReload, onReset }: { onReload: () => void; onReset: () => void }) {
  const context = useContext(I18nContext);
  const t: Translate = context?.t ?? ((key, vars) => translate(storedLanguage(), key, vars));
  return (
    <div className="error-boundary">
      <div className="error-boundary-card">
        <h1>{t("crash.title")}</h1>
        <p>{t("crash.body")}</p>
        <div className="error-boundary-actions">
          <button type="button" className="btn" onClick={onReload}>
            {t("crash.reload")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            {t("crash.reset")}
          </button>
        </div>
        <p className="error-boundary-hint">{t("crash.resetHint")}</p>
      </div>
    </div>
  );
}
