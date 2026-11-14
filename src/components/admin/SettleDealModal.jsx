import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { X, Copy, Building2, User, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import ButtonSpinner from "../common/ButtonSpinner";

// v348 (Ravi: "refund karte waqt manual option de — kitna amount, uske UPI ka QR, reason, note, phir UTR.
// Brand ko pura dun, creator ko pura dun, meri convenience fee 5% / 2% / 1% kaatu ya aadha aadha — wo sab mere
// upar. Tu decide mat kar."). Admin → Escrow → "Settle / Refund" on a campaign / invite deal payment.
// Nothing is pre-chosen: the admin picks the Ybex fee and who gets the rest (or types the 3 amounts).
// Server: backend/manualSettlement.ts (GET / POST /admin/settlements/:txId).

const toP = (v) => Math.round((Number(v) || 0) * 100);
const rs = (p) => (Math.round(p) / 100);
const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const FEE_CHIPS = [0, 1, 2, 5];
const SPLITS = [
  { id: "brand", label: "All to brand" },
  { id: "creator", label: "All to creator" },
  { id: "half", label: "Half – half" },
];
const REASONS = ["Deal cancelled", "Creator didn't deliver", "Brand cancelled after work started", "Dispute settled", "Duplicate payment", "Other"];

/** upi://pay link for the QR (same rules as the server's upiPayLink). Pure. */
export function upiLink(upi, name, amount, note) {
  const pa = String(upi || "").trim();
  if (!/^[\w.-]{2,256}@[A-Za-z][\w.-]{1,64}$/.test(pa) || !(Number(amount) > 0)) return null;
  const q = new URLSearchParams({ pa, pn: String(name || "Ybex").slice(0, 50), am: (Math.round(Number(amount) * 100) / 100).toFixed(2), cu: "INR", tn: String(note || "").slice(0, 50) });
  return `upi://pay?${q.toString()}`;
}

/** Amounts (paise) for a fee % and a split choice. Pure — used by the chips. */
export function splitFor(grossP, feePct, split) {
  const k = Math.round((grossP * (Number(feePct) || 0)) / 100);
  const rest = grossP - k;
  if (split === "brand") return { b: rest, c: 0, k };
  if (split === "creator") return { b: 0, c: rest, k };
  const b = Math.floor(rest / 2);
  return { b, c: rest - b, k };
}

function PayeeBox({ who, icon, name, account, amount, utr, setUtr, note }) {
  const link = account?.method_type === "UPI" ? upiLink(account.upi_id, account.account_holder_name || name, amount, note) : null;
  const copy = (t, l) => { try { navigator.clipboard.writeText(String(t)); toast.success(`${l} copied`); } catch { /* no clipboard */ } };
  return (
    <div className="rounded-2xl border border-gray-200 p-4 space-y-3" data-testid={`settle-pay-${who}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">{icon}<span className="font-bold text-gray-900 truncate">Send {inr(amount)} to {name}</span></div>
      </div>
      {!account ? (
        <p className="text-[13px] font-semibold text-amber-700">No {who === "brand" ? "refund" : "payout"} account saved. Ask them for UPI / bank, send the money, then type the UTR below.</p>
      ) : account.method_type === "UPI" ? (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {link ? <div className="bg-white p-2 rounded-xl border border-gray-100"><QRCodeSVG value={link} size={150} /></div> : null}
          <div className="text-[13px] text-gray-700 space-y-1 min-w-0 w-full">
            <div className="font-mono break-all">UPI: <b>{account.upi_id}</b></div>
            {account.account_holder_name && <div>Name: {account.account_holder_name}</div>}
            <div>Amount: <b>{inr(amount)}</b></div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => copy(account.upi_id, "UPI ID")} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold flex items-center gap-1"><Copy size={12} /> UPI ID</button>
              {link && <a href={link} className="h-9 px-3 rounded-xl bg-gray-900 text-white text-xs font-bold flex items-center sm:hidden">Open UPI app</a>}
            </div>
            <p className="text-[11.5px] text-gray-500">Scan with any UPI app on another phone — the amount is filled in.</p>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-gray-700 font-mono space-y-0.5 select-all">
          <div>{account.account_holder_name || name}</div>
          <div>A/c {account.bank_account_number} · IFSC {account.bank_ifsc}</div>
          <div className="font-sans">Amount: <b>{inr(amount)}</b> (bank transfer — no QR)</div>
        </div>
      )}
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase">UTR / reference of this transfer *</label>
        <input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} placeholder="e.g. 429183746512"
          className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-200 font-mono text-[16px] sm:text-sm focus:outline-none focus:border-purple-500" />
      </div>
    </div>
  );
}

export default function SettleDealModal({ transactionId, onClose, onSuccess }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [feePct, setFeePct] = useState(null);      // null = not chosen yet
  const [customPct, setCustomPct] = useState("");
  const [split, setSplit] = useState(null);         // null = not chosen yet
  const [amt, setAmt] = useState({ b: "", c: "", k: "" });
  const [reasonPick, setReasonPick] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [note, setNote] = useState("");
  const [brandUtr, setBrandUtr] = useState("");
  const [creatorUtr, setCreatorUtr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoadErr(""); setData(null);
    api.get(`admin/settlements/${encodeURIComponent(transactionId)}`, { bypassCache: true })
      .then((r) => setData(r.data))
      .catch((e) => setLoadErr(e?.response?.data?.error || "Couldn't load this payment."));
  };
  useEffect(() => { if (transactionId) load(); }, [transactionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const grossP = toP(data?.transaction?.gross_amount);
  const pct = feePct === "custom" ? Number(customPct) : feePct;
  const applyChips = (nextPct, nextSplit) => {
    if (nextPct === null || nextPct === undefined || nextPct === "" || Number.isNaN(Number(nextPct)) || !nextSplit) return;
    const s = splitFor(grossP, Math.max(0, Math.min(100, Number(nextPct))), nextSplit);
    setAmt({ b: String(rs(s.b)), c: String(rs(s.c)), k: String(rs(s.k)) });
  };
  const chooseFee = (v) => { setFeePct(v); if (v !== "custom") applyChips(v, split); };
  const chooseSplit = (v) => { setSplit(v); applyChips(pct, v); };
  const typeAmt = (key, v) => { setSplit("custom"); setAmt((a) => ({ ...a, [key]: v.replace(/[^0-9.]/g, "") })); };

  const bP = toP(amt.b), cP = toP(amt.c), kP = toP(amt.k);
  const filled = amt.b !== "" && amt.c !== "" && amt.k !== "";
  const left = grossP - bP - cP - kP;
  const reason = reasonPick === "Other" || !reasonPick ? reasonText.trim() : `${reasonPick}${reasonText.trim() ? ` — ${reasonText.trim()}` : ""}`;
  const shownPct = grossP > 0 && filled ? Math.round((kP / grossP) * 10000) / 100 : null;
  const problem = useMemo(() => {
    if (!data) return "";
    if (!filled) return "Choose Ybex fee and who gets the money (or type the 3 amounts).";
    if (left !== 0) return left > 0 ? `${inr(rs(left))} still not given to anyone.` : `${inr(rs(-left))} more than the brand paid.`;
    if (reason.length < 3) return "Write the reason.";
    if (bP > 0 && brandUtr.trim().length < 6) return "Send the brand's money, then type its UTR.";
    if (cP > 0 && creatorUtr.trim().length < 6) return "Send the creator's money, then type its UTR.";
    return "";
  }, [data, filled, left, reason, bP, cP, brandUtr, creatorUtr]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post(`admin/settlements/${encodeURIComponent(transactionId)}`, {
        brand_amount: rs(bP), creator_amount: rs(cP), ybex_amount: rs(kP),
        ybex_percent: shownPct, reason, note: note.trim(), brand_utr: brandUtr.trim(), creator_utr: creatorUtr.trim(),
      });
      toast.success(res.data?.message || "Settlement saved.");
      onSuccess?.(); onClose?.();
    } catch (e) {
      const m = e?.response?.data?.error;
      toast.error(typeof m === "string" && m.length < 220 ? m : "Couldn't save. Nothing was changed — try again.");
      setConfirming(false);
    } finally { setBusy(false); }
  };

  const chip = (on) => `h-10 px-3.5 rounded-xl border text-[13px] font-bold ${on ? "border-purple-600 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-700"}`;
  const tx = data?.transaction;
  const settled = data?.settlement;

  const body = (
    <div className="fixed inset-0 z-[2400] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" data-testid="settle-modal">
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[92dvh] overflow-y-auto p-5 sm:p-7 text-gray-900"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">Settle / refund this deal</h3>
            <p className="text-[13px] text-gray-500">You decide who gets what. Send the money yourself, then save with the UTR.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-xl bg-gray-100 shrink-0"><X size={18} /></button>
        </div>

        {loadErr && <div className="mt-4 text-sm text-red-600 flex items-center gap-3">{loadErr}<button type="button" onClick={load} className="underline font-bold">Retry</button></div>}
        {!data && !loadErr && <div className="mt-6 h-40 rounded-2xl bg-gray-100 animate-pulse" />}

        {data && (
          <div className="mt-4 space-y-5">
            <div className="rounded-2xl bg-gray-50 p-4 text-[13px] grid grid-cols-2 gap-3">
              <div><div className="text-gray-500">Brand</div><div className="font-bold flex items-center gap-1"><Building2 size={13} />{data.brand?.name}</div></div>
              <div><div className="text-gray-500">Creator</div><div className="font-bold flex items-center gap-1"><User size={13} />{data.creator?.name}</div></div>
              <div><div className="text-gray-500">Deal</div><div className="font-bold">{data.title || "Campaign deal"}</div></div>
              <div><div className="text-gray-500">Brand paid</div><div className="font-extrabold text-base">{inr(tx.gross_amount)}</div>
                <div className="text-[11.5px] text-gray-500">Normal split: Ybex fee {inr(tx.platform_fee_amount + tx.gst_amount)} · creator {inr(tx.creator_net_amount)}</div></div>
            </div>

            {settled ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-[13px] space-y-1">
                <div className="font-bold text-green-800">Already settled</div>
                <div>Brand {inr(settled.brand_amount)}{settled.brand_utr ? ` · UTR ${settled.brand_utr}` : ""}</div>
                <div>Creator {inr(settled.creator_amount)}{settled.creator_utr ? ` · UTR ${settled.creator_utr}` : ""}</div>
                <div>Ybex fee {inr(settled.ybex_amount)}</div>
                <div>Reason: {settled.reason}{settled.note ? ` · Note: ${settled.note}` : ""}</div>
              </div>
            ) : !data.can_settle ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] font-semibold text-amber-800">{data.blocked_reason}</div>
            ) : (
              <>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">1 · Ybex convenience fee</div>
                  <div className="flex flex-wrap gap-2">
                    {FEE_CHIPS.map((p) => <button key={p} type="button" className={chip(feePct === p)} onClick={() => chooseFee(p)}>{p === 0 ? "No fee" : `${p}%`}</button>)}
                    <button type="button" className={chip(feePct === "custom")} onClick={() => chooseFee("custom")}>Other %</button>
                    {feePct === "custom" && (
                      <input inputMode="decimal" value={customPct} placeholder="%" onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setCustomPct(v); applyChips(v, split); }}
                        className="h-10 w-20 px-3 rounded-xl border border-gray-200 text-[16px] sm:text-sm" />
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">2 · Who gets the rest</div>
                  <div className="flex flex-wrap gap-2">
                    {SPLITS.map((s) => <button key={s.id} type="button" className={chip(split === s.id)} onClick={() => chooseSplit(s.id)}>{s.label}</button>)}
                    <button type="button" className={chip(split === "custom")} onClick={() => setSplit("custom")}>Custom amounts</button>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">3 · Amounts (₹) — change any of them</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[["b", "Brand gets"], ["c", "Creator gets"], ["k", "Ybex keeps"]].map(([k, l]) => (
                      <label key={k} className="text-[12px] font-semibold text-gray-600">{l}
                        <input inputMode="decimal" value={amt[k]} onChange={(e) => typeAmt(k, e.target.value)} placeholder="0" data-testid={`settle-amt-${k}`}
                          className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-200 font-mono font-bold text-[16px] sm:text-sm focus:outline-none focus:border-purple-500" />
                      </label>
                    ))}
                  </div>
                  <p className={`mt-2 text-[12.5px] font-semibold ${filled && left === 0 ? "text-green-700" : "text-amber-700"}`}>
                    {filled ? (left === 0 ? `Adds up to ${inr(tx.gross_amount)} ✓${shownPct !== null ? ` · Ybex fee = ${shownPct}%` : ""}` : left > 0 ? `${inr(rs(left))} left to give` : `${inr(rs(-left))} too much`) : `Total to share: ${inr(tx.gross_amount)}`}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">4 · Reason *</div>
                  <select value={reasonPick} onChange={(e) => setReasonPick(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[16px] sm:text-sm">
                    <option value="">Pick a reason…</option>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder={reasonPick && reasonPick !== "Other" ? "More detail (optional)" : "Write the reason"}
                    className="mt-2 w-full p-3 rounded-xl border border-gray-200 text-[16px] sm:text-sm resize-none" />
                  <div className="text-xs font-bold text-gray-500 uppercase mt-3 mb-1">Note (optional — brand & creator see it)</div>
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Refund for the 2nd reel that was not posted"
                    className="w-full p-3 rounded-xl border border-gray-200 text-[16px] sm:text-sm resize-none" />
                </div>
                {filled && left === 0 && (bP > 0 || cP > 0) && (
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">5 · Send the money, then type the UTR</div>
                    <div className="space-y-3">
                      {bP > 0 && <PayeeBox who="brand" icon={<Building2 size={15} className="text-blue-600" />} name={data.brand?.name} account={data.brand?.account} amount={rs(bP)} utr={brandUtr} setUtr={setBrandUtr} note="Ybex refund" />}
                      {cP > 0 && <PayeeBox who="creator" icon={<User size={15} className="text-green-600" />} name={data.creator?.name} account={data.creator?.account} amount={rs(cP)} utr={creatorUtr} setUtr={setCreatorUtr} note="Ybex payout" />}
                      {cP > 0 && data.creator?.kyc_status !== "APPROVED" && <p className="text-[12.5px] font-semibold text-red-600">Creator KYC is not approved — the creator part can't be saved until it is (or give the creator ₹0).</p>}
                    </div>
                  </div>
                )}

                {confirming ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-800"><ShieldAlert size={18} /> Save this? It can't be undone.</div>
                    <ul className="text-[13px] text-gray-800 space-y-0.5">
                      <li>Brand gets <b>{inr(rs(bP))}</b>{bP > 0 ? ` · UTR ${brandUtr}` : ""}</li>
                      <li>Creator gets <b>{inr(rs(cP))}</b>{cP > 0 ? ` · UTR ${creatorUtr}` : ""}</li>
                      <li>Ybex keeps <b>{inr(rs(kP))}</b>{shownPct !== null ? ` (${shownPct}%)` : ""}</li>
                      <li>Reason: {reason}</li>
                    </ul>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setConfirming(false)} className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-bold" disabled={busy}>Back</button>
                      <button type="button" onClick={save} disabled={busy} className="h-11 px-5 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center gap-2">{busy ? <ButtonSpinner label="Saving…" /> : "Confirm & save"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {problem && <p className="text-[12.5px] text-gray-500 text-right">{problem}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-bold">Cancel</button>
                      <button type="button" disabled={Boolean(problem)} onClick={() => setConfirming(true)} data-testid="settle-review"
                        className="h-11 px-5 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-40">Review & save</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
