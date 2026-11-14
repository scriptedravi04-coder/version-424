// v418 (Ravi: "Android pe sabse upar Get it on Google Play, neeche website pe continue karo"):
// On an Android phone's browser the sign-up / offer pages first offer the Play Store app, with "Continue on website"
// underneath. Never on iPhone, never inside the app, never in an installed web app.
// - Shown only once the Play Store listing is public: server setting PLAY_STORE_LIVE=true (GET /api/public/app-links).
// - The Play link carries the visitor's ad tags as the install referrer (utm_source / utm_medium / utm_campaign), so the
//   account made in the app is credited to the same ad (the app reads it back — src/index.jsx).
// - Tap → Meta Pixel "PlayStoreClick".
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { isNative } from "../../lib/native";
import { trackFunnel } from "../../lib/metaPixel";
import { getSignupSource } from "../../lib/signupSource";
import { safeStorage } from "../../utils/storage";

export const PLAY_PACKAGE = "com.ybex.app";
const HIDE_KEY = "yb_play_banner_hidden";

/** Pure: Android phone browser (not the app, not an installed web app). */
export function isAndroidBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : "", standalone = false) {
  return /Android/i.test(String(ua || "")) && !/iPhone|iPad|iPod/i.test(String(ua || "")) && !standalone;
}

/** Pure: Play Store link with the ad tags as the install referrer. */
export function playStoreUrl(src, page = "") {
  const q = new URLSearchParams();
  q.set("utm_source", (src && src.utm_source) || "website");
  q.set("utm_medium", (src && src.utm_medium) || "play_button");
  q.set("utm_campaign", (src && src.utm_campaign) || (page ? `web_${page}` : "web"));
  return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${encodeURIComponent(q.toString())}`;
}

export default function PlayStoreBanner({ page = "" }) {
  const [live, setLive] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return safeStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } });
  const standalone = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const show = !hidden && !isNative() && isAndroidBrowser(undefined, standalone);

  useEffect(() => {
    if (!show) return undefined;
    let alive = true;
    api.get("public/app-links", { bypassCache: true }).then(({ data }) => { if (alive) setLive(Boolean(data?.play_live)); }).catch(() => {});
    return () => { alive = false; };
  }, [show]);

  if (!show || !live) return null;
  const href = playStoreUrl(getSignupSource(), page);
  const onPlay = () => { try { trackFunnel("PlayStoreClick", { page: page || "web" }); } catch { /* still open */ } };
  const onWeb = () => { setHidden(true); try { safeStorage.setItem(HIDE_KEY, "1"); } catch { /* this visit only */ } };

  return (
    <div data-testid="play-store-banner" className="w-full px-4 pt-4 pb-3 bg-white border-b border-[#EEE] text-center">
      <a href={href} onClick={onPlay} rel="noopener" data-testid="play-store-button"
        className="inline-flex items-center justify-center gap-2.5 w-full max-w-sm h-12 rounded-xl bg-[#111] text-white font-semibold text-[15px] active:scale-[0.98] transition-transform">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4 2.5v19l10.2-9.5L4 2.5zm11.6 8.2L6.5 2.2l11.3 6.4-2.2 2.1zm0 2.6l2.2 2.1-11.3 6.4 9.1-8.5zm3.6-3.3L22 11.6c.7.4.7 1.4 0 1.8l-2.8 1.6-2.4-2.3 2.4-2.3z" /></svg>
        Get it on Google Play
      </a>
      <button type="button" onClick={onWeb} data-testid="play-store-continue-web"
        className="mt-2 text-[13px] font-medium text-[#6B7280] underline underline-offset-2">
        Continue on website
      </button>
    </div>
  );
}
