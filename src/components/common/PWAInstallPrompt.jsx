import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { ignored } from '../../utils/ignored';
import { Download, X, Smartphone } from 'lucide-react';
import InstallGuideSheet from '../install/InstallGuideSheet';
import { detectPlatform } from '../../lib/installGuide'; // v378
import { isNative } from '../../lib/native'; // v378

export default function PWAInstallPrompt({ className = "" }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  // Closed banner stays away for 7 days (it used to come back every new tab).
  const [dismissed, setDismissed] = useState(() => {
    try {
      const at = Number(localStorage.getItem('pwa_prompt_dismissed_at') || 0);
      return at > 0 && Date.now() - at < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  // v388 (QA): never inside the store apps (Android / iPhone native), and never on the Admin panel.
  const onAdmin = typeof window !== "undefined" && /^\/admin/i.test(window.location.pathname || "");
  if (isInstalled || dismissed || onAdmin || (typeof window !== "undefined" && isNative())) {
    return null;
  }

  // Only show if browser emitted install prompt or if on iOS Safari
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('pwa_prompt_dismissed_at', String(Date.now()));
    } catch (e) { ignored("PWAInstallPrompt:dismiss", e); }
  };

  const handleAction = () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      install().then((r) => { if (r === 'failed') setShowIOSModal(true); });
    }
  };

  return (
    <>
      <div className={`w-full bg-gradient-to-r from-violet-900 via-[#7C3AED] to-[#6D28D9] text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm z-40 ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Smartphone size={16} className="text-white" />
          </div>
          <div className="truncate">
            <div className="font-bold tracking-tight">Install Ybex Mobile App</div>
            <div className="text-[11px] text-white/80 truncate">Opens full-screen, straight from your home screen</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAction}
            className="px-3.5 py-1.5 rounded-lg bg-white text-[#7C3AED] font-bold text-xs hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={13} className="stroke-[2.5]" />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner" /* v332: 40px tap target */
            className="w-10 h-10 -mr-2 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Session 42: browser-aware steps (iPhone Chrome too) — src/lib/installGuide.js */}
      <InstallGuideSheet open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// v378 (Ravi: "website pe aate hi 1-2 second baad ek popup — seedha Install / Add to Home Screen, lambi instructions
// nahi; landing pe scroll karte waqt wapas 'Download now' ki patti"). Until Ybex is on the Play Store / App Store:
//  • Android Chrome / Samsung / Edge: the popup's "Install" button opens the phone's own one-tap install box.
//  • iPhone: no website can add itself to the Home Screen (Apple allows only Share → Add to Home Screen), so the popup
//    shows ONE picture-line with the real Share icon and an arrow pointing at it — not a numbered list.
//  • Instagram / Facebook in-app browser: one line "open in browser".
//  • Never inside the installed app or the Play/App Store app, never on desktop, never on admin / sign-in screens;
//    closed → not shown again for 3 days; installed → never again.
// When the store apps are live, point INSTALL_STORE_URL at the store link and the same popup / bar open the store.
export const INSTALL_STORE_URL = { android: "", ios: "" }; // fill when the apps are on Play Store / App Store
const POPUP_KEY = "ybex_install_popup_closed_at";
// v388 (QA: the sheet covered the bottom of every legal / help page on the first visit): not on info / legal / help pages; shown after 30 s on the
// first page of a visit, or after 2 s once the visitor opened a 2nd page.
// v408 (Ravi 5 Nov, QA: on the ad pages the sheet covered "register" and sent Instagram visitors off to Chrome — they never
// came back): only for SIGNED-IN people, on the app's own pages, never on the landing / offer / challenge pages and never
// inside the Instagram / Facebook in-app browser. The lead is already saved by the time it shows.
const POPUP_PAGES = /^\/(dashboard|explore|campaigns|collabs|earnings|creator\/|brand\/dashboard|ugc-orders)/;
export const NEVER_POPUP_PAGES = /^\/($|offer|challenge|app(\/|$)|login|signup|blog)/;
const signedIn = () => { try { return Boolean(localStorage.getItem("ybex_token")); } catch { return false; } };
export function installPopupAllowed(path, { inApp = false, hasSession = false } = {}) {
  return hasSession && !inApp && !NEVER_POPUP_PAGES.test(String(path || "")) && POPUP_PAGES.test(String(path || ""));
}
const popupClosedRecently = () => { try { const t = Number(localStorage.getItem(POPUP_KEY) || 0); return t > 0 && Date.now() - t < 3 * 24 * 3600 * 1000; } catch { return false; } };
const isPhone = () => typeof window !== "undefined" && (window.innerWidth || 1024) < 768;

// v378 (Ravi: "install button mein glossy finish, shine thodi thodi der mein ghoomta rahe"): a light sweep every 3 s.
const SHINE_CSS = "@keyframes ybShine{0%,70%{transform:translateX(-120%) skewX(-20deg)}100%{transform:translateX(320%) skewX(-20deg)}}"
  + ".yb-shine{position:relative;overflow:hidden;background-image:linear-gradient(180deg,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 52%),linear-gradient(90deg,#8B5CF6,#7C3AED)!important}"
  + ".yb-shine::after{content:'';position:absolute;top:0;bottom:0;left:0;width:38%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));animation:ybShine 3s ease-in-out infinite;pointer-events:none}"
  + "@media (prefers-reduced-motion: reduce){.yb-shine::after{animation:none;display:none}}";

function ShareIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-3px" }}>
      <path d="M12 3v12" /><path d="M7.5 7.5L12 3l4.5 4.5" /><path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
    </svg>
  );
}

function useInstallOffer() {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const plat = React.useMemo(() => (typeof navigator !== "undefined" ? detectPlatform() : { desktop: true }), []);
  const storeUrl = plat.android ? INSTALL_STORE_URL.android : plat.ios ? INSTALL_STORE_URL.ios : "";
  const can = !isInstalled && !(typeof window !== "undefined" && isNative()) && !plat.desktop;
  return { plat, can, isInstallable, install, storeUrl };
}

export function InstallPopup() {
  const { plat, can, isInstallable, install, storeUrl } = useInstallOffer();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  // v426: follow the page with the router instead of checking the address every second.
  const path = useLocation().pathname;
  React.useEffect(() => {
    if (!can || !isPhone() || popupClosedRecently() || !installPopupAllowed(path, { inApp: plat.browser === "inapp", hasSession: signedIn() })) return undefined;
    let views = 1;
    try { views = Number(sessionStorage.getItem("yb_inst_views") || 0) + 1; sessionStorage.setItem("yb_inst_views", String(views)); } catch { /* private mode */ }
    // v415: never on top of another popup (Terms, quick actions, promo, Eva…) — wait and try again (up to ~1 min).
    let t;
    let tries = 0;
    const tryOpen = () => {
      if (window.__ybFullScreenAsk || window.__ybPromoShown || document.querySelector('[aria-modal="true"],[data-popup-open="true"]')) {
        tries += 1;
        if (tries < 20) t = setTimeout(tryOpen, 3000);
        return;
      }
      setOpen(true);
    };
    t = setTimeout(tryOpen, views >= 2 ? 2000 : 30000);
    return () => clearTimeout(t);
  }, [can, path]);
  const [leaving, setLeaving] = useState(false); // v415: fade out instead of vanishing
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); }; // v415
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !can) return null;
  const close = () => {
    try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* private mode */ }
    setLeaving(true);
    setTimeout(() => { setOpen(false); setLeaving(false); }, 200);
  };
  const android = plat.android && plat.browser !== "inapp";
  const iosSafariLike = plat.ios && plat.browser !== "inapp";
  const doInstall = () => {
    if (storeUrl) { window.location.href = storeUrl; return; }
    install().then((r) => { if (r === "accepted") close(); else if (r === "failed") setGuide(true); });
  };
  return (
    <>
      <div role="dialog" aria-modal="true" aria-label="Get the Ybex app" data-testid="install-popup"
        onClick={close}
        style={{ position: "fixed", inset: 0, zIndex: 2990, background: "rgba(10,8,20,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "ybInstFade .25s ease", opacity: leaving ? 0 : 1, transition: "opacity .2s ease" /* v415 */ }}>
        <style>{SHINE_CSS}</style>
        <style>{"@keyframes ybInstFade{from{opacity:0}to{opacity:1}}@keyframes ybInstUp{from{transform:translateY(40px)}to{transform:none}}@keyframes ybInstBob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}"}</style>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: "26px 26px 0 0", padding: "22px 20px calc(18px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", animation: "ybInstUp .32s cubic-bezier(.2,.8,.2,1)", position: "relative", transform: leaving ? "translateY(100%)" : "none", transition: "transform .2s cubic-bezier(.4,0,1,1)" /* v426: slides down when closed */ }}>
          <button type="button" onClick={close} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 40, height: 40, border: "none", background: "transparent", color: "#8A8799", fontSize: 22, cursor: "pointer" }}>×</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/pwa-192x192.png" alt="" width="56" height="56" style={{ borderRadius: 14, boxShadow: "0 6px 16px rgba(124,58,237,.25)" }} />
            <div>
              <div style={{ font: "800 18px/1.2 'DM Sans',sans-serif", color: "#0A0A0A" }}>Get the Ybex app</div>
              <div style={{ font: "500 13px/1.4 'DM Sans',sans-serif", color: "#6B7280", marginTop: 2 }}>Faster, full-screen · deal alerts · Free</div>
            </div>
          </div>

          {(android || storeUrl) && (
            <button type="button" onClick={doInstall} data-testid="install-popup-install" className="yb-shine"
              style={{ marginTop: 18, width: "100%", height: 52, borderRadius: 16, border: "none", background: "#7C3AED", color: "#fff", font: "800 16px 'DM Sans',sans-serif", boxShadow: "0 10px 22px -10px rgba(124,58,237,.9)", cursor: "pointer" }}>
              {storeUrl ? "Download the app" : isInstallable ? "Install Ybex" : "Install Ybex"}
            </button>
          )}

          {iosSafariLike && !storeUrl && (
            <div data-testid="install-popup-ios" style={{ marginTop: 16, padding: "14px 14px", borderRadius: 16, background: "#F5F0FF", font: "600 14.5px/1.5 'DM Sans',sans-serif", color: "#1F1B2E", textAlign: "center" }}>
              Tap <ShareIcon /> then <b>“Add to Home Screen”</b>
              <div style={{ marginTop: 6, font: "500 12px 'DM Sans',sans-serif", color: "#6B7280" }}>{plat.browser === "chrome" ? "Share is at the top right of Chrome" : "Share is in Safari's bar below"}</div>
            </div>
          )}

          {plat.browser === "inapp" && (
            <div style={{ marginTop: 16, padding: "14px", borderRadius: 16, background: "#F5F0FF", font: "600 14px/1.5 'DM Sans',sans-serif", color: "#1F1B2E", textAlign: "center" }}>
              Tap <b>{plat.ios ? "•••" : "⋮"}</b> at the top → <b>Open in {plat.ios ? "Safari" : "Chrome"}</b> to install Ybex
            </div>
          )}

          <button type="button" onClick={close} style={{ marginTop: 10, width: "100%", height: 40, border: "none", background: "transparent", color: "#8A8799", font: "600 13.5px 'DM Sans',sans-serif", cursor: "pointer" }}>Not now</button>
        </div>
        {/* iPhone Safari: an arrow bouncing toward the Share button in the bottom bar */}
        {iosSafariLike && plat.browser === "safari" && !storeUrl && (
          <div aria-hidden="true" style={{ position: "fixed", left: "50%", bottom: 6, marginLeft: -14, zIndex: 2991, animation: "ybInstBob 1s ease-in-out infinite", pointerEvents: "none" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15" /><path d="M6 13l6 6 6-6" /></svg>
          </div>
        )}
      </div>
      <InstallGuideSheet open={guide} onClose={() => { setGuide(false); close(); }} />
    </>
  );
}

/** v378: landing page — floating "Download the app" pill once the visitor has scrolled a bit (phones only). */
export function LandingInstallBar() {
  const { plat, can, install, storeUrl } = useInstallOffer();
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [guide, setGuide] = useState(false);
  React.useEffect(() => {
    // the phone landing scrolls inside its own box (div.m-x), not the window — listen to every scroll
    const on = (e) => {
      const t = e && e.target;
      const y = !t || t === document || t === document.documentElement ? window.scrollY : (t.scrollTop || 0);
      setShow(y > 500);
    };
    window.addEventListener("scroll", on, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", on, { capture: true });
  }, []);
  if (!can || hidden || !show || !isPhone()) return null;
  const tap = () => {
    if (storeUrl) { window.location.href = storeUrl; return; }
    if (plat.android && plat.browser !== "inapp") install().then((r) => { if (r === "failed") setGuide(true); });
    else setGuide(true);
  };
  return (
    <>
      <div data-testid="landing-install-bar" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 60, display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 12px", borderRadius: 18, background: "#1F1B2E", color: "#fff", boxShadow: "0 14px 30px -12px rgba(15,11,31,.55)", fontFamily: "'DM Sans', sans-serif" }}>
        <img src="/pwa-192x192.png" alt="" width="36" height="36" style={{ borderRadius: 10 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 14px/1.2 'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Download the Ybex app</div>
          <div style={{ font: "500 11.5px/1.3 'DM Sans',sans-serif", color: "rgba(255,255,255,.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Free · brand deals on your phone</div>
        </div>
        <style>{SHINE_CSS}</style>
        <button type="button" onClick={tap} className="yb-shine" style={{ flexShrink: 0, height: 38, padding: "0 16px", borderRadius: 12, border: "none", background: "#7C3AED", color: "#fff", font: "800 13.5px 'DM Sans',sans-serif", cursor: "pointer" }}>{plat.android ? "Install" : "Get app"}</button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Close" style={{ width: 32, height: 38, border: "none", background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 20, cursor: "pointer" }}>×</button>
      </div>
      <InstallGuideSheet open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
