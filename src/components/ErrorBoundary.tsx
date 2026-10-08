import { Component, type ErrorInfo, type ReactNode } from "react";

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
    const prefix = "medicine:";
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <h1>Something went wrong</h1>
          <p>
            The app hit an unexpected error and couldn't continue. This can happen when saved
            progress from an older version doesn't match what the app now expects.
          </p>
          <div className="error-boundary-actions">
            <button type="button" className="btn" onClick={this.handleReload}>
              Reload
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleClearAndReload}>
              Clear local data and reload
            </button>
          </div>
          <p className="error-boundary-hint">
            Clearing local data resets flashcard/quiz progress and reading positions on this
            device. Export a backup from Progress first if you can.
          </p>
        </div>
      </div>
    );
  }
}
