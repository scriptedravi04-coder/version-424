import React, { useEffect, useState } from "react";
import { formatINROrDash } from "../../utils/safeFormat";
import { api } from "../../lib/api";
import { BrandPaymentsSkeleton } from "../../components/common/MobileSkeletons";
import { Wallet, Clock } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";
import BrandPaymentsMobile from "../../components/payments/BrandPaymentsMobile";
import PaymentsRetryCard from "../../components/common/PaymentsRetryCard";
import BrandRefundsCard from "../../components/payments/BrandRefundsCard";

// v415: one place for "how much is this order" and "where is the money" (the page read agreed_amount only).
export function ugcOrderAmount(o) {
  if (!o) return 0;
  for (const v of [o.creator_payout, o.agreed_amount, o.escrow_amount, o.amount, o.brief?.budget]) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
export function ugcOrderMoneyState(o) {
  const pay = String(o?.payment_status || "").toUpperCase();
  const st = String(o?.status || "").toUpperCase();
  if (["RELEASED", "PAID"].includes(pay) || o?.utr_number || st === "COMPLETED") return "released";
  if (["REFUNDED", "FAILED"].includes(pay) || ["CANCELLED", "EXPIRED", "REFUNDED"].includes(st)) return "refunded";
  return "held"; // ESCROW_HELD, or PENDING / empty on an open order (the brief was paid before any creator could claim)
}

/** v416 (QA U2): money still held for UGC = every paid brief that is still open (unclaimed slots included), from the
 *  payments overview. Uses the server's per-brief held amount when it sends one (held_now / held), else the brief
 *  amount minus what was already released for that brief's orders. Pure. */
export function ugcHeldFromOverview(overview, orders = []) {
  if (!overview || !Array.isArray(overview.items)) return null;
  const s = overview.summary || {};
  if (s.ugc_held_now != null) return Number(s.ugc_held_now) || 0;
  const releasedByBrief = new Map();
  (orders || []).forEach((o) => {
    if (ugcOrderMoneyState(o) !== "released") return;
    const k = String(o.brief_id || o.brief?.id || "");
    if (k) releasedByBrief.set(k, (releasedByBrief.get(k) || 0) + ugcOrderAmount(o));
  });
  return overview.items
    .filter((i) => i.kind === "ugc" && i.status === "escrow")
    .reduce((a, i) => {
      const own = i.held_now ?? i.held;
      if (own != null) return a + (Number(own) || 0);
      return a + Math.max(0, (Number(i.amount) || 0) - (releasedByBrief.get(String(i.brief_id || "")) || 0));
    }, 0);
}

export default function BrandUGCPayments() {
  const [orders, setOrders] = useState([]);
  // v332: "loading" stops the ₹0 / "No payment history" flash; "failed" shows a calm Try again card
  // instead of an empty table when the orders couldn't be read.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const isMobile = useIsMobile();

  const loadOrders = () => {
    // v333: no global top loader — the page draws its own skeleton.
    return api.get("ugc/orders/brand").then(res => {
      // v330: the endpoint can answer { orders: [...] } — an object here crashed the page (.filter is not a function).
      const d = res?.data;
      setOrders(Array.isArray(d) ? d : Array.isArray(d?.orders) ? d.orders : []);
      setFailed(false);
    }).catch(err => {
      console.error(err);
      setFailed(true); // v332: no scary toast — the page shows the retry card
    }).finally(() => {
      setLoaded(true);
    });
  };

  // v416 (QA U2): the open paid briefs + UGC refunds come from the same overview the Payments page reads
  const [overview, setOverview] = useState(null);
  const loadOverview = () => api.get("brand/payments-overview", { bypassCache: true })
    .then(({ data }) => setOverview(data?.ok ? data : false))
    .catch(() => setOverview(false));
  useEffect(() => { loadOrders(); if (!isMobile) loadOverview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session 58: the server writes ESCROW_HELD (never "HELD"), so "In Payment Hold" was always ₹0; amounts as numbers.
  // v415: the totals read only agreed_amount and only payment_status=ESCROW_HELD, so an order in production showed
  // "₹0 / ₹0" — the amount can sit in creator_payout / escrow_amount / amount / the brief, and an open order whose
  // payment_status is still PENDING (or empty) is money the brand already paid on the brief.
  const isHeld = (o) => ugcOrderMoneyState(o) === "held";
  const totalSpent = orders?.filter((o) => ugcOrderMoneyState(o) === "released").reduce((acc, o) => acc + ugcOrderAmount(o), 0);
  const ordersHeld = orders?.filter(isHeld).reduce((acc, o) => acc + ugcOrderAmount(o), 0);
  const overviewHeld = ugcHeldFromOverview(overview, orders);
  // v416 (QA U2): "Held ₹0" while paid briefs were still open — unclaimed slots are held too
  const inEscrow = overviewHeld != null ? Math.max(overviewHeld, 0) : ordersHeld;
  const ugcRefunds = overview && Array.isArray(overview.refunds) ? overview.refunds.filter((r) => r.kind === "ugc") : null;

  // v333: a page-shaped skeleton on phones while the orders load (it showed ₹0 and an empty list first).
  if (isMobile && !loaded) return <BrandPaymentsSkeleton />;
  if (isMobile) {
    return (
      <BrandPaymentsMobile
        activeEscrowAmount={inEscrow || 0}
        settledPayoutsAmount={totalSpent || 0}
        activeProtectionsCount={orders?.length || 0}
        past28DaysFunded={inEscrow || 0}
        growthPercent={null /* was a hardcoded "+100%" */}
        listFailed={failed} // v332: orders couldn't be read → calm retry card, not "no payments"
        onRetryList={loadOrders}
        transactions={(orders || []).map((o, idx) => ({
          id: o.id || `ugc-o-${idx}`,
          // v332: no made-up fallbacks ("UGC Fast Turnaround Brief", "Creator Partner", CTR-UGC-3900…)
          contract_id: o.id ? `CTR-UGC-${String(o.id).slice(-6).toUpperCase()}` : "—",
          campaign_title: o.brief?.title || "UGC brief",
          creator_name: o.creator?.name || "Creator",
          gross_amount: ugcOrderAmount(o) || null, // v415: same amount the orders screen shows
          amount: ugcOrderAmount(o) || null,
          status: ugcOrderMoneyState(o) === "released" ? "released" : ugcOrderMoneyState(o) === "refunded" ? "refunded" : "held",
          created_at: o.created_at,
          utr_number: o.utr_number
        }))}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{/* v415: full-width content, not a small block in the middle */}
      <h1 className="text-3xl font-black num-black text-[var(--text-primary)] mb-2">UGC payments</h1>
      <p className="text-[var(--text-secondary)] mb-8 font-medium">What you've paid creators, and what Ybex SafePay is holding for orders still in progress.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 rounded-2xl">
          <Wallet className="text-[var(--violet)] mb-2" size={24}/>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block mb-1">Paid to creators</span>
          <span className="text-3xl font-black num-black text-[var(--text-primary)]">{loaded && !failed ? `₹${totalSpent.toLocaleString("en-IN")}` : "—"}</span>{/* v332: no ₹0 flash / ₹0 on a failed load */}
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 rounded-2xl">
          <Clock className="text-[#7C3AED] mb-2" size={24}/>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block mb-1">Held with Ybex SafePay</span>
          <span className="text-3xl font-black num-black text-[#7C3AED]">{loaded && !failed && overview !== null ? `₹${inEscrow.toLocaleString("en-IN")}` : "—"}</span>{/* v415: blue-600 · v416: waits for the briefs too */}
          <span className="block text-[11px] text-[var(--text-secondary)] mt-1">Includes paid brief slots no creator has claimed yet</span>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 rounded-2xl">
          <Wallet className="text-[var(--text-tertiary)] mb-2" size={24}/>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-widest block mb-1">Orders</span>
          <span className="text-3xl font-black num-black text-[var(--text-primary)]">{loaded && !failed ? orders.length : "—"}</span>{/* v415: fills the empty third column */}
        </div>
      </div>

      {failed ? (
        <PaymentsRetryCard className="mt-8" onRetry={loadOrders} />
      ) : (
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-8">
        <div className="overflow-x-auto">{/* v416 (QA U16): fits a tablet — no 640px minimum; the date column shows from lg up */}
          <table className="w-full table-fixed text-left text-sm text-[var(--text-secondary)]">
            <thead className="bg-[var(--bg-elevated)] text-[11px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
              <tr>
                <th className="px-4 lg:px-6 py-4 w-[36%]">Brief</th>
                <th className="px-4 lg:px-6 py-4">Creator</th>{/* v415: name, not a cut-off internal id */}
                <th className="px-4 lg:px-6 py-4 hidden lg:table-cell">Date</th>
                <th className="px-4 lg:px-6 py-4 text-right">Amount</th>
                <th className="px-4 lg:px-6 py-4 w-[96px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {!loaded ? (
                <tr>
                  <td colSpan="5" className="px-6 pt-4 pb-6">{/* v333: skeleton rows, not "Loading payments…" */}
                    {[0, 1, 2].map((i) => <div key={i} className="h-10 my-2 rounded-lg bg-white/5 animate-pulse" />)}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 pt-8 pb-10 text-center text-[var(--text-secondary)]">No UGC payments yet. When you post a brief, its payment shows here.</td>
                </tr>
              ) : orders?.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                  <td className="px-4 lg:px-6 py-5 font-bold text-[var(--text-primary)]"><span className="block truncate" title={o.brief?.title || "UGC brief"}>{o.brief?.title || "UGC brief"}</span></td>
                  <td className="px-4 lg:px-6 py-5 text-[var(--text-primary)]"><span className="block truncate">{o.creator?.name || o.creator_name || "Creator"}</span>{/* v415 (was "u_cr2…") */}</td>
                  {/* v330: IST date, no "Invalid Date" */}
                  <td className="px-4 lg:px-6 py-5 hidden lg:table-cell">{o.created_at && !Number.isNaN(new Date(o.created_at).getTime()) ? new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}</td>
                  <td className="px-4 lg:px-6 py-5 font-bold text-[var(--text-primary)] text-right whitespace-nowrap">{formatINROrDash(ugcOrderAmount(o) || null) /* v415: real amount, "—" when unknown (was ₹0) */}</td>
                  <td className="px-4 lg:px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      ugcOrderMoneyState(o) === 'released' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 
                      isHeld(o) ? 'bg-blue-500/10 text-[#6D28D9] border-blue-500/20' : 
                      'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)]'
                    }`}>
                      {/* v330: was the raw enum (ESCROW_HELD, RELEASED…) · v415: same three states as the phone screen */}
                      {ugcOrderMoneyState(o) === 'released' ? 'Paid' : isHeld(o) ? 'Held' : 'Refunded'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {/* v416 (QA U2): UGC refunds (e.g. cancelled slots) show on desktop too */}
      {ugcRefunds && <BrandRefundsCard className="mt-6" refunds={ugcRefunds} hasRefundAccount={Boolean(overview?.summary?.has_refund_account)} onChanged={loadOverview} />}
    </div>
  );
}
