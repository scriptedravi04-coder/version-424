import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

// Session 43 — launch animation (Claude Design "Ybex App Icon & Splash", 4b → dashboard).
// v282: now the "Ybex App Flow" splash (camera → flash → "Ybex." + shine). It is plain HTML/CSS in index.html
// (#yb-splash), so they play while the app files download. This component only says when the
// app is ready: once the login check is done it looks for the home hero banner
// ([data-splash-target]) and asks the splash to shrink into it. No banner (welcome page, deep
// link from a push) → the splash just fades. In a normal browser tab #yb-splash never shows and
// window.__ybSplash is not set, so this does nothing.
const LOOK_MS = 900;

export default function AppLaunchSplash() {
  const { loading } = useAuth();

  useEffect(() => {
    if (loading || typeof window === "undefined" || !window.__ybSplash) return undefined;
    // Keep looking until the intro has finished (the home page file can still be on its way).
    const until = Math.max(Date.now() + LOOK_MS, (window.__ybSplash.readyAt || 0) + 300);
    let timer;
    const look = () => {
      const target = document.querySelector("[data-splash-target]");
      // v282: the logged-out login screen marks itself [data-splash-up]: the splash slides up and
      // the screen drops in (Claude Design "Ybex App Flow", logged-out path).
      const up = !target && document.querySelector("[data-splash-up]");
      if (target || up || Date.now() > until) {
        window.__ybSplash.exit(target || null, up ? "up" : undefined);
        return;
      }
      timer = setTimeout(look, 60);
    };
    timer = setTimeout(look, 60);
    return () => clearTimeout(timer);
  }, [loading]);

  return null;
}
