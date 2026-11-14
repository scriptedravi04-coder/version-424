// v362 (Ravi: "mujhe sab data chahiye — kisne dekha, register kiya ya nahi, kahan break point hai"):
// Meta Pixel + the same funnel events in Google Analytics, so ads can be measured step by step.
//
// Funnel (event names as they show in Meta Events Manager / GA4):
//   PageView              every page (Meta standard)
//   ViewSignupPage        sign-in / sign-up opened (/app, /app/continue/… — /signup and /login lead there since v370)
//   ViewApplyForm         /apply-creator opened
//   ViewChallenge         /challenge opened (v367: Diwali Creator Challenge — ads / bio link)
//   Lead                  apply form submitted (Meta standard)
//   CompleteRegistration  new account made — email, Google or Apple (Meta standard)
//   OnboardingStep        each onboarding screen, with { step, flow }
//   OnboardingComplete    onboarding submitted, with { flow }
//   QualifiedCreator10K   v418: same, for 10,000+ followers (a 10K creator fires BOTH events). value = 1.
//   PlayStoreClick        v418: "Get it on Google Play" tapped on the website (Android phones).
//   QualifiedCreator      v395: a NEW creator whose Instagram has 1,000+ followers (value = 1 per creator; follower count sent as followers_count — v412). Decided by the server,
//                         which also sends it through the Conversions API with the same event id (backend/metaCapi.ts).
//
// Only counts are sent — never a name, email, phone or Instagram handle.
// While META_PIXEL_ID is empty nothing is loaded from Meta (GA events still go out).
import { useEffect, useRef } from "react";
import { hasMetaSdk, logMetaAppEvent } from "./native"; // v418: inside the Android app events go to the Meta SDK

/** Ravi's Pixel ID from Meta Events Manager (a public number, not a secret). Fill it in, then deploy. */
export const META_PIXEL_ID = "965515649959745"; // v363: Ravi's Pixel (Events Manager, 21 Oct 2026)

let started = false;

function loadPixel() {
  if (started || !META_PIXEL_ID || typeof window === "undefined") return started;
  try {
    /* Meta's standard loader */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
    started = true;
  } catch (e) {
    console.warn("[metaPixel] not loaded:", e?.message || e);
  }
  return started;
}

const STANDARD = new Set(["PageView", "Lead", "CompleteRegistration", "ViewContent"]);

/** Send one funnel event to Meta (if the Pixel is set) and to Google Analytics. Never throws. */
export function trackFunnel(name, params = {}, eventId = "") {
  // v418: in the Android app the Meta SDK sends the event (as an app event), not the web Pixel — never both.
  if (hasMetaSdk()) {
    if (name !== "PageView") logMetaAppEvent(name, params, eventId);
  } else try {
    if (loadPixel() && window.fbq) {
      // v395: the same event id as the server's Conversions API copy → Meta counts the event once
      if (eventId) window.fbq(STANDARD.has(name) ? "track" : "trackCustom", name, params, { eventID: String(eventId) });
      else window.fbq(STANDARD.has(name) ? "track" : "trackCustom", name, params);
    }
  } catch (e) { console.warn("[metaPixel] event skipped:", e?.message || e); }
  try {
    if (name !== "PageView" && typeof window !== "undefined" && window.gtag) {
      window.gtag("event", name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase(), params);
    }
  } catch (e) { console.warn("[ga] event skipped:", e?.message || e); }
}

/** Called on every route change (from GoogleAnalytics.jsx). */
export function trackRoute(pathname) {
  const p = String(pathname || "");
  trackFunnel("PageView");
  // v370: /signup and /login now open the app sign-in (/app, /app/continue/creator|brand) on the website too
  // (only the app paths count, so /signup → /app is one view, not two)
  if (p === "/app" || /^\/app\/continue\/(creator|brand)$/.test(p)) trackFunnel("ViewSignupPage");
  if (p === "/apply-creator") trackFunnel("ViewApplyForm");
  if (p === "/challenge" || p === "/offer" || p === "/offers") trackFunnel("ViewChallenge"); // v367 (+ v368 /offer)
}

/** Onboarding screens: one OnboardingStep per screen per visit, OnboardingComplete on the done screen. */
export function useFunnelSteps(screen, doneScreen, flow) {
  const seen = useRef(new Set());
  useEffect(() => {
    if (typeof screen !== "number" || seen.current.has(screen)) return;
    seen.current.add(screen);
    if (screen === doneScreen) trackFunnel("OnboardingComplete", { flow });
    else trackFunnel("OnboardingStep", { step: screen, flow });
  }, [screen, doneScreen, flow]);
}

/** v395: the server's answer carried `meta_event` (first time a new creator reached 1,000+ followers) → fire the Pixel half.
 *  v418: also `meta_events` (a list) — a 10K+ creator brings QualifiedCreator AND QualifiedCreator10K. value is always 1;
 *  the follower count goes in followers_count. Never throws. */
export const SERVER_EVENTS = new Set(["QualifiedCreator", "QualifiedCreator10K"]);
export function trackServerEvent(ev) {
  try {
    if (!ev || !SERVER_EVENTS.has(ev.name) || !ev.event_id) return;
    const followers = Math.max(0, Math.round(Number(ev.followers) || 0));
    trackFunnel(ev.name, { value: 1, currency: "INR", followers_count: followers, content_name: "creator" }, ev.event_id);
  } catch (e) { console.warn("[metaPixel] server event skipped:", e?.message || e); }
}
export function trackServerEvents(list) {
  for (const ev of Array.isArray(list) ? list : []) trackServerEvent(ev);
}
