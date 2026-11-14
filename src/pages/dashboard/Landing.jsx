import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { lazyRetry } from "../../lib/staleBuild";

// v333 (Ravi: "now start working on this" — Claude Design "YBEX_Landing_Page_Design.zip"): the new landing page.
// Mobile design below 768px, desktop design from 768px (CLAUDE_CODE_GUIDE.md). Each view is its own chunk, so a
// phone never downloads the desktop page. The page has its own nav and footer (no app Layout around it).
// v390: a stale chunk (after a deploy) used to resolve to nothing and crash the page on logout; now it reloads once.
const lazyView = (load) => lazyRetry(load); // v398: shared recovery (lib/staleBuild)
const LandingMobileView = lazyView(() => import("../../components/landing/v2/LandingMobileView"));
const LandingDesktopView = lazyView(() => import("../../components/landing/v2/LandingDesktopView"));

const isPhoneWidth = () => typeof window !== "undefined" && window.innerWidth < 700; // v391 (mobile QA): iPad mini (744) and wider use the roomy layout; narrower phones + foldables the phone layout

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(isPhoneWidth);

  useEffect(() => {
    if (user) {
      if (user.role === "admin" || user.team_role === "sub_admin") navigate("/admin", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const onResize = () => setPhone(isPhoneWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Ybex | Find Influencers & Get Brand Deals — 0% Fee"; // v375: same as index.html <title>
    return () => { document.title = prev; };
  }, []);

  // The design uses plain links (/signup, /login, /help…). Open them inside the app instead of reloading it.
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("/") && !href.startsWith("//")) { e.preventDefault(); navigate(href); }
  };

  const fallback = <div style={{ minHeight: "100dvh", background: phone ? "#F6F4FC" : "#E9E7EF" }} />;
  return (
    <div onClick={onClick} data-testid="landing-v2" style={{ height: "100dvh", overflow: "hidden" }} /* each view scrolls inside itself (sticky nav) */>
      <React.Suspense fallback={fallback}>
        {phone ? <LandingMobileView frame="full" showHand evaSpeedMs={650} /> : <LandingDesktopView showHand evaSpeedMs={650} />}
      </React.Suspense>
    </div>
  );
}
