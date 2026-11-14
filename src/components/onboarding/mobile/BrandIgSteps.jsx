import React from "react";
import { Clock3, Loader2 } from "lucide-react";
import { fmtIgCount } from "../../instagram/IgHandleField";

// v375 (Ravi's design "Brand Onboarding IG Split"; Ravi: show the answer under the handle box, not on new pages):
// pieces shown under the brand's Instagram box in BrandOnboardingMobile.jsx.
//   "Is this your brand?" card — photo, name, @handle · followers, bio, last 3 posts (catches a typo before the wrong
//                                logo goes live to creators)
//   busy line                  — Meta busy / timeout: Continue moves the brand on (logo + name by hand, the username is
//                                saved); one automatic retry after 12 s, then only "Try again"

const PURPLE = "#7C3AED";

/** What a fetch answer means for the brand screen. Pure (tests). */
export function brandIgOutcome(r) {
  if (!r) return "none";
  if (r.ok) return "found";
  if (r.status === 404 || r.code === "NOT_PROFESSIONAL") return "not_found"; // private / personal account or a typo
  if (r.status === 503 || r.code === "NOT_CONFIGURED") return "off";          // Instagram fetch switched off
  return "slow";                                                              // busy, rate limit, timeout, network
}

/** Skeleton card under the handle while "Find my brand" waits (up to 4 s, then 1c). */
export function IgFindingCard() {
  const bar = (w, h = 12) => <span style={{ display: "block", width: w, height: h, borderRadius: 6, background: "#ECEAF2" }} />;
  return (
    <div data-testid="brand-ig-finding" role="status" aria-live="polite" style={{ marginTop: 16, borderRadius: 18, background: "#fff", border: "1px solid #E5E5EA", padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 52, height: 52, borderRadius: 26, background: "#ECEAF2", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>{bar("60%", 14)}{bar("40%")}</div>
      <Loader2 size={18} color={PURPLE} className="animate-spin" />
    </div>
  );
}

/** 1b: the found profile. */
export function IgConfirmCard({ nums, handle }) {
  if (!nums) return null;
  const name = nums.name || handle;
  const thumbs = (Array.isArray(nums.media) ? nums.media : []).map((m) => m?.thumb).filter(Boolean).slice(0, 3);
  const followers = nums.followers !== null && nums.followers !== undefined ? ` · ${fmtIgCount(nums.followers)} followers` : "";
  return (
    <div data-testid="brand-ig-confirm" style={{ marginTop: 18, borderRadius: 22, background: "#fff", border: "1px solid #E5E5EA", padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
      <span style={{ width: 84, height: 84, borderRadius: 42, background: "linear-gradient(135deg,#FFB020,#F0388A 55%,#7C3AED)", padding: 3, boxSizing: "border-box", flexShrink: 0 }}>
        <span style={{ display: "flex", width: "100%", height: "100%", borderRadius: "50%", background: "#15121F", border: "3px solid #fff", boxSizing: "border-box", alignItems: "center", justifyContent: "center", overflow: "hidden", font: "800 28px 'DM Sans',sans-serif", color: "#fff" }}>
          {nums.photo_url ? <img src={nums.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : String(name || "?").slice(0, 1).toUpperCase()}
        </span>
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, maxWidth: "100%" }}>
        <span style={{ font: "800 20px/1.2 'DM Sans',sans-serif", color: "#15121F", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <span style={{ font: "500 14px 'DM Sans',sans-serif", color: "#6B6880" }}>@{handle}{followers}</span>
      </div>
      {nums.bio && <span style={{ font: "500 14px/1.45 'DM Sans',sans-serif", color: "#3D3A4D", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{nums.bio}</span>}
      {thumbs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, width: "100%" }}>
          {thumbs.map((t, i) => (
            <span key={i} style={{ aspectRatio: "1", borderRadius: 8, background: "#ECEAF2", overflow: "hidden" }}>
              <img src={t} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Instagram busy / no answer in 4 s: one small line under the box (Ravi: "page ki jagah wahi choti si line").
 *  `retryIn` = seconds to the one automatic retry (null = none left → "Try again" link). */
export function IgSlowLine({ handle, retryIn, retrying, onRetry }) {
  return (
    <div data-testid="brand-ig-slow" role="status" style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#FFF8EB", border: "1px solid #F5E1BC" }}>
      <Clock3 size={18} color="#D97706" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ font: "500 13px/1.45 'DM Sans',sans-serif", color: "#4B4453" }}>
        Instagram is busy right now. Tap <b style={{ fontWeight: 700, color: "#15121F" }}>Continue</b> and add your logo and name yourself — we'll keep <b style={{ fontWeight: 700, color: "#15121F" }}>@{handle}</b> on your profile.
        <div data-testid="brand-ig-retry" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, color: "#6B6880", fontWeight: 600 }}>
          {retrying ? <><Loader2 size={12} className="animate-spin" /> Checking Instagram…</>
            : retryIn !== null ? <>Retrying automatically in {retryIn}s</>
            : <button type="button" data-testid="brand-ig-retry-now" onClick={onRetry} style={{ padding: 0, background: "none", border: "none", font: "700 13px 'DM Sans',sans-serif", color: PURPLE, cursor: "pointer" }}>Try again</button>}
        </div>
      </div>
    </div>
  );
}

/** Text link under a primary button (design: purple, 14.5px, centred). */
export function TextLinkButton({ children, onClick, testId }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} style={{ marginTop: 14, minHeight: 40, width: "100%", background: "none", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: PURPLE, cursor: "pointer" }}>
      {children}
    </button>
  );
}
