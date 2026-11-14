import { tourWanted } from "../whatsNew/WhatsNewPopup"; // v437
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom"; // v348
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Zap, X, BadgeCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { ignored } from "../../utils/ignored";
import { claimAppOpenPopup, appOpenPopupTakenBy } from "../../lib/popupRules";
import { SHEET_OPEN } from "../../lib/motion";
import { buildCreatorInviteActions, buildBrandApplicationActions, buildDealTurnActions, quickActionHiddenOn } from "./quickActionsData";
import { getInboxChip } from "../chat/mobile/chatStageMap";

export const AUTO_SLIDE_MS = 4000; // v430

// Session 41 (Ravi) — "Quick action" popup on phones (look borrowed from a ride app: a light-green
// sheet, "⚡ Quick action (N)", one card per thing waiting for you).
//   creator → a brand invited you to a campaign      (same calls as CreatorReviewInvitationModal)
//   brand   → a creator applied to your campaign      (same calls as BrandCampaignApplicants)
// It opens whenever the app is opened and something is waiting. ✕ hides it until the next app
// open (v346: for the whole app session, even when a new item arrives). Accept opens the chat; Decline asks why first.

const DECLINE_REASONS = {
  creator: ["Budget too low", "Deliverables not aligned", "Busy / Not available", "Other"],
  brand: ["Not the right fit", "Budget too high", "Audience doesn't match", "Other"],
};
const SEEN_KEY = "ybex_quick_actions_closed";

function readClosed() {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"); } catch (e) { ignored("QuickActions:read", e); return []; }
}
function writeClosed(ids) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch (e) { ignored("QuickActions:write", e); }
}
// v346: once the sheet is closed with ✕ it stays closed for the rest of this app session — it used to
// pop up again on every page load / new item until the user acted on each card.
const DISMISSED_KEY = "ybex_quick_actions_dismissed";
function readDismissed() {
  try { return sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch (e) { return false; }
}
function writeDismissed() {
  try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch (e) { ignored("QuickActions:dismiss", e); }
}
// v415 (brand QA: the sheet covered half of EVERY brand page after each load): for brands the sheet opens by
// itself at most once per app session, only on Home, and items closed with ✕ stay closed on later opens too.
const BRAND_AUTO_KEY = "ybex_quick_actions_brand_auto"; // sessionStorage: already auto-opened this session
const BRAND_CLOSED_KEY = "ybex_quick_actions_brand_closed"; // localStorage: item ids the brand closed
export const isBrandHomePath = (p = "") => p === "/dashboard" || p === "/brand/dashboard" || p === "/brand"; // v415
function readBrandAuto() {
  try { return sessionStorage.getItem(BRAND_AUTO_KEY) === "1"; } catch (e) { return false; }
}
function writeBrandAuto() {
  try { sessionStorage.setItem(BRAND_AUTO_KEY, "1"); } catch (e) { ignored("QuickActions:brandAuto", e); }
}
function readBrandClosed() {
  try { const a = JSON.parse(localStorage.getItem(BRAND_CLOSED_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeBrandClosed(ids) {
  try { localStorage.setItem(BRAND_CLOSED_KEY, JSON.stringify(ids.slice(-200))); } catch (e) { ignored("QuickActions:brandClosed", e); }
}
// v415: never open over another popup (Terms, promo, KYC ask, tour, Eva chat, splash…).
export function otherPopupOpen(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return false;
  if (typeof window !== "undefined" && (window.__ybFullScreenAsk || window.__ybPromoShown || window.__ybTourShown)) return true; // v437: + the first-time tour
  if (doc.getElementById("yb-splash") || doc.querySelector(".driver-popover")) return true;
  return Array.from(doc.querySelectorAll('[aria-modal="true"],[data-popup-open="true"],[data-testid="logo-cropper"]'))
    .some((el) => !el.closest('[data-testid="quick-actions"]'));
}
/**
 * v415: may the sheet open by itself now? Pure. Brands: only on Home, once per session (`autoUsed`), and the
 * open that already started stays on its own page (`openPath`). Creators keep the old rule.
 */
export function quickActionsMayShow({ role, path, autoUsed, openPath }) {
  if (role !== "brand") return true;
  if (openPath) return openPath === path;
  return !autoUsed && isBrandHomePath(path);
}

export default function QuickActionsMobile() {
  const { user } = useAuth() || {};
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.role === "brand" ? "brand" : user?.role === "creator" ? "creator" : null;

  const [items, setItems] = useState([]);
  const [closedIds, setClosedIds] = useState(() => [...readClosed(), ...(user?.role === "brand" ? readBrandClosed() : [])]); // v415: + brand's saved ✕
  const [dismissed, setDismissed] = useState(readDismissed); // v346
  useEffect(() => { // v415: role known after the first render (auth still loading) → add the brand's saved ✕ list
    if (role === "brand") setClosedIds((ids) => [...new Set([...ids, ...readBrandClosed()])]);
  }, [role]);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false); // v430: auto-slide stops for good once the person touches the card
  const [busy, setBusy] = useState(null); // "accept" | "decline"
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");

  const load = useCallback(async () => {
    if (!role || !isMobile) return;
    try {
      // Deals where it's your turn (sign, review, reupload) — same chat list the inbox reads.
      const threadsReq = api.get("chat/v2/threads").then((r) => {
        const d = r?.data;
        return Array.isArray(d) ? d : Array.isArray(d?.threads) ? d.threads : [];
      }).catch(() => []);
      if (role === "creator") {
        const [{ data }, threads] = await Promise.all([api.get("creators/invitations"), threadsReq]);
        setItems([...buildCreatorInviteActions(data), ...buildDealTurnActions(threads, false, getInboxChip)]);
      } else {
        const { data: campaigns } = await api.get("campaigns?mine=true");
        const list = Array.isArray(campaigns) ? campaigns : Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
        // Only campaigns that have applicants; newest first; at most 6 calls.
        const withApplicants = list
          .filter((c) => (c.applicants?.length || c.applicant_count || c.applications_count || 0) > 0)
          .slice(0, 6);
        const results = await Promise.allSettled(
          withApplicants.map((c) => api.get(`/campaigns/${c.campaign_id || c.id}/applications`).then((r) => ({ c, apps: r.data })))
        );
        const threads = await threadsReq;
        setItems([
          ...buildBrandApplicationActions(results.filter((r) => r.status === "fulfilled").map((r) => r.value)),
          ...buildDealTurnActions(threads, true, getInboxChip),
        ]);
      }
    } catch (e) {
      ignored("QuickActions:load", e);
    }
  }, [role, isMobile]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { types: ["invitation", "application", "campaign", "deal", "chat"], intervalMs: 90000, enabled: Boolean(role && isMobile) });

  const open = useMemo(() => items.filter((it) => !closedIds.includes(it.id)), [items, closedIds]);
  const current = open[Math.min(idx, Math.max(open.length - 1, 0))];
  // v415: brand auto-open rules + wait while another popup is up (re-checked every 800 ms).
  const [openPath, setOpenPath] = useState(null); // page the brand's one auto-open happened on ("done" after leaving it)
  const [othersUp, setOthersUp] = useState(true);
  const userRef = useRef(user); userRef.current = user; // v437: the check below runs from a timer — read the current user
  const mayShow = quickActionsMayShow({ role, path: location.pathname, autoUsed: readBrandAuto(), openPath });
  // v430: while the person looks at a profile opened from the card, the sheet waits; back on the same page it shows again
  const [leftFrom, setLeftFrom] = useState(null);
  const awayOnProfile = Boolean(leftFrom) && location.pathname !== leftFrom;
  const wanted = !dismissed && Boolean(role) && isMobile && !quickActionHiddenOn(location.pathname) && open.length > 0 && mayShow && !awayOnProfile;
  useEffect(() => {
    // v437: not wanted yet → stay "wait" (it used to flip to "clear", so the sheet popped up the moment its items
    // arrived, before checking for the tour / another popup). An open that already started stays open.
    if (!wanted || openPath) { setOthersUp(!openPath); return undefined; }
    let t;
    const started = Date.now();
    const check = () => {
      // v426: one popup per app open — if the Diwali poster / promo / What's New already had this open, wait for the next.
      const taken = appOpenPopupTakenBy();
      if (taken && taken !== "quick") { setOthersUp(true); return; }
      const homeWait = !window.__ybHomeReady && Date.now() - started < 4000; // not while Home is still loading
      const up = otherPopupOpen() || (tourWanted(userRef.current) && !window.__ybTourGaveUp) /* v437: a new account sees the tour first */ || homeWait || !claimAppOpenPopup("quick");
      setOthersUp(up);
      if (up) t = setTimeout(check, 800);
    };
    t = setTimeout(check, 600); // v415: let the page and its own popups mount first
    return () => clearTimeout(t);
  }, [wanted, openPath]);
  const hidden = dismissed || !wanted || (!openPath && othersUp); // v415: + brand rules + other popups
  useEffect(() => { // v415: remember the one auto-open of this session (brands)
    if (role === "brand" && !hidden && current && !openPath) { setOpenPath(location.pathname); writeBrandAuto(); }
  }, [role, hidden, current, openPath, location.pathname]);
  useEffect(() => { // v415: leaving the page ends that open — it does not follow the brand around
    if (openPath && openPath !== "done" && openPath !== location.pathname) setOpenPath("done");
  }, [location.pathname, openPath]);

  useEffect(() => { if (idx > open.length - 1) setIdx(Math.max(open.length - 1, 0)); }, [open.length, idx]);
  useEffect(() => { setDeclining(false); setReason(""); setOtherText(""); }, [current?.id]);

  const closeAll = () => {
    const ids = [...new Set([...closedIds, ...open.map((o) => o.id)])];
    setClosedIds(ids);
    writeClosed(ids);
    setDismissed(true); writeDismissed(); // v346: at most once per app session after a dismiss
    if (role === "brand") writeBrandClosed([...new Set([...readBrandClosed(), ...open.map((o) => o.id)])]); // v415: same items stay closed next time
  };
  useEffect(() => { // v415: Escape closes the sheet; focus moves into it
    if (hidden || !current) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dropItem = (id) => setItems((list) => list.filter((it) => it.id !== id));
  const closeOne = (id) => { const ids = [...new Set([...closedIds, id])]; setClosedIds(ids); writeClosed(ids); };
  const go = (step) => { setDir(step); setIdx((i) => (i + step + open.length) % open.length); };
  // v430 (Ravi: "user ko pata hi nahi lagega ki 3 hain"): with 2+ cards the sheet moves to the next one every 4 s,
  // so people see there is more than one. Any touch / swipe / arrow / decline stops it.
  useEffect(() => {
    if (paused || declining || busy || open.length < 2 || hidden) return undefined;
    const t = setInterval(() => { setDir(1); setIdx((i) => (i + 1) % Math.max(open.length, 1)); }, AUTO_SLIDE_MS);
    return () => clearInterval(t);
  }, [paused, declining, busy, open.length, hidden]);

  const accept = async () => {
    if (!current || busy) return;
    if (current.kind === "deal") {
      closeOne(current.id);
      navigate(`/chat/${current.threadId}`);
      return;
    }
    setBusy("accept");
    try {
      if (current.kind === "invite") {
        const res = await api.post(`/creators/invitations/${current.raw.id}/accept`);
        toast.success("Invitation accepted! Chat is open.");
        dropItem(current.id);
        const threadId = res?.data?.thread_id;
        navigate(threadId ? `/chat/${threadId}` : "/creator/inbox");
      } else {
        const { data } = await api.post(`/campaigns/${current.campaignId}/applications/${current.raw.application_id}/action`, { action: "accept" });
        toast.success(`${current.title} is shortlisted. Opening chat.`);
        dropItem(current.id);
        navigate(data?.thread_id ? `/chat/${data.thread_id}` : "/brand/inbox");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not accept. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const finalReason = reason === "Other" ? otherText.trim() : reason;
  const decline = async () => {
    if (!current || busy || !finalReason) return;
    setBusy("decline");
    try {
      if (current.kind === "invite") {
        await api.post(`/creators/invitations/${current.raw.id}/decline`, { reason: finalReason });
      } else {
        await api.post(`/campaigns/${current.campaignId}/applications/${current.raw.application_id}/action`, { action: "reject", reason: finalReason });
      }
      toast.success("Declined. They've been told why.");
      dropItem(current.id);
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not decline. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  // v348 (Ravi's iPhone, brand + creator home): the sheet slid up BEHIND the bottom nav. It was drawn inside
  // the page's scroll box (#app-scroll-container), and iPhone keeps a fixed layer inside a scroll box below
  // the nav. Now it is drawn straight into <body> (portal), above the nav (z 50) and the open chat (z 60).
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(
    <AnimatePresence>
      {!hidden && current && (
        <div key="qa" role="dialog" aria-modal="true" aria-label={`Quick action (${open.length})`} data-popup-open="true" /* v415: other popups wait for it */ style={{ position: "fixed", inset: 0, zIndex: 95, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} data-testid="quick-actions">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={closeAll}
            style={{ position: "absolute", inset: 0, background: "rgba(18,18,26,.45)" }}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={SHEET_OPEN} /* v426: timed slide like every other sheet (the spring stuttered on a busy Home) */
            style={{
              // Session 43 (Ravi): deeper green at the top, lighter towards the bottom.
              position: "relative", background: "linear-gradient(180deg, #A3E635 0%, #C5F27A 38%, #ECFCCB 100%)", borderRadius: "26px 26px 0 0", willChange: "transform",
              maxHeight: "calc(var(--yb-vh, 100vh) - var(--yb-sat, 0px) - 12px)", overflowY: "auto", // v348: tall card (decline reasons) stays fully on screen
              padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 14px" }}>
              <Zap size={22} color="#F59E0B" fill="#FACC15" />
              <div style={{ flex: 1, font: "800 17px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Quick action ({open.length})</div>
              <button type="button" onClick={closeAll} aria-label="Close" data-testid="quick-actions-close" autoFocus /* v415: focus goes into the sheet */
                style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }} /* v332: 40px tap target */>
                <X size={22} color="#0A0A0A" />
              </button>
            </div>

            <div style={{ position: "relative", overflow: "hidden", borderRadius: 22 }}>
              <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                <motion.div
                  key={current.id}
                  initial={{ x: dir > 0 ? "70%" : "-70%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ x: dir > 0 ? "-70%" : "70%", opacity: 0, transition: { duration: 0.2 } }}
                  drag={open.length > 1 && !declining ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.3}
                  onPointerDown={() => setPaused(true)}
                  onDragEnd={(_e, info) => { if (info.offset.x < -60) go(1); else if (info.offset.x > 60) go(-1); }}
                  style={{ background: "#fff", borderRadius: 22, padding: 16, touchAction: "pan-y", willChange: "transform" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center", cursor: current.profileHref ? "pointer" : "default" }}
                    role={current.profileHref ? "button" : undefined} tabIndex={current.profileHref ? 0 : undefined}
                    aria-label={current.profileHref ? `Open ${current.title}'s profile` : undefined} data-testid="quick-actions-profile"
                    onClick={() => { if (current.profileHref) { setPaused(true); setLeftFrom(location.pathname); navigate(current.profileHref, { state: { preview: { photo: current.photo || "", name: current.title || "" } } }); } }}>{/* v430: photo / name open the Ybex profile */}
                    {current.photo ? (
                      <img src={current.photo} alt="" onError={(e) => { e.currentTarget.style.opacity = "0"; /* v330: no broken-image icon */ }} style={{ width: 56, height: 56, borderRadius: current.kind === "invite" ? 16 : 28, objectFit: "cover", flexShrink: 0, background: "#F2F2F7" }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: current.kind === "invite" ? 16 : 28, background: "#F5F0FF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", font: "800 20px 'DM Sans',sans-serif", flexShrink: 0 }}>
                        {(current.title || "?").trim()[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ font: "800 16px 'DM Sans',sans-serif", color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
                        {current.verified && <BadgeCheck size={16} color="#16A34A" />}
                      </div>
                      <div style={{ marginTop: 2, font: "600 12.5px 'DM Sans',sans-serif", color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" /* v346: long campaign title */ }}>{current.subtitle}</div>
                      {current.profileHref && <div style={{ marginTop: 2, font: "700 12px 'DM Sans',sans-serif", color: "#7C3AED" }}>View profile ›</div>}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "#F7F7FA" }}>
                    {/* v415: the clamp sits on an inner box — with the padding on the same box a cut third line peeked out */}
                    <div style={{ font: "600 13px/1.45 'DM Sans',sans-serif", color: "#0A0A0A", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", maxHeight: "2.9em" /* v415: exactly 2 lines (2 × 1.45) — nothing peeks below */ /* v346: very long campaign titles */ }}>
                      {current.headline}
                    </div>
                  </div>

                  {current.amount && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }} data-testid="quick-actions-amount">
                      <span style={{ font: "600 12.5px 'DM Sans',sans-serif", color: "#6B7280" }}>{current.amountLabel || "Budget offered"}</span>
                      <span style={{ font: "800 28px/1 'DM Sans',sans-serif", letterSpacing: "-0.02em", color: "#047857" }}>{current.amount}</span>
                    </div>
                  )}

                  {Array.isArray(current.details) && current.details.length > 0 ? (
                    <div style={{ marginTop: 12, borderTop: "1px solid #EEEEF2" }} data-testid="quick-actions-details">
                      {current.details.map((d) => (
                        <div key={d.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F2F5" }}>
                          <span style={{ font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280", flexShrink: 0 }}>{d.label}</span>
                          <span style={{ font: "700 12.5px/1.35 'DM Sans',sans-serif", color: "#0A0A0A", textAlign: "right", minWidth: 0, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" /* v346 */ }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : current.facts.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {current.facts.map((f) => (
                        <span key={f} style={{ padding: "5px 10px", borderRadius: 999, background: "#F5F0FF", color: "#5B21B6", font: "700 11.5px 'DM Sans',sans-serif" }}>{f}</span>
                      ))}
                    </div>
                  )}
                  {current.description && (
                    <div style={{ marginTop: 10, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#374151", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {current.description}
                    </div>
                  )}
                  {current.note && current.note !== current.description && (
                    <div style={{ marginTop: 10, padding: "8px 11px", borderLeft: "3px solid #C4B5FD", background: "#FAF7FF", borderRadius: "0 10px 10px 0" }}>
                      <div style={{ font: "italic 400 12.5px/1.5 'DM Sans',sans-serif", color: "#4B5563", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>“{current.note}”</div>{/* v415: clamp on inner box */}
                    </div>
                  )}

                  {declining ? (
                    <div style={{ marginTop: 14 }} data-testid="quick-actions-decline">
                      <div style={{ font: "700 12.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Why are you declining?</div>
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {DECLINE_REASONS[role].map((r) => (
                          <button key={r} type="button" onClick={() => setReason(r)}
                            style={{ minHeight: 36 /* v353: was ~30px tall */, padding: "7px 11px", borderRadius: 999, border: reason === r ? "1.5px solid #7C3AED" : "1px solid #E5E5EA", background: reason === r ? "#F5F0FF" : "#fff", color: reason === r ? "#7C3AED" : "#374151", font: "600 12px 'DM Sans',sans-serif" }}>
                            {r}
                          </button>
                        ))}
                      </div>
                      {reason === "Other" && (
                        <textarea value={otherText} onChange={(e) => setOtherText(e.target.value.slice(0, 300))} placeholder="Tell them in a line"
                          style={{ marginTop: 8, width: "100%", height: 64, borderRadius: 12, border: "1px solid #E5E5EA", padding: "9px 11px", font: "400 16px 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom-in */, resize: "none", boxSizing: "border-box" }} />
                      )}
                      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setDeclining(false)}
                          style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid #E5E5EA", background: "#fff", font: "700 14px 'DM Sans',sans-serif", color: "#374151" }}>Back</button>
                        <button type="button" onClick={decline} disabled={!finalReason || busy === "decline"} data-testid="quick-actions-decline-send"
                          style={{ flex: 1.4, height: 46, borderRadius: 14, border: "none", background: "#DC2626", color: "#fff", font: "700 14px 'DM Sans',sans-serif", opacity: !finalReason || busy ? 0.55 : 1 }}>
                          {busy === "decline" ? "Declining…" : "Decline"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                      {current.kind !== "deal" && (
                      <button type="button" onClick={() => setDeclining(true)} aria-label="Decline" data-testid="quick-actions-decline-open"
                        style={{ width: 54, height: 50, borderRadius: 14, border: "1.5px solid #D4D4D8", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={22} color="#374151" />
                      </button>
                      )}
                      <button type="button" onClick={accept} disabled={busy === "accept"} data-testid="quick-actions-accept"
                        style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: "#7C3AED", color: "#fff", font: "800 15px 'DM Sans',sans-serif", opacity: busy ? 0.7 : 1 }}>
                        {busy === "accept" ? "Opening chat…" : current.acceptLabel}
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {open.length > 1 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <button type="button" onClick={() => { setPaused(true); go(-1); }} aria-label="Previous" style={{ border: "none", background: "transparent", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} /* v332: 40px tap target */><ChevronLeft size={20} /></button>
                <div style={{ display: "flex", gap: 5 }}>
                  {open.map((o, i) => (
                    <span key={o.id} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, background: i === idx ? "#0A0A0A" : "rgba(10,10,10,.25)", transition: "width .2s" }} />
                  ))}
                </div>
                <button type="button" onClick={() => { setPaused(true); go(1); }} aria-label="Next" style={{ border: "none", background: "transparent", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} /* v332 */><ChevronRight size={20} /></button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
