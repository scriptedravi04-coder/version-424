import React, { useState } from "react";
import { isIosHomeScreenApp, newHandoffId, waitForHandoff } from "../../lib/oauthHandoff"; // v378
import { api } from "../../lib/api";
import { openOAuth, oauthAppParams } from "../../lib/native";

// v334 (App Store 4.8): "Continue with Apple" wherever "Continue with Google" is offered on an iPhone / iPad.
// Same same-window flow as the installed app (src/pages/app/AppContinue.jsx → backend/oauth_routes.ts):
// GET auth/oauth/url?provider=apple → Apple → /api/auth/oauth/apple/callback → /app/oauth#token=….
// Styled per Apple's guidelines: black button, white Apple logo, "Continue with Apple", same size as Google.
// When the server has no APPLE_CLIENT_ID it answers 503 — the button then shows a calm line, nothing breaks.

/** iPhone / iPad (iPadOS reports a Mac with touch). Same rule as the app login (Ravi, v286). */
export function isAppleMobileDevice(nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav) return false;
  const ua = String(nav.userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1);
}

export function AppleLogo({ size = 18, color = "#fff" }) {
  return (
    <svg width={size} height={Math.round(size * 1.12)} viewBox="0 0 814 1000" aria-hidden="true" fill={color}>
      <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-58-156-128C44 790 0 669 0 554c0-185 120-283 239-283 63 0 115 41 155 41 38 0 97-44 169-44 27 0 125 2 190 73zM554 168c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 43 0 97-29 128-69z" />
    </svg>
  );
}

/**
 * role: "creator" | "brand" (saved on a new account), next: in-app path to open after sign-in.
 * className: size / radius so it matches the Google button next to it. Always black with white text.
 */
export default function AppleSignInButton({ role = "creator", next = "", className = "", disabled = false, testId = "oauth-apple" }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const start = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setNote("");
    try {
      // AppOAuthDone reads these back (same keys the web Google flow uses).
      try {
        window.sessionStorage.setItem("ybex_oauth_role", role === "brand" ? "brand" : "creator");
        if (next && next.startsWith("/") && !next.startsWith("//")) window.sessionStorage.setItem("ybex_oauth_next", next);
      } catch { /* private mode */ }
      const handoff = isIosHomeScreenApp() ? newHandoffId() : ""; // v378: iPhone Home Screen app — lib/oauthHandoff.js
      const { data } = await api.get("auth/oauth/url", { params: { provider: "apple", role, ...(handoff ? { handoff } : {}), ...oauthAppParams() }, bypassCache: true });
      if (handoff) waitForHandoff(handoff, (d) => window.location.assign(`/app/oauth#${new URLSearchParams({ token: d.token, role: d.role || role || "" }).toString()}`));
      if (data?.url && handoff) { const w = window.open(data.url, "_blank"); if (!w) window.location.href = data.url; return; } // v378: keep the app page alive under the sheet
      if (data?.url) { await openOAuth(data.url); return; } // v335: phone browser sheet inside the iPhone app
      setNote("Apple sign-in isn't available right now. Please use your email or Google.");
    } catch (e) {
      const status = e?.response?.status;
      setNote(status === 503
        ? "Apple sign-in is not set up yet. Please use your email or Google for now."
        : (e?.response?.data?.error || "Couldn't open Apple sign-in. Please try again or use your email."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy || disabled}
        data-testid={testId}
        aria-label="Continue with Apple"
        className={`w-full bg-black text-white flex items-center justify-center gap-2.5 font-semibold active:scale-[0.99] transition-transform disabled:opacity-60 cursor-pointer ${className}`}
      >
        {busy ? (
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        ) : (
          <AppleLogo />
        )}
        Continue with Apple
      </button>
      {note ? <p className="mt-2 text-center text-[12px] leading-snug text-[#6B7280]" role="status" data-testid="oauth-apple-note">{note}</p> : null}
    </div>
  );
}
