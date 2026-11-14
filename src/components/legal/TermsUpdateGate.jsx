import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { LEGAL, LEGAL_LINKS } from "../../lib/legal/legalContent";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 36 (Ravi): when the Terms change (LEGAL.termsVersion / backend TERMS_VERSION), every signed-in
// brand or creator who accepted an older version — or none on record — sees this once and must agree
// to continue. The answer is saved in user_consents (kind terms + privacy + role terms, new version).
// Reading the Terms and logging out stay possible. Admins are not asked.
const OPEN_PATHS = ["/info/", "/privacy-policy", "/terms", "/privacy", "/refunds", "/login", "/signup", "/apply"];

export default function TermsUpdateGate() {
  const { user, logout } = useAuth() || {};
  const location = useLocation();
  const [need, setNeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const role = String(user?.role || "").toLowerCase();
  const applies = Boolean(user?.user_id) && (role === "creator" || role === "brand");

  useEffect(() => {
    let alive = true;
    if (!applies) { setNeed(false); return undefined; }
    api.get("consents/me")
      .then(({ data }) => {
        if (!alive) return;
        const current = String(data?.terms_version || LEGAL.termsVersion);
        const accepted = data?.consents?.terms;
        setNeed(!(accepted?.granted && String(accepted.version) === current));
      })
      .catch(() => { if (alive) setNeed(false); }); // never lock people out because of a network error
    return () => { alive = false; };
  }, [applies, user?.user_id]);

  if (!need || OPEN_PATHS.some((p) => location.pathname.startsWith(p))) return null;

  const agree = async () => {
    setBusy(true);
    try {
      await api.post("consents", {
        source: `reaccept_v${LEGAL.termsVersion}`,
        items: [
          { kind: "terms", granted: true },
          { kind: "privacy", granted: true },
          { kind: role === "brand" ? "brand_terms" : "creator_terms", granted: true },
        ],
      });
      setNeed(false);
      toast.success("Thanks — you're all set.");
    } catch {
      toast.error("Could not save. Please try again.");
    } finally { setBusy(false); }
  };

  const roleTerms = role === "brand" ? LEGAL_LINKS.brandTerms : LEGAL_LINKS.creatorTerms;
  return (
    <PopupBackdrop className="fixed inset-0 z-[200] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" data-testid="terms-update-gate">
      <PopupPanel kind="auto" below={640} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-xl max-h-[92vh] max-h-[92dvh] overflow-y-auto" /* v330: long change list scrolls; "I agree" stays reachable */ style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
        <h2 className="text-lg font-bold text-gray-900">We've updated our Terms</h2>
        <p className="text-sm text-gray-600 mt-1">Please read what changed and agree to keep using Ybex.</p>
        <ul className="mt-4 space-y-2 text-sm text-gray-800 list-disc pl-5">
          {(LEGAL.termsChanges || []).map((c) => <li key={c}>{c}</li>)}
        </ul>
        <p className="text-xs text-gray-500 mt-4">
          Full text:{" "}
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noreferrer" className="underline">Terms</a>,{" "}
          <a href={roleTerms} target="_blank" rel="noreferrer" className="underline">{role === "brand" ? "Brand" : "Creator"} Terms</a>,{" "}
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>.
          {" "}Version {LEGAL.termsVersion}, updated {LEGAL.lastUpdated}.
        </p>
        <button
          type="button" disabled={busy} onClick={agree}
          className="mt-5 w-full h-12 rounded-xl bg-[#7C3AED] text-white font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "I agree"}
        </button>
        <button type="button" onClick={() => logout?.()} className="mt-2 w-full h-10 text-sm text-gray-600">
          Log out
        </button>
      </PopupPanel>
    </PopupBackdrop>
  );
}
