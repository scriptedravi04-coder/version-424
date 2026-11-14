import { installNative, isNative, readInstallReferrer } from "@/lib/native";
import { installNativePush } from "@/lib/nativePush";
import ErrorBoundary from "@/components/ErrorBoundary";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { installKeyboardAware } from "@/lib/keyboardAware";
import { installExternalLinks } from "@/lib/externalLinks";
import { installQuietPermissionToasts } from "@/lib/api"; // v408
import { registerSW } from "virtual:pwa-register";
import { captureSignupSource, saveInstallReferrer } from "@/lib/signupSource";
import { toast } from "sonner";
import { installOfflineToasts } from "@/lib/offline";
import { isChunkLoadError, recoverFromStaleBuild, startVersionWatch } from "@/lib/staleBuild";
import { APP_VERSION } from "@/lib/appVersion"; // v431

// Session 58: remember the first link a visitor came in on (Admin → Growth → where signups come from).
captureSignupSource();
// v335: iPhone app (Capacitor) — server address, sign-in return links, back button. No-op on the website.
installNative();
// v418: Android app — Google Play install referrer (utm_source / utm_campaign of the ad that brought the install) is kept
// like a website visit's tags, so the account made in the app is credited to the ad.
if (isNative()) readInstallReferrer().then((r) => { if (r) saveInstallReferrer(r); }).catch(() => {});
installNativePush(); // v336: Apple push in the iPhone app

// Session 41 — installable app (PWA). The service worker makes Chrome offer "Install app";
// public/manifest.json gives the name and icons.
// v335: no service worker inside the iPhone app — its files are already inside the app.
if (typeof window !== "undefined" && "serviceWorker" in navigator && !isNative()) {
  // v391 (speed QA): the service worker downloads ~2.4 MB of app files in the background. Start it 3 s after the page has loaded so it never competes with the landing / login / offer page for bandwidth.
  // v408: "has the person started using this page?" — any tap / key / typing; a quiet update is only safe before that.
  ["pointerdown", "keydown", "input"].forEach((ev) => window.addEventListener(ev, () => { window.__ybTouched = true; }, { capture: true, once: true, passive: true }));
  const startSW = () => {
  try {
    // Session 58: a new version is applied only when the person taps "Refresh" on the update toast (or next time the
    // app is opened fresh) — never in the middle of something (not even when the app goes to the background: the
    // UPI app switch during a payment does that). Also checks for updates when the app comes back to the foreground.
    let applyUpdate = null;
    const updateSW = registerSW({
      immediate: true,
      // v377 (Ravi: first-time visitors saw the "new version is ready — Refresh" toast): updates are silent now. No
      // toast; the new version waits (no reload mid-signup / mid-payment) and takes over the next time Ybex is opened.
      onNeedRefresh() {
        applyUpdate = () => updateSW(true);
        // v408 (live check 5 Nov: a browser that had opened Ybex before kept showing the OLD sign-up screen after the
        // deploy — the new version waited forever on /app/continue, a "busy" page): if the person hasn't tapped or typed
        // anything on this page yet, the new version loads right now. Nothing can be lost; once they interact it waits.
        if (!window.__ybTouched) applyUpdate();
      },
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        // v378 (Ravi: "website pe baar baar 'new version available — Refresh' aata hai"): a phone that keeps Ybex in the
        // background never "closes" it, so the new version waited forever (older builds kept showing the Refresh toast).
        // Now: back to Ybex after 2+ minutes away, on a calm page (not paying, typing a code or a form) → the new
        // version loads quietly. No popup.
        let hiddenAt = 0;
        const BUSY = /\/(checkout|pay|payment|otp|verify|signup|onboarding|kyc|app\/continue|app\/details|chat|inbox|campaigns\/create|ugc\/create)/i;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
          if (applyUpdate && hiddenAt && Date.now() - hiddenAt > 2 * 60 * 1000 && !BUSY.test(window.location.pathname)) { applyUpdate(); return; }
          reg.update().catch(() => {});
        });
      },
    });
  } catch (e) { console.warn("Service worker not registered:", e); }
  };
  if (document.readyState === "complete") setTimeout(startSW, 3000);
  else window.addEventListener("load", () => setTimeout(startSW, 3000), { once: true });
}
// Chrome can fire "beforeinstallprompt" before React has mounted the install banner.
// Keep the event so the banner (usePWAInstall) can still use it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__ybexInstallPrompt = e;
    window.dispatchEvent(new Event("ybex-install-ready"));
  });
}

// v431: an old cached page moves itself to the newest version (website only — the app updates through its live update)
if (typeof window !== "undefined" && !isNative()) startVersionWatch(APP_VERSION);

if (typeof window !== "undefined") {
  // v398: one shared recovery (lib/staleBuild) — also moves past the old saved page of the service worker.
  const handleChunkError = (errMessage) => isChunkLoadError(errMessage) && recoverFromStaleBuild();

  window.addEventListener("vite:preloadError", (event) => {
    // v390: only swallow the error when the page is really reloading. Swallowing it without a reload (the 10 s
    // guard) made the lazy page resolve to nothing → "undefined is not an object (D._result.default)" on logout.
    if (handleChunkError("failed to fetch dynamically imported module")) event.preventDefault();
  });

  window.onerror = function (msg, url, lineNo, columnNo, error) {
    if (handleChunkError(msg || error?.message)) {
      return true;
    }
    if (
      msg === "Script error." ||
      (typeof msg === "string" && (msg.includes("ResizeObserver") || msg.includes("Script error")))
    ) {
      console.warn("Suppressed cross-origin / harmless script event:", msg);
      return true;
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    if (handleChunkError(event.message || event.error?.message)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (
      event.message === "Script error." ||
      event.message?.includes("ResizeObserver loop") ||
      event.message?.includes("Script error")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      console.warn("Handled cross-origin script / layout event:", event.message);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (handleChunkError(event.reason?.message || String(event.reason || ""))) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (
      event.reason?.message?.includes?.("ResizeObserver") ||
      event.reason?.message?.includes?.("Script error")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

installOfflineToasts(toast); // v334: offline actions / load failures → one calm "You're offline" toast
installKeyboardAware(); // Session 39 (M9): fields never hide under the phone keyboard
installExternalLinks(); // Session 55: in the installed app, Terms/Privacy links open in Chrome, not inside the app
try { installQuietPermissionToasts(); } catch { /* never block start */ } // v408
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary><App /></ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Session 42: a logged-in phone starts downloading its home screen right away, while the login check
// (/auth/me) is still on its way — the two no longer wait for each other.
try {
  if (window.localStorage.getItem("ybex_token") && window.innerWidth < 768) {
    const role = JSON.parse(window.localStorage.getItem("ybex_user") || "{}")?.role;
    const load = role === "creator" ? import("./pages/creator/CreatorHomeMobile") : import("./pages/brand/BrandHomeMobile");
    load.catch(() => {});
  }
} catch { /* storage blocked: the page loads normally */ }
