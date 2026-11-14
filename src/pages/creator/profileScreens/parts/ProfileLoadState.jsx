import React from "react";

// v372 (Ravi's video: Profile showed "Category not set", "Add your city", no Instagram while the profile was still
// loading / its load had failed — the empty defaults looked like the real profile). Layout only.

/** Red line + Retry when the profile couldn't be loaded. */
export function ProfileLoadFailed({ state, onRetry }) {
  if (state !== "failed") return null;
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3" data-testid="profile-load-failed">
      <span className="text-[12.5px] font-semibold text-rose-700">Couldn't load your profile. Check your internet.</span>
      {onRetry && <button type="button" onClick={onRetry} className="shrink-0 min-h-9 px-3 rounded-xl bg-white border border-rose-200 text-rose-600 text-[12px] font-bold">Retry</button>}
    </div>
  );
}

/** Two grey bars in place of "profession · category" and the city while the profile loads. */
export function ProfileLinesLoading() {
  return (
    <div className="mt-1.5 space-y-1.5" aria-label="Loading profile">
      <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
      <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}
