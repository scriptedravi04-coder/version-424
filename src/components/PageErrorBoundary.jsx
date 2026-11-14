import React from "react";
import { isChunkLoadError, recoverFromStaleBuild } from "../lib/staleBuild";

// Wraps ONE page. The app already has a top-level ErrorBoundary in index.jsx, but that one
// sits above everything — so any render error on any single screen replaces the entire
// application with an error page. Navigation is gone, the inbox is gone, the header is
// gone, and the only way out is a full reload.
//
// This boundary keeps the blast radius to the page that actually broke. The shell, the nav
// and every other route keep working, and the user can simply click somewhere else.
//
// It does not prevent crashes — it contains them. The fix for an actual crash still belongs
// in the page. Check the console for the component stack this logs.

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PageErrorBoundary] page crashed:", error, errorInfo?.componentStack);
    // v398: a screen file from an older version (after a deploy) → move to the new version by itself.
    if (isChunkLoadError(error) && recoverFromStaleBuild()) this.setState({ updating: true });
  }

  componentDidUpdate(prevProps) {
    // A new route should get a clean slate, otherwise the error screen sticks around
    // after the user navigates away from the broken page.
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error)) { this.setState({ updating: true }); recoverFromStaleBuild({ force: true }); return; }
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    if (isChunkLoadError(this.state.error)) { this.setState({ updating: true }); recoverFromStaleBuild({ force: true }); return; }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || "Something went wrong on this page.";

    // v398: a new version of Ybex is live — calm "updating" screen instead of an error.
    if (this.state.updating || isChunkLoadError(this.state.error)) {
      return (
        <div className="flex flex-col items-center justify-center text-center px-6 py-20 gap-4" data-testid="page-updating">
          <div className="w-10 h-10 rounded-full border-[3px] border-[var(--violet)]/25 border-t-[var(--violet)] animate-spin" aria-hidden="true" />
          <div className="space-y-1.5 max-w-md">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Getting the latest Ybex…</h2>
            <p className="text-sm text-[var(--text-secondary)]">We just shipped an update. This takes a second.</p>
          </div>
          <button type="button" onClick={this.handleReload} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--violet)] text-white hover:opacity-90 transition-opacity">
            Load it now
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center text-center px-6 py-20 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <span className="text-rose-500 text-xl" aria-hidden="true">!</span>
        </div>

        <div className="space-y-1.5 max-w-md">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            This page didn't load
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            The rest of the app is still working — you can use the menu to go somewhere else,
            or try loading this page again.
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={this.handleReload}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--violet)] text-white hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>

        {/* v386 (Ravi 30 Oct: Earnings / Inbox / Settings showed this page with no clue why): one short grey line with the
            error name + message, so a screenshot is enough to find the cause. No stack, no data. */}
        {!import.meta.env?.DEV && (
          <p className="text-[10px] text-[var(--text-tertiary)] max-w-sm break-words" data-testid="page-error-code">
            code: {String(this.state.error?.name || "Error").slice(0, 30)} · {String(message).replace(/\s+/g, " ").slice(0, 140)}
          </p>
        )}
        {import.meta.env?.DEV && (
          <pre className="mt-3 max-w-lg overflow-x-auto text-left text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-3">
            {message}
          </pre>
        )}
      </div>
    );
  }
}

export default PageErrorBoundary;
