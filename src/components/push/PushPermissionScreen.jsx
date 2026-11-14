import React, { useEffect, useState } from "react";
import { waitForHomeReady, claimAppOpenPopup, waitForNoPopup } from "../../lib/popupRules";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { pushSupported, pushServerKey, askPushPermission, savePushSubscription } from "../../lib/push";
import { ignored } from "../../utils/ignored";
import { isStandalone } from "../../lib/standalone";
import { nativePushAvailable, nativePushState, askNativePush, refreshNativePush } from "../../lib/nativePush";
// v426: the automatic ask waits for Home and counts as this open's one popup (the Notifications-page button still opens it).
const mayAutoAsk = async () => { await waitForHomeReady(); return (await waitForNoPopup()) && claimAppOpenPopup("push"); };

// Session 41 (Ravi) — ask for notifications at the start, with our own screen first (sticker +
// emotional/funny line + one big button). Only the tap on "Yes, keep me posted" opens the phone's
// real popup — iPhone allows it only after a tap, and a phone never asks again after "Don't allow".
// "Not now" → asked again after 3 days. No on/off setting anywhere else (Ravi).
const NOT_NOW_KEY = "ybex_push_not_now_at";
const HIDE_ON = ["/login", "/signup", "/onboarding", "/verify", "/admin", "/reset-password"];
// Session 43 (v285, Ravi): ask on the very first open of the installed app, before login, so the
// phone gets pushes even if the person never signs up. Guests are asked only inside the installed
// app (Play Store app / Home Screen app), never on the website, and only on these pages.
const GUEST_SHOW_ON = ["/app", "/", "/login", "/signup"];
const GUEST_DELAY_MS = 2800; // let the launch splash finish first

// Session 43 (Ravi: "ye lines achi nahi hai") — plain, useful copy + what you will actually get.
export const COPY = {
  creator: {
    title: "Never miss a brand deal",
    text: "Get a ping the moment a brand invites you, sends an offer, or your payment arrives.",
    perks: [["🤝", "Brand invites & new offers"], ["💸", "Payment released to your bank"], ["💬", "Replies in your chats"]],
  },
  guest: {
    title: "Don't miss paid collabs",
    text: "Turn on notifications to hear about new brand campaigns, offers and updates from Ybex.",
    perks: [["📣", "New brand campaigns"], ["💸", "Paid collab offers"], ["🔔", "Your deals and chats, once you join"]],
  },
  brand: {
    title: "Know the moment creators respond",
    text: "Get a ping when creators apply, send their drafts, or reply to your offers.",
    perks: [["•", "New creator applications"], ["•", "Drafts ready for your review"], ["•", "Replies in your chats"]], // v415: no emoji for brands
  },
};

function Sticker({ calm = false }) {
  // v415: brands (professional users) get a calm bell instead of the pleading-face sticker
  if (calm) return (
    <div style={{ width: 120, height: 120, margin: "0 auto", borderRadius: 999, background: "#EDE7FE", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
    </div>
  );
  // Our own sticker (not copied): a lavender blob, a pleading face, folded hands and sparkles.
  return (
    <div style={{ position: "relative", width: 260, height: 180, margin: "0 auto" }} aria-hidden="true">
      <svg viewBox="0 0 260 180" width="260" height="180" style={{ position: "absolute", inset: 0 }}>
        <path d="M24 40 Q40 8 120 14 Q210 6 236 36 Q252 92 232 140 Q200 176 120 170 Q40 176 20 138 Q6 92 24 40Z" fill="#EDE7FE" />
        <circle cx="46" cy="52" r="20" fill="#DCD0FD" />
        <circle cx="222" cy="140" r="16" fill="#DCD0FD" />
        <path d="M70 26 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" fill="#C9B8FB" />
        <path d="M196 30 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z" fill="#C9B8FB" />
        <path d="M92 150 q8 -10 16 0 q8 -10 16 0 q-16 18 -16 18 q0 0 -16 -18z" fill="#D8CCFD" />
      </svg>
      <div style={{ position: "absolute", left: 22, top: 62, fontSize: 52, transform: "rotate(-10deg)" }}>🙏</div>
      <div style={{ position: "absolute", left: "50%", top: 30, transform: "translateX(-50%)", fontSize: 96, lineHeight: 1, filter: "drop-shadow(0 6px 10px rgba(91,33,182,.18))" }}>🥺</div>
      <div style={{ position: "absolute", right: 20, top: 62, fontSize: 52, transform: "rotate(10deg) scaleX(-1)" }}>🙏</div>
      <div style={{ position: "absolute", right: 58, top: 18, fontSize: 30 }}>🔔</div>
    </div>
  );
}

export default function PushPermissionScreen() {
  const { user, loading } = useAuth() || {};
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const role = user?.role === "brand" ? "brand" : user?.role === "creator" ? "creator" : null;
  // Not signed in, auth finished loading, inside the installed app → ask as a guest.
  const guest = !user && !loading && isStandalone();
  const who = role || (guest ? "guest" : null);
  const [blocked, setBlocked] = useState(false); // phone settings say "don't allow"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Session 43 (v271): no "onboarding finished" check any more — brands who picked "finish
      // later" never got asked (0 brand phones subscribed). Onboarding pages stay excluded below.
      // v336: iPhone App Store app → Apple push (same screen, Apple's popup on "Yes").
      if (who && nativePushAvailable()) {
        const st = await nativePushState();
        if (st === "granted") { refreshNativePush(); return; } // saves this phone under whoever is signed in now
        if (st !== "prompt") return;
        try {
          const at = Number(localStorage.getItem(NOT_NOW_KEY) || 0);
          if (at && Date.now() - at < 3 * 24 * 3600e3) return;
        } catch (e) { ignored("Push:notNow", e); }
        if (who === "guest") await new Promise((r) => setTimeout(r, GUEST_DELAY_MS));
        if (!cancelled && await mayAutoAsk()) setShow(true);
        return;
      }
      if (!who || !pushSupported()) return;
      // Already allowed on this phone → just make sure the server has this device.
      if (Notification.permission === "granted") {
        savePushSubscription().catch((e) => ignored("Push:resync", e));
        return;
      }
      if (Notification.permission !== "default") return; // blocked in phone settings
      try {
        const at = Number(localStorage.getItem(NOT_NOW_KEY) || 0);
        if (at && Date.now() - at < 3 * 24 * 3600e3) return;
      } catch (e) { ignored("Push:notNow", e); }
      const key = await pushServerKey();
      if (!key || cancelled) return;
      if (who === "guest") await new Promise((r) => setTimeout(r, GUEST_DELAY_MS));
      if (!cancelled && await mayAutoAsk()) setShow(true);
    })();
    return () => { cancelled = true; };
  }, [who]);

  // Session 43 (Ravi): the small "Allow notifications" button on the Notifications page opens this
  // same screen. If the phone already blocked us, the screen explains how to turn it on in Settings.
  useEffect(() => {
    const open = () => {
      if (!who) return;
      // v336: iPhone App Store app → Apple push.
      if (nativePushAvailable()) {
        nativePushState().then((st) => {
          if (st === "granted") { refreshNativePush(); return; }
          setBlocked(st === "denied" ? "denied" : false);
          setShow(true);
        });
        return;
      }
      if (typeof window !== "undefined" && window.Capacitor) return; // app build without the push plugin
      if (!pushSupported()) { setBlocked("install"); setShow(true); return; }
      let perm = "default";
      try { perm = typeof Notification !== "undefined" ? Notification.permission : "default"; } catch (e) { ignored("Push:perm", e); }
      if (perm === "granted") { savePushSubscription().catch((e) => ignored("Push:resync2", e)); return; }
      setBlocked(perm === "denied" ? "denied" : false);
      setShow(true);
    };
    window.addEventListener("ybex:open-push-ask", open);
    return () => window.removeEventListener("ybex:open-push-ask", open);
  }, [who]);

  const hiddenHere = who === "guest"
    ? !GUEST_SHOW_ON.includes(location.pathname)
    : location.pathname === "/" || HIDE_ON.some((p) => location.pathname.startsWith(p));
  const visible = show && !hiddenHere && !(role === "brand" && blocked); // v415: no full-screen takeover for brands who already turned notifications off
  // Session 43 (Ravi): "Missed Notifications" popped up on top of this screen. Tell the toasts to wait.
  useEffect(() => {
    try {
      window.__ybFullScreenAsk = visible;
      window.dispatchEvent(new CustomEvent("ybex:fullscreen-ask", { detail: visible }));
    } catch (e) { ignored("Push:announce", e); }
  }, [visible]);
  const copy = COPY[who] || COPY.creator;

  const allow = async () => {
    setBusy(true);
    try { if (nativePushAvailable()) await askNativePush(); else await askPushPermission(); } catch (e) { ignored("Push:ask", e); } // v336
    setBusy(false);
    setShow(false);
    try { window.dispatchEvent(new Event("ybex:push-permission-changed")); } catch (e) { ignored("Push:changed", e); }
  };
  const notNow = () => {
    try { localStorage.setItem(NOT_NOW_KEY, String(Date.now())); } catch (e) { ignored("Push:notNowSave", e); }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="push-ask"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[180] bg-white flex flex-col md:bg-black/50 md:backdrop-blur-sm md:items-center md:justify-center md:p-6"
          style={{ fontFamily: "'DM Sans', sans-serif", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          role="dialog" aria-modal="true" data-testid="push-permission"
        >
          <div className="flex-1 flex flex-col md:flex-none md:w-full md:max-w-[440px] md:rounded-3xl md:bg-white md:shadow-2xl md:pt-10 md:pb-2" data-testid="push-card">
          <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
            <Sticker calm={role === "brand"} />
            <h2 className="mt-7 text-[25px] leading-[1.2] font-bold tracking-tight text-[#0A0A0A]">{copy.title}</h2>
            <p className="mt-2.5 text-[15px] leading-[1.55] text-[#4B5563] max-w-sm">{copy.text}</p>
            {blocked ? (
              <div className="mt-6 w-full max-w-sm rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] p-4 text-left text-[13.5px] leading-[1.5] text-[#78350F]" data-testid="push-blocked-help">
                {blocked === "install" ? (
                  <>On iPhone, notifications work only in the installed app. In Safari tap <b>Share → Add to Home Screen</b>, open Ybex from your home screen, then turn them on.</>
                ) : (
                  <>Notifications are turned off for Ybex on this phone. Open <b>Settings → Ybex → Notifications</b> (Android: <b>Settings → Apps → Ybex → Notifications</b>) and switch them on.</>
                )}
              </div>
            ) : (
              <ul className="mt-6 w-full max-w-sm flex flex-col gap-2.5 text-left">
                {copy.perks.map(([icon, label]) => (
                  <li key={label} className="flex items-center gap-3 rounded-2xl bg-[#F7F5FF] px-4 py-3">
                    <span className="text-[20px] leading-none" aria-hidden="true">{icon}</span>
                    <span className="text-[14px] font-semibold text-[#1F1F29]">{label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="px-6 pb-6 pt-2 w-full max-w-md mx-auto">
            {blocked ? (
              <button type="button" onClick={() => setShow(false)} data-testid="push-blocked-ok"
                className="w-full h-[54px] rounded-[16px] bg-[#7C3AED] text-white text-[16px] font-bold active:scale-[0.99] transition-transform">
                Got it
              </button>
            ) : (
              <>
                <button type="button" onClick={allow} disabled={busy} data-testid="push-allow"
                  className="w-full h-[54px] rounded-[16px] bg-[#7C3AED] text-white text-[16px] font-bold active:scale-[0.99] transition-transform disabled:opacity-70">
                  {busy ? "One sec…" : "Turn on notifications"}
                </button>
                <button type="button" onClick={notNow} data-testid="push-not-now"
                  className="mt-2 w-full h-11 text-[14px] font-semibold text-[#8E8E93]">
                  Not now
                </button>
              </>
            )}
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
