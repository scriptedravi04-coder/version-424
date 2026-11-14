import React, { useState, useEffect, useRef } from "react";
import { Lock, ShieldCheck, Check } from "lucide-react";
import MobileSheet, { SheetHeader } from "./MobileSheet";
import { api } from "../../../lib/api";
import { campaignAgreement, agreementPlainText } from "../../../lib/agreementTerms";
import AgreementTermsPanel from "../AgreementTermsPanel";

// Mobile equivalent of the desktop ContractModal.jsx — same terms, same two API calls
// (real OTP to the registered email, then POST /chat/v2/threads/:id/sign). Nothing about
// the desktop flow is changed; this just stops mobile users hitting a "use desktop" toast.

const label = { font: "600 11px 'DM Sans',sans-serif", letterSpacing: ".4px", color: "#6B7280", textTransform: "uppercase" };
const clause = { font: "400 12.5px/1.6 'DM Sans',sans-serif", color: "#4B5563", marginTop: 4 };
const clauseTitle = { font: "600 12px 'DM Sans',sans-serif", color: "#0A0A0A" };

export default function MobileContractSheet({
  thread,
  user,
  isBrand,
  amount = 0,
  campaignTitle = "Collaboration",
  onSendOtp,
  onSign,
  onClose,
}) {
  // Same rule as desktop (session 27): the server picks the signing email — a brand's verified
  // POC business email from Settings, else the login email.
  const [registeredEmail, setRegisteredEmail] = useState(user?.email || "");
  useEffect(() => {
    let alive = true;
    api.get("contract/signing-email", { bypassCache: true }).then(({ data }) => {
      if (alive && data?.email) setRegisteredEmail(data.email);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.user_id]);
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);
  const [readTerms, setReadTerms] = useState(false);
  const termsRef = useRef(null); // session 28: the text on screen goes into the signature record

  useEffect(() => {
    setCode("");
    setOtpSent(false);
  }, [thread?.id]);

  const partnerName = isBrand
    ? thread?.creator?.name || thread?.creator?.full_name || "the Creator"
    : thread?.brand?.company_name || thread?.brand?.name || "the Brand";

  const deliverables =
    (Array.isArray(thread?.deliverables) && thread.deliverables.length ? thread.deliverables : null) ||
    (Array.isArray(thread?.ugc_order?.deliverables) && thread.ugc_order.deliverables.length ? thread.ugc_order.deliverables : null) ||
    (() => {
      const list = String(thread?.invite_terms?.deliverables || "").split(/\n|,|;/).map((x) => x.trim()).filter(Boolean);
      return list.length ? list : null;
    })();

  // v414: same default as the server (campaignGuards revisionAllowance = 5, 0 is real) — was 1.
  const revisions = [thread?.revision_count, thread?.ugc_order?.revision_count].map(v => (v === null || v === undefined || v === '' ? NaN : Number(v))).find(n => Number.isFinite(n) && n >= 0) ?? 5;
  const deadline = thread?.deadline || thread?.ugc_order?.internal_deadline;
  // v332: dates in IST / Indian format, and never "Invalid Date" in the agreement text.
  const fmtDeadline = (raw) => {
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
  };
  const deadlineText = fmtDeadline(deadline) || thread?.invite_terms?.timeline || "As agreed in chat";

  // Session 30 — Agreement v1 (same text as desktop). The OTP is sent only after the box is ticked.
  const deadlineRaw = thread?.deadline || thread?.ugc_order?.internal_deadline;
  const agreementV1 = campaignAgreement({
    brandName: thread?.brand?.company_name || thread?.brand?.name,
    creatorName: thread?.creator?.name || thread?.creator?.full_name,
    amount,
    deliverables: (deliverables || []).map((d) => (typeof d === "string" ? d : d?.title || d?.type || "")).filter(Boolean),
    deadlineText: fmtDeadline(deadlineRaw) || thread?.invite_terms?.timeline || "",
    revisions, // v414: same value as above (was `|| 1`)
  });
  useEffect(() => {
    if (readTerms && !otpSent && !sending && registeredEmail) handleSendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readTerms, registeredEmail]);

  const handleSendOtp = async () => {
    if (sending) return;
    setSending(true);
    // v330: an error used to leave "Sending…" on screen for good
    let ok = false;
    try { ok = await onSendOtp(registeredEmail); } finally { setSending(false); }
    if (ok) setOtpSent(true);
  };

  const handleSign = async () => {
    if (signing) return;
    setSigning(true);
    // v330: an error used to leave "Signing…" on screen for good
    let ok = false;
    try { ok = await onSign({ email: registeredEmail, code, agreementText: agreementPlainText(agreementV1) }); } finally { setSigning(false); }
    if (ok) onClose();
  };

  const canSign = otpSent && readTerms && code.trim().length === 6 && !signing;

  return (
    <MobileSheet onClose={onClose}>
        {/* Session 43 (Ravi): the creator-code ask is no longer here — it is a card in the chat after
            both sides sign and before the brand pays (CreatorCodeDealCard). */}
      <SheetHeader
        title="Partnership contract"
        subtitle={`Between you and ${partnerName}.`}
        onClose={onClose}
      />

      <div ref={termsRef} style={{ marginTop: 14 }}>
        <AgreementTermsPanel agreement={agreementV1} compact pdfName="ybex-campaign-agreement.pdf" pdfSubtitle={`${campaignTitle} · with ${partnerName}`} />
      </div>

      <button
        type="button"
        role="checkbox" /* v332: screen readers heard a plain button, not a tick box */
        aria-checked={readTerms}
        onClick={() => setReadTerms((v) => !v)}
        style={{
          marginTop: 14, width: "100%", display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
          background: "none", border: "none", padding: 0, cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: readTerms ? "none" : "1.5px solid #D1D5DB",
            background: readTerms ? "#7C3AED" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {readTerms && <Check size={13} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{ font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#4B5563" }}>
          I've read and agree to this campaign agreement, and I'm authorised to sign for my side.
        </span>
      </button>

      {/* OTP */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ECECF0", opacity: readTerms ? 1 : 0.5, pointerEvents: readTerms ? "auto" : "none" }} aria-disabled={!readTerms}>
        {!readTerms && <div style={{ marginBottom: 8, font: "600 12px 'DM Sans',sans-serif", color: "#7C3AED" }}>Tick the box above to get your code.</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Lock size={13} color="#7C3AED" />
          <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Verify to sign</span>
        </div>

        {registeredEmail ? (
          <div style={{ marginTop: 8, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>
            We'll email a 6-digit code to <strong style={{ color: "#0A0A0A", overflowWrap: "anywhere" /* v330: long emails overflowed at 320px */ }}>{registeredEmail}</strong>.
          </div>
        ) : (
          <div style={{ marginTop: 8, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#B45309" }}>
            No email is linked to this account, so a verification code can't be sent. Add one in Settings first.
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 9 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code" /* v330 */
            placeholder="••••••"
            disabled={!otpSent}
            style={{
              flex: 1, minWidth: 0, height: 48, borderRadius: 14, background: otpSent ? "#F9F9FB" : "#F2F2F7", // v330: minWidth so "Resend" stays on screen at 320px
              border: "1px solid #E5E5EA", padding: "0 14px", boxSizing: "border-box",
              font: "600 17px 'DM Sans',sans-serif", letterSpacing: ".3em", textAlign: "center",
              color: "#0A0A0A", opacity: otpSent ? 1 : 0.5,
            }}
          />
          <button
            onClick={handleSendOtp}
            disabled={sending || !registeredEmail || !readTerms}
            style={{
              height: 48, padding: "0 16px", borderRadius: 14, background: "#F2F2F7", border: "1px solid #E5E5EA",
              font: "600 13px 'DM Sans',sans-serif", color: "#0A0A0A", flexShrink: 0,
              opacity: sending || !registeredEmail ? 0.5 : 1, cursor: "pointer",
            }}
          >
            {sending ? "Sending…" : otpSent ? "Resend" : "Send code"}
          </button>
        </div>

        <div style={{ marginTop: 9, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <ShieldCheck size={13} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ font: "400 11px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>
            Entering the code is your electronic signature on this agreement (Section 10A, IT Act 2000) and you agree to the <a href="/info/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#7C3AED", fontWeight: 600 }}>Terms</a>. Both sides get a record.
          </span>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 9 }}>
        <button
          onClick={onClose}
          style={{
            height: 50, padding: "0 20px", borderRadius: 14, background: "#F2F2F7", border: "none",
            font: "600 14.5px 'DM Sans',sans-serif", color: "#0A0A0A", cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSign}
          disabled={!canSign}
          style={{
            flex: 1, height: 50, borderRadius: 14, background: "#7C3AED", border: "none",
            font: "600 14.5px 'DM Sans',sans-serif", color: "#fff",
            opacity: canSign ? 1 : 0.5, cursor: canSign ? "pointer" : "default",
          }}
        >
          {signing ? "Signing…" : "Sign contract"}
        </button>
      </div>
    </MobileSheet>
  );
}
