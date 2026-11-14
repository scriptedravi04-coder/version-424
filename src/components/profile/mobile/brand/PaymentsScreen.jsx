import React, { useState, useEffect } from "react";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../contexts/AuthContext";
import BrandPaymentsMobile from "../../../payments/BrandPaymentsMobile";

// v358: only money that is really in the payment hold (unpaid "pending" / "approved" rows inflated the ₹ held)
const HELD_STATUSES = [
  "deposited", "held", "in_escrow", "video_submitted", "escrow_held"
];
const CLOSED_RX = /^(refund|cancel|fail|expire)/; // v358: refunded / cancelled / failed are not "active protections"
const SETTLED_STATUSES = ["released", "completed", "paid", "success"];

export default function PaymentsScreen({ onBack }) {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false); // v332: escrow-transactions couldn't be read
  const [brandGstin, setBrandGstin] = useState("");
  const [brandCompanyName, setBrandCompanyName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEscrowDetails = async () => {
      try {
        setLoading(true);

        // 1. Fetch brand KYC / GST info
        try {
          const { data: kycRes } = await api.get("verifications/me").catch(() => ({ data: null }));
          if (!cancelled && kycRes?.documents) {
            const g = (kycRes.documents.gstin || kycRes.documents.gst_cert || "").trim();
            if (g) setBrandGstin(g);
            if (kycRes.documents.company_name) setBrandCompanyName(kycRes.documents.company_name);
          }
        } catch (e) {
          console.warn("Could not retrieve KYC verification in PaymentsScreen:", e);
        }

        // 2. Fetch brand profile
        try {
          const { data: bProfile } = await api.get("brand-profile").catch(() => ({ data: null }));
          if (!cancelled && bProfile) {
            if (bProfile.company_name || bProfile.name) {
              setBrandCompanyName((prev) => prev || bProfile.company_name || bProfile.name);
            }
            if (bProfile.gstin || bProfile.gst_number) {
              setBrandGstin((prev) => prev || (bProfile.gstin || bProfile.gst_number).trim());
            }
          }
        } catch (e) {
          console.warn("Could not retrieve brand profile in PaymentsScreen:", e);
        }

        // 3. Fetch escrow transactions
        const { data, failed } = await api.get("escrow-transactions", { bypassCache: true }).catch(() => ({ data: null, failed: true }));
        if (!cancelled) {
          setTxns(Array.isArray(data) ? data : []);
          setListFailed(Boolean(failed));
        }
      } catch (e) {
        console.warn("Failed to load escrow transactions in PaymentsScreen:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadEscrowDetails();

    return () => {
      cancelled = true;
    };
  }, []);

  const retryList = () => api.get("escrow-transactions", { bypassCache: true })
    .then(({ data }) => { setTxns(Array.isArray(data) ? data : []); setListFailed(false); })
    .catch(() => setListFailed(true));

  const amountOf = (t) => Number(t.amount || t.gross_amount || 0);
  const statusOf = (t) => String(t.status || "").toLowerCase();

  const activeEscrowAmount = txns
    .filter((t) => HELD_STATUSES.includes(statusOf(t)))
    .reduce((a, t) => a + amountOf(t), 0);

  const settledPayoutsAmount = txns
    .filter((t) => SETTLED_STATUSES.includes(statusOf(t)))
    .reduce((a, t) => a + amountOf(t), 0);

  const activeProtectionsCount = new Set(
    txns
      .filter((t) => HELD_STATUSES.includes(statusOf(t)) && !CLOSED_RX.test(statusOf(t))) // v358
      .map((t) => t.contract_id || t.id || t.transaction_id)
  ).size;

  // v358: the phone card says "Released this year" — only this year's releases (IST), not all-time
  const thisYearIst = new Date(Date.now() + 5.5 * 3600000).getUTCFullYear();
  const releasedThisYear = txns
    .filter((t) => ["released", "completed", "paid", "success"].includes(String(t.status || "").toLowerCase())
      && new Date(new Date(t.released_at || t.updated_at || t.created_at || 0).getTime() + 5.5 * 3600000).getUTCFullYear() === thisYearIst)
    .reduce((acc, curr) => acc + (Number(curr.amount || curr.gross_amount) || 0), 0);
  const now = Date.now();
  const twentyEightDaysAgo = now - 28 * 24 * 60 * 60 * 1000;
  const past28DaysFunded = txns
    .filter((t) => {
      const tTime = new Date(t.created_at || 0).getTime();
      return tTime >= twentyEightDaysAgo;
    })
    .reduce((acc, curr) => acc + amountOf(curr), 0);

  // v415: no separate loading screen — it had a different header and skeleton, so the page jumped when
  // BrandPaymentsMobile took over. That screen draws one skeleton itself while listLoading is true.
  return (
    <BrandPaymentsMobile
      activeEscrowAmount={activeEscrowAmount}
      settledPayoutsAmount={releasedThisYear}
      activeProtectionsCount={activeProtectionsCount}
      past28DaysFunded={past28DaysFunded}
      growthPercent={null /* was a hardcoded "+100%" */}
      transactions={txns}
      companyName={brandCompanyName || user?.company_name || user?.name || ""}
      gstin={brandGstin}
      onBack={onBack}
      listFailed={listFailed}
      onRetryList={retryList}
      listLoading={loading}
    />
  );
}
