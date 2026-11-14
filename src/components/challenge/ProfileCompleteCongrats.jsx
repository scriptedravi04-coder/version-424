import React, { useEffect, useRef, useState } from "react";
import { tourPending } from "../whatsNew/WhatsNewPopup"; // v437
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { creatorProfileStrength } from "../../lib/creatorTasks";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { getMyChallenge } from "../../lib/challengeApi";
import { OFFER_NEEDS_REEL, RECHARGE_AMOUNT, TAGS_LINE } from "../../lib/diwaliChallenge";
const ADD_REEL = "/creator/settings?section=portfolio&add=1&diwali=1"; // portfolio → add reel with the Diwali toggle on

// v378 (Ravi: "profile 100% hote hi popup — Congratulations, you are eligible for the offer. UPI mat maango, KYC mein
// already hai. Finance team 1–2 din mein de degi"). Checks the creator's profile (same five parts as Home) + KYC after
// every save (ybex:data-changed) and on page changes, at most every 15 s. Shown once per creator.

const SKIP = /^\/(login|signup|app|onboarding|admin|account-status|legal|terms|privacy)/;
const seenKey = (uid) => `ybx_profile100_${uid}`;
const isSeen = (uid) => { try { return localStorage.getItem(seenKey(uid)) === "1"; } catch { return false; } };
const markSeen = (uid) => { try { localStorage.setItem(seenKey(uid), "1"); } catch { /* private mode */ } };

/** Pure: profile parts + KYC submitted (KYC carries the UPI / bank the reward goes to). */
export function profileOfferState(profile, kycRow) {
  const p = profile || {};
  const strength = creatorProfileStrength(p, Array.isArray(p.portfolio) ? p.portfolio.length : null);
  const kyc = normalizeKycStatus(kycRow);
  const kycDone = kyc === "APPROVED" || kyc === "PENDING";
  const parts = 6;
  const done = strength.percent / 20 + (kycDone ? 1 : 0);
  return { percent: Math.round((done / parts) * 100), complete: done === parts, missing: [...strength.missing, ...(kycDone ? [] : ["KYC"])] };
}

export default function ProfileCompleteCongrats() {
  const { user, loading } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const [show, setShow] = useState(null); // null | "eligible" | "reel"
  const lastCheck = useRef(0);
  const busy = useRef(false);
  const reelShown = useRef(false);
  const uid = user?.user_id || user?.id;

  const check = async (force = false) => {
    if (loading || !uid || user?.role !== "creator" || isSeen(uid) || busy.current) return;
    if (SKIP.test(window.location.pathname)) return;
    if (tourPending(user)) { setTimeout(() => check(true), 20_000); return; } // v437: never on top of the first-time tour
    if (!force && Date.now() - lastCheck.current < 15_000) return;
    lastCheck.current = Date.now();
    busy.current = true;
    try {
      const [me, kyc] = await Promise.all([
        api.get("creators/me", { bypassCache: true }).then((r) => r?.data?.profile || r?.data || null).catch(() => null),
        api.get("verifications/me", { bypassCache: true }).then((r) => r?.data || null).catch(() => null),
      ]);
      if (!me) return;
      const st = profileOfferState({ ...(user || {}), ...me }, kyc);
      if (!st.complete) return;
      const ch = await getMyChallenge();
      if (!ch || ch.phase !== "open") return; // offer not running — nothing to promise
      if (OFFER_NEEDS_REEL && !(Array.isArray(ch.entries) && ch.entries.length)) {
        if (!reelShown.current && !tourPending(user)) { reelShown.current = true; setShow("reel"); }
        return;
      }
      if (tourPending(user)) { setTimeout(() => check(true), 20_000); return; } // v437
      markSeen(uid);
      setShow("eligible");
    } finally { busy.current = false; }
  };

  useEffect(() => { check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid, loading, location.pathname]);
  useEffect(() => {
    const onChange = (e) => {
      const url = String(e?.detail?.url || "");
      if (/creators\/(me|profile)|kyc|verifications|portfolio|challenge|outbox/.test(url)) setTimeout(() => check(true), 2500);
    };
    window.addEventListener("ybex:data-changed", onChange);
    return () => window.removeEventListener("ybex:data-changed", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loading]);

  if (!show) return null;
  const close = () => setShow(null);
  const eligible = show === "eligible";
  return (
    <div data-testid="profile-congrats" role="dialog" aria-modal="true" onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(15,10,30,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 22, padding: "26px 22px 20px", textAlign: "center", boxShadow: "0 20px 60px rgba(60,20,120,.35)", fontFamily: "'Plus Jakarta Sans','DM Sans',sans-serif" }}>
        <div style={{ fontSize: 46, lineHeight: 1 }}>🎉</div>
        <h2 style={{ margin: "12px 0 6px", fontSize: 21, fontWeight: 800, color: "#1C1530" }}>
          Congratulations!
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "#4B4466" }}>
          {eligible
            ? <>You have completed your profile. <b>You are eligible for the {RECHARGE_AMOUNT} offer.</b></>
            : <>Your profile is complete. <b>Last step to get your {RECHARGE_AMOUNT}:</b> follow @ybex.in, post any reel with {TAGS_LINE} in the caption and add it to your Ybex portfolio.</>}
        </p>
        {eligible && (
          <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "#6B6585", background: "#F5F0FF", borderRadius: 12, padding: "10px 12px" }}>
            Ybex's finance team will send it to your KYC payout (UPI / bank) within 1–2 days. Nothing else to fill.
          </p>
        )}
        <button type="button" data-testid="profile-congrats-ok"
          onClick={() => { close(); if (!eligible) navigate(ADD_REEL); }}
          style={{ marginTop: 18, width: "100%", height: 46, border: 0, borderRadius: 14, background: "linear-gradient(135deg,#7C3AED,#A855F7)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          {eligible ? "Awesome!" : "Add my reel"}
        </button>
        {!eligible && (
          <button type="button" onClick={close} style={{ marginTop: 8, background: "none", border: 0, color: "#7A7392", fontSize: 13, cursor: "pointer" }}>Later</button>
        )}
      </div>
    </div>
  );
}
