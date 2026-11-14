import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

// Session 36: one line for creators — the live offer / their code or referral reward ("happy line"),
// otherwise the invite reward. Never asks "have a code?" (that confuses people who have none).
export default function OfferStrip({ className = "" }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("platform/fee-config").then((r) => setCfg(r.data || {})).catch(() => setCfg({})); }, []);
  if (!cfg) return null;
  if (cfg.fee_kind && cfg.fee_kind !== "platform") {
    const text = cfg.promo_line || (cfg.coupon ? `${cfg.fee_label}: ${cfg.below_threshold_rate}% fee on your next deal` : cfg.fee_label);
    return <div className={`text-[12px] font-semibold text-emerald-700 ${className}`} data-testid="offer-strip">🎉 {text}</div>;
  }
  return (
    <Link to="/refer" className={`inline-block text-[12px] font-semibold text-[#4f46e5] ${className}`} data-testid="offer-strip">
      🎁 Invite creators → deals at 0% fee
    </Link>
  );
}
