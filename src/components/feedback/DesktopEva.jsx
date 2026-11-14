import React, { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import { isPublicPage } from "../../lib/inAppPage";
import { lazyRetry } from "../../lib/staleBuild"; // v398: old page after a deploy → new version, no error screen

// Session 58 (Eva handoff §8d): Ybex Eva on DESKTOP. Below 768px the phone screens keep their own Eva
// (CreatorHomeMobile / BrandHomeMobile). From 768px Eva peeks at the bottom-right of every brand / creator
// page and opens as a docked glass panel (≥1100px) or a full-height drawer (768–1099px). Same Eva, same
// flows and rules. Loaded only when needed.
const FeedbackBot = lazyRetry(() => import("./FeedbackBot"));

const HIDE_ON = [/^\/chat/, /\/inbox/, /^\/onboarding/, /^\/login/, /^\/signup/, /^\/verify-email/, /kyc$/, /^\/brand\/campaigns\/create/, /^\/brand\/ugc\/post/, /^\/admin/];

export function desktopEvaVisible(pathname, user) {
  if (!user || (user.role !== "brand" && user.role !== "creator")) return false;
  // v402 (Ravi: "desktop pe Eva nahi dikh raha"): creators skip onboarding since v376, so "onboarded" kept Eva hidden for
  // every new creator. /onboarding itself is still in HIDE_ON.
  if (isPublicPage(pathname)) return false; // v348: never on the landing / login / legal / share pages
  return !HIDE_ON.some((rx) => rx.test(String(pathname || "")));
}

// v415 (brand QA: on desktop Eva sat half off-screen at the bottom-right, tilted, and covered cards/CTAs). On a
// computer Eva is a normal round button fully on screen, 20px from the corner on every page; she fades/scales in
// instead of sliding in from the edge, the "How can I help?" bubble sits to her left, and the page gets room at the
// bottom so the last cards / buttons can scroll clear of her. Phones keep their own peek (this file is desktop only).
// The rules below only exist while DesktopEva is on screen (≥768px).
export const DESKTOP_EVA_CSS = `@media (min-width:768px){
[data-testid="feedback-bot"]{right:20px!important;bottom:20px!important;transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .25s ease!important}
[data-testid="feedback-bot"][style*="translateX(30px)"]{transform:none!important}
[data-testid="feedback-bot"][style*="translateX(110px)"]{transform:scale(.6)!important;opacity:0!important;pointer-events:none!important}
[data-eva-root]:has(> [data-testid="feedback-bubble"]){right:100px!important;bottom:52px!important}
#app-scroll-container > main:not(:has([data-testid="home-city-footer"])){padding-bottom:112px!important}
}`;

export default function DesktopEva() {
  const isMobile = useIsMobile(768);
  const { user } = useAuth() || {};
  const { pathname } = useLocation();
  if (isMobile || !desktopEvaVisible(pathname, user)) return null;
  return (
    <>
      <style data-testid="desktop-eva-css">{DESKTOP_EVA_CSS}</style>{/* v415 */}
      <Suspense fallback={null}>
        <FeedbackBot role={user.role} screen={`desktop ${pathname}`} desktop />
      </Suspense>
    </>
  );
}
