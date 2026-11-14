// Session 43 (v287, Ravi: "simple haptic nahi, kuch unique"): Ybex's own touch signature.
//
// "open" = the "Ybex heartbeat": a light tap, a tiny pause, a firmer tap — like the bot saying
//          "hm-HM?" when you poke it. Used when Ybex Assist opens.
// "send" = one crisp tick when a message leaves.
//
// • Native app (Capacitor Haptics plugin present — the iOS / Android store apps): real Taptic Engine
//   impacts (iOS UIImpactFeedbackGenerator under the hood) — Light, then Medium 70 ms later.
// • Android web / Play Store app: the vibration motor with the same rhythm [7, 55, 16] ms.
// • iPhone web app: Apple allows no haptics from a web page — nothing happens (no error).
// • Phone set to reduce motion / no vibration support → skipped.
const PATTERNS = {
  open: { web: [7, 55, 16], native: [["LIGHT", 0], ["MEDIUM", 70]] },
  send: { web: [9], native: [["LIGHT", 0]] },
};

export function ybHaptic(kind = "open", win = typeof window !== "undefined" ? window : null) {
  const p = PATTERNS[kind] || PATTERNS.open;
  if (!win) return false;
  try {
    if (win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const H = win.Capacitor?.Plugins?.Haptics;
    if (H && typeof H.impact === "function") {
      p.native.forEach(([style, at]) => setTimeout(() => { try { H.impact({ style }); } catch { /* ignore */ } }, at));
      return true;
    }
    if (win.navigator && typeof win.navigator.vibrate === "function") return win.navigator.vibrate(p.web) !== false;
  } catch { /* no haptics on this phone */ }
  return false;
}
export { PATTERNS as HAPTIC_PATTERNS };
