import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { storedReferral, forgetReferral, storedCreatorCode, forgetCreatorCode, captureRefFromUrl } from "../../lib/referralCapture";

// Session 36: after sign-in, quietly apply what the visitor brought with them:
//  - the inviter's referral code (server checks: new account, not yourself, one inviter only)
//  - a creator code from a /code/<CODE> link (saved to the creator's account)
export default function ReferralClaimer() {
  const { user } = useAuth() || {};
  useEffect(() => { captureRefFromUrl(); }, []);
  useEffect(() => {
    if (!user?.user_id) return;
    const role = String(user.role || "").toLowerCase();
    const ref = storedReferral();
    // v378 (QA L13): say whether the invite counted (it failed silently before). Only a real refusal is shown.
    if (ref) api.post("referrals/claim", { code: ref })
      .then(() => toast.success("🎉 Invite code applied — your friend gets the credit."))
      .catch((e) => { const msg = e?.response?.data?.error || e?.response?.data?.detail; if (msg && e?.response?.status < 500) toast.error(msg); })
      .finally(forgetReferral);
    const code = storedCreatorCode();
    if (code && role === "creator") {
      api.post("creator/coupon", { code })
        .then((r) => toast.success(`🎉 Creator code ${r.data?.code || code} added — lower fee on your next deals.`))
        .catch((e) => toast.error(e?.response?.data?.error || "That creator code could not be added."))
        .finally(forgetCreatorCode);
    }
  }, [user?.user_id, user?.role]);
  return null;
}
