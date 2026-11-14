import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Session 43 (v282): the installed app's logged-out screen, built from Ravi's Claude Design file
// "Ybex Login (offline)" + "Ybex App Flow (offline)": purple hero with a 4-slide auto carousel
// (creator card · campaign · contract · case study), dots, then the two photo role cards.
// When the launch splash is on screen it slides up and this screen drops in (yb-drop) and the
// cards rise; without a splash (second open, browser) the same entrance plays on mount.
// Wording rule (Ravi): "Secure payment hold", never "escrow".

const SLIDE_MS = 3500;
// v370: next / utm / ref on the link stay when a role card is tapped (ads, /challenge → Log in)
const keepQuery = () => { try { return window.location.search || ""; } catch { return ""; } };
const IMG = "/app-login/";

const css = `
@keyframes yb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes yb-bob2{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
@keyframes yb-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}100%{box-shadow:0 0 0 8px rgba(34,197,94,0)}}
@keyframes yb-drop{0%{transform:translateY(-110%);animation-timing-function:cubic-bezier(.55,0,1,.45)}48%{transform:translateY(0);animation-timing-function:cubic-bezier(0,.55,.45,1)}64%{transform:translateY(-7%);animation-timing-function:cubic-bezier(.55,0,1,.45)}79%{transform:translateY(0);animation-timing-function:cubic-bezier(0,.55,.45,1)}89%{transform:translateY(-2%);animation-timing-function:cubic-bezier(.55,0,1,.45)}100%{transform:translateY(0)}}
.yb-al-card{transition:transform 150ms ease}
.yb-al-card:active{transform:scale(.98)}
@media (prefers-reduced-motion:reduce){.yb-al *{animation:none!important;transition:none!important}}
`;

const dark = "#0A0A0A", mute = "#6B7280";
const whiteCard = { background: "#FFFFFF", color: dark, boxShadow: "0 18px 40px rgba(20,0,60,.35)" };
const glass = { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 16, padding: "10px 14px", whiteSpace: "nowrap", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" };
const title = { fontSize: 27, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-.6px" };

function Slide({ head, children }) {
  return (
    <div style={{ width: "20%", flex: "none", padding: "0 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={title}>{head}</div>
      <div style={{ position: "relative", height: 270 }}>{children}</div>
    </div>
  );
}

const Verified = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#7C3AED" aria-hidden="true">
    <path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" />
    <path d="M8.5 12l2.3 2.3 4.7-4.7" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function CreatorSlide() {
  return (
    <Slide head={<>Get paid for every<br />brand deal</>}>
      <div style={{ ...whiteCard, position: "absolute", left: 8, right: 8, top: 10, borderRadius: 24, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 58, height: 58, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,#F59E0B,#EC4899 50%,#9B00FF)", flex: "none", boxSizing: "border-box" }}>
            <img src={IMG + "yukti.webp"} alt="Yukti Singh" style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2.5px solid #FFFFFF", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap" }}>Yukti Singh</span><Verified />
            </div>
            <div style={{ fontSize: 12, color: mute, marginTop: 2, whiteSpace: "nowrap" }}>Lifestyle creator · 84k followers</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", alignItems: "center", background: "#F7F5FB", borderRadius: 16, padding: "12px 4px", textAlign: "center" }}>
          <div><div style={{ fontSize: 18, fontWeight: 800 }}>12</div><div style={{ fontSize: 11, fontWeight: 600, color: mute, marginTop: 1 }}>Deals</div></div>
          <div style={{ height: 28, background: "#E4E1EC" }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 18, fontWeight: 800 }}>
              4.1<svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: mute, marginTop: 1 }}>Rating</div>
          </div>
          <div style={{ height: 28, background: "#E4E1EC" }} />
          <div><div style={{ fontSize: 18, fontWeight: 800, color: "#047857" }}>₹46k</div><div style={{ fontSize: 11, fontWeight: 600, color: mute, marginTop: 1 }}>Earned</div></div>
        </div>
      </div>
      <div style={{ position: "absolute", right: 0, top: 176, width: 236, maxWidth: "80%", boxSizing: "border-box", border: "1px solid #EEE9F7", background: "#FFFFFF", color: dark, borderRadius: 16, padding: 12, display: "flex", gap: 10, alignItems: "center", boxShadow: "0 14px 30px rgba(20,0,60,.35)", animation: "yb-bob 3.4s ease-in-out infinite" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F2EAFF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flex: "none" }}>G</div>{/* v332: letter matched no brand ("M" for Gutargoo+) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: mute }}>New offer from Gutargoo+</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>₹15,000 · 1 Reel</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 250, display: "flex", alignItems: "center", gap: 8, background: "#047857", borderRadius: 20, padding: "8px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 10px 24px rgba(0,40,20,.3)", animation: "yb-bob2 3.8s ease-in-out infinite" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFFFFF", animation: "yb-pulse 1.4s ease-out infinite" }} />Paid to your bank
      </div>
    </Slide>
  );
}

const person = (initials, name, bg, status, color) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 30, height: 30, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#FFFFFF" }}>{initials}</div>
    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{name}</div>
    <span style={{ whiteSpace: "nowrap", flex: "none", fontSize: 11, fontWeight: 700, color }}>{status}</span>
  </div>
);

function CampaignSlide() {
  return (
    <Slide head={<>Hire creators.<br />Pay only on delivery.</>}>
      <div style={{ ...whiteCard, position: "absolute", left: 10, right: 30, top: 18, borderRadius: 22, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Diwali Glow Campaign</div>
            <div style={{ fontSize: 12, color: mute }}>3 creators · Reels</div>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 12, background: "#E3F7EE", color: "#0E7A55", fontSize: 11, fontWeight: 800 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "yb-pulse 1.4s ease-out infinite" }} />LIVE
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {person("RK", "Riya Kapoor", "linear-gradient(135deg,#FDBA74,#F472B6)", "Approved", "#0E7A55")}
          {person("AS", "Arjun Singh", "linear-gradient(135deg,#60A5FA,#7C3AED)", "In review", "#7C3AED")}
          {person("NM", "Neha Mehta", "linear-gradient(135deg,#34D399,#0EA5E9)", "Shooting", "#B26B00")}
        </div>
      </div>
      <div style={{ ...glass, position: "absolute", right: 0, top: 196, animation: "yb-bob 3.6s ease-in-out infinite" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
        <div><div style={{ fontSize: 15, fontWeight: 800 }}>₹45,000</div><div style={{ fontSize: 11, color: "#E9D5FF" }}>Held safely till approval</div></div>
      </div>
    </Slide>
  );
}

const party = (label, tint, icon, anim) => (
  <div style={{ ...whiteCard, position: "absolute", top: 70, width: 104, boxSizing: "border-box", borderRadius: 18, padding: 12, textAlign: "center", boxShadow: "0 14px 30px rgba(20,0,60,.35)", animation: anim, ...(label === "Brand" ? { left: 0 } : { right: 0 }) }}>
    <div style={{ width: 40, height: 40, margin: "0 auto", borderRadius: 12, background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{label}</div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "#0E7A55", marginTop: 2 }}>✓ Signed</div>
  </div>
);

function ContractSlide() {
  return (
    <Slide head={<>Contract signed.<br />Both sides protected.</>}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {party("Brand", "#EEF2FF", <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" aria-hidden="true"><rect x="2.5" y="7" width="19" height="13" rx="2.5" /><path d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7" /></svg>, "yb-bob 3.4s ease-in-out infinite")}
        {party("Creator", "#FCE7F3", <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C026D3" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="M15.5 10.5l6-3.5v10l-6-3.5z" /></svg>, "yb-bob2 3.8s ease-in-out infinite")}
        <div style={{ position: "relative", width: 84, height: 84, borderRadius: "50%", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 10px rgba(255,255,255,.12),0 0 0 22px rgba(255,255,255,.06)" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: 6, transform: "translateX(-50%)", whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.3)", fontSize: 13, fontWeight: 700 }}>Legal contract · Secure payment hold</div>
      </div>
    </Slide>
  );
}

function CaseSlide() {
  const bars = [["30%", "#E9DDFF"], ["48%", "#D2B8FF"], ["72%", "#B47BFF"], ["100%", "linear-gradient(180deg,#9B00FF,#6200B4)"]];
  const ring = { width: 28, height: 28, borderRadius: "50%", border: "2px solid #FFFFFF", boxSizing: "border-box", marginLeft: -9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 };
  return (
    <Slide head={<>wefrnd got 6,000+<br />downloads in a month</>}>
      <div style={{ ...whiteCard, position: "absolute", left: 8, right: 8, top: 10, borderRadius: 24, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={IMG + "wefrnd.webp"} alt="wefrnd" style={{ width: 46, height: 46, borderRadius: 14, border: "1px solid #ECEAF1", flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>wefrnd</div>
            <div style={{ fontSize: 12, color: mute, whiteSpace: "nowrap" }}>Social app</div>
          </div>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: "#E3F7EE", color: "#0E7A55", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>CASE STUDY</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1 }}>6,000+</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: mute, marginTop: 4 }}>App downloads · last 30 days</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56 }}>
            {bars.map(([h, bg]) => <div key={h} style={{ width: 14, height: h, borderRadius: 4, background: bg }} />)}
          </div>
        </div>
      </div>
      <div style={{ ...glass, position: "absolute", right: 0, top: 196, animation: "yb-bob 3.6s ease-in-out infinite" }}>
        <div style={{ display: "flex" }}>
          <img src={IMG + "yukti.webp"} alt="" style={{ ...ring, marginLeft: 0, objectFit: "cover" }} />
          <div style={{ ...ring, background: "linear-gradient(135deg,#60A5FA,#7C3AED)" }}>AS</div>
          <div style={{ ...ring, background: "linear-gradient(135deg,#34D399,#0EA5E9)" }}>NM</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Driven by Ybex creators</div>
      </div>
    </Slide>
  );
}

function RoleCard({ to, testId, img, alt, tint, shade, label, sub }) {
  return (
    <Link to={to + keepQuery()} data-testid={testId} className="yb-al-card" style={{ textAlign: "left", background: "#FFFFFF", borderRadius: 24, overflow: "hidden", boxShadow: "0 2px 0 #E4E1EC", display: "flex", flexDirection: "column", textDecoration: "none", WebkitTapHighlightColor: "transparent" }}>
      <div style={{ position: "relative", width: "100%", height: 96, background: tint }}>
        <img src={img} alt={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg,rgba(20,0,40,0) 40%,rgba(20,0,40,${shade}) 100%)` }} />
      </div>
      <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: dark }}>{label}</div>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: mute }}>{sub}</div>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
    </Link>
  );
}

/** v372: the 4-slide auto carousel, shared by the phone screen and the website's desktop sign-in (DesktopAuthFrame).
 *  Renders the track + the dots; the parent is the positioned purple box. */
export function HeroCarousel({ go = true, startAt = 0 }) {
  const [i, setI] = useState(startAt);
  const [snap, setSnap] = useState(false);
  const timer = useRef(null);
  const touch = useRef(null);
  const next = () => setI((n) => n + 1);
  const restart = () => { clearInterval(timer.current); timer.current = setInterval(next, SLIDE_MS); };

  useEffect(() => {
    if (!go) return undefined;
    restart();
    return () => clearInterval(timer.current);
  }, [go]);

  // Slide 5 is a copy of slide 1: after reaching it, jump back to 0 without animating.
  useEffect(() => {
    setSnap(false);
    if (i < 4) return undefined;
    const t = setTimeout(() => { setSnap(true); setI(0); }, 650);
    return () => clearTimeout(t);
  }, [i]);

  const goTo = (n) => { setSnap(false); setI(n); restart(); };
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
    if (Math.abs(dx) < 40) return;
    const cur = i % 4;
    goTo(dx < 0 ? cur + 1 : (cur + 3) % 4);
  };

  return (
    <>
        <div style={{ position: "relative", overflow: "hidden", marginTop: 18, height: 380 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div data-testid="app-login-track" style={{ display: "flex", width: "500%", transform: `translateX(${-i * 20}%)`, transition: snap ? "none" : "transform 600ms cubic-bezier(.65,0,.35,1)" }}>
          <CreatorSlide /><CampaignSlide /><ContractSlide /><CaseSlide /><CreatorSlide />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, display: "flex", justifyContent: "center", gap: 0 }}>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" aria-label={`Go to slide ${n + 1}`} onClick={() => goTo(n)}
            style={{ width: n === i % 4 ? 36 : 24, height: 28, border: "none", padding: 0, cursor: "pointer", background: "none", display: "flex", alignItems: "center", justifyContent: "center" /* v391: 28px-tall tap area, dot looks the same */ }}>
            <span style={{ display: "block", width: n === i % 4 ? 22 : 8, height: 8, borderRadius: 4, background: n === i % 4 ? "#FFFFFF" : "rgba(255,255,255,.4)", transition: "all 300ms" }} />
          </button>
        ))}
      </div>
    </>
  );
}

// footer: optional extra row under the trust line (demo link on a test server).
export default function AppLoginScreen({ footer = null }) {
  const splashOn = () => typeof window !== "undefined" && !!window.__ybSplash && !!document.getElementById("yb-splash");
  const [go, setGo] = useState(() => !splashOn());
  useEffect(() => {
    if (go) return undefined;
    const start = () => setGo(true);
    window.addEventListener("ybex:splash-up", start);
    window.addEventListener("ybex:splash-done", start);
    const safety = setTimeout(start, 11000);
    return () => { window.removeEventListener("ybex:splash-up", start); window.removeEventListener("ybex:splash-done", start); clearTimeout(safety); };
  }, [go]);

  return (
    <div className="yb-al" data-splash-up="" data-testid="app-login-screen"
      style={{ minHeight: "var(--yb-vh, 100vh)" /* v330: visible height, not 100vh */, background: "#F2F1F7", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', system-ui, sans-serif", WebkitFontSmoothing: "antialiased", overflowX: "hidden", position: "relative" }}>
      <style>{css}</style>

      {/* Solid underlay fill ensuring no purple body background peeks at bottom of screen on iOS */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "max(env(safe-area-inset-bottom, 0px), 60px)", background: "#F2F1F7", zIndex: 0, pointerEvents: "none" }} />

      <div data-statusbar="#9B00FF" data-testid="landing-mobile-hero"
        style={{ position: "relative", flex: "none", background: "linear-gradient(170deg,#9B00FF 0%,#6200B4 55%,#2E0066 100%)", borderRadius: "0 0 36px 36px", overflow: "hidden", color: "#FFFFFF", paddingTop: "max(env(safe-area-inset-top, 0px), 14px)", paddingBottom: 42, zIndex: 2, transform: go ? undefined : "translateY(-110%)", animation: go ? "yb-drop 1150ms both" : "none" }}>
        <div style={{ position: "absolute", top: -80, right: -90, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 70%)" }} />
        <div style={{ position: "absolute", bottom: -120, left: -80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle,rgba(180,77,255,.45),rgba(180,77,255,0) 70%)" }} />
        <HeroCarousel go={go} />
      </div>

      <div style={{ flex: 1, padding: "20px 20px 0", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 16, position: "relative", zIndex: 1, background: "#F2F1F7", opacity: go ? 1 : 0, transform: go ? "none" : "translateY(90px)", transition: "transform 700ms cubic-bezier(.34,1.4,.64,1) 600ms, opacity 360ms ease-out 600ms" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <RoleCard to="/app/continue/creator" testId="app-role-creator" img={IMG + "creators.webp"} alt="Ybex creators" tint="linear-gradient(135deg,#F6E8FF 0%,#FBE7F1 100%)" shade=".35" label="I'm a Creator" sub="Get paid brand deals. Free to join." />
          <RoleCard to="/app/continue/brand" testId="app-role-brand" img={IMG + "brands.webp"} alt="Brands on Ybex" tint="linear-gradient(135deg,#ECE8FF 0%,#E0ECFF 100%)" shade=".25" label="I'm a Brand" sub="Or an agency. Hire creators, pay safely." />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: mute }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>Secure payment hold
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h4M14 3l5 5M14 3v5h5M19 13l-6 6-3 1 1-3 6-6z" /></svg>Legal contracts
          </span>
        </div>
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: mute }}>
          Already on Ybex? <a href="/app/continue/creator?login=1" data-testid="app-welcome-login-2" style={{ color: "#7C3AED", fontWeight: 700, textDecoration: "none", padding: "8px 2px", display: "inline-block" }}>Log in</a>
        </div>
        <div data-testid="app-login-legal" style={{ display: "flex", justifyContent: "center", gap: "4px 14px", flexWrap: "wrap", fontSize: 12, color: mute }}>
          <a href="/privacy-policy" style={{ color: mute, textDecoration: "underline", display: "inline-block", padding: "13px 8px" }}>Privacy</a>
          <a href="/info/terms" style={{ color: mute, textDecoration: "underline", display: "inline-block", padding: "13px 8px" }}>Terms</a>
          <a href="/help" style={{ color: mute, textDecoration: "underline", display: "inline-block", padding: "13px 8px" }}>Help</a>
        </div>
        {footer}
        <div style={{ height: "max(env(safe-area-inset-bottom, 0px), 24px)", background: "#F2F1F7", flexShrink: 0 }} />
      </div>
    </div>
  );
}
