// v419 (Ravi: "Eva free invoice", design: Eva_Invoice.html) — Eva makes an invoice in chat for creators and brands.
// The design prototype ran on made-up profiles; this one reads the real profile, verified KYC (PAN / GSTIN / UPI),
// Ybex deals and saved clients from GET /invoices/bootstrap, and every invoice is saved on the server (POST /invoices),
// so "My invoices" is the same on every phone. The maths lives in invoiceCore.js (the server checks it again).
// Opens full screen over Eva from the "invoice" card (creator / brand brains) or the promo on Eva's home.
import React from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../../../lib/api";
import { readEvaSettings } from "../../feedback/evaSettings";
import {
  calc, inr, words, fmtDate, todayIso, addDaysIso, daysBetween, statusOf, parseItems, parseAmount, tidyName, gstinIn, gstinOk, stateCodeIn,
  upiIn, bankIn, upiUri, GST_STATES, TDS, SAC, initials,
} from "./invoiceCore";

const FONT = "'DM Sans',sans-serif";
const ORB = "radial-gradient(circle at 34% 30%,#F7FFD1 0%,#C6F24E 28%,#4CC765 62%,#178A5B 100%)";
const BG = "radial-gradient(60% 34% at 82% 22%,rgba(198,242,78,.26) 0%,rgba(198,242,78,0) 100%),radial-gradient(70% 40% at 12% 70%,rgba(8,52,22,.45) 0%,rgba(8,52,22,0) 100%),radial-gradient(50% 30% at 70% 88%,rgba(134,239,172,.14) 0%,rgba(134,239,172,0) 100%),#1F7A35";
const ST_CARD = { paid: { c: "#047857", bg: "#ECFDF5" }, unpaid: { c: "#B45309", bg: "#FFFBEB" }, overdue: { c: "#B91C1C", bg: "#FEF2F2" }, cancelled: { c: "#6B7280", bg: "#F3F4F6" } };
const ST_LIST = { paid: { c: "#14532D", bg: "#C6F432" }, unpaid: { c: "#FFFFFF", bg: "rgba(255,255,255,.16)" }, overdue: { c: "#7F1D1D", bg: "#FECACA" }, cancelled: { c: "#FFFFFF", bg: "rgba(255,255,255,.08)" } };
export const isHi = (t) => /[ऀ-ॿ]/.test(t) || /\b(bana|banao|banado|chahiye|karo|kar do|mera|meri|mujhe|hai|kya|nahi|bhai|kitna|kaise|batao|ke liye|din|kiske|kya likhu)\b/i.test(t);

const T = {
  en: {
    intro: "Sure — here's what will go on your invoice:", fName: "Name", fAddr: "Address", notAdded: "Not added yet", payLbl: "Payment",
    askAddr: "What address should go on the invoice? Your city is enough if you don't want to share more. I'll save it for next time.",
    askClient: (w) => `Who is this invoice for? Type the name, or pick one of your ${w}.`,
    otherLbl: "Someone else", otherClient: "Sure — type their name. They don't need to be on Ybex.",
    askGstin: (n) => `Does ${n} have a GSTIN? Send it (I'll pick the state from it), or skip.`,
    askState: (n) => `Which state is ${n} in? It decides CGST + SGST or IGST.`, sameState: (s) => `Same as mine (${s})`,
    badGstin: "That GSTIN doesn't check out — one character may be wrong. Send it again, or skip.",
    askItem: (n) => `What are you billing ${n} for? Something like "2 reels 9k each" is enough.`,
    askItemCamp: (n) => `What are you billing ${n} for? Pick a Ybex deal and I'll fill it in, or type it.`,
    otherItem: 'Okay — type what you did, like "2 reels" or "1 YouTube video 15000".',
    askPrice: (q, d) => (q > 1 ? `How much for each ${d}?` : `How much are you charging for the ${d}?`), needAmt: "Just send the amount, like 9000 or 9k.",
    askTds: "Will they cut TDS? Most brands cut 1% (194C) for creators; small jobs often have none. Not sure? Pick “No TDS” — if they cut it, they'll send you Form 16A.",
    askDue: "When should they pay?", dueChips: [["In 7 days", 7], ["In 15 days", 15], ["In 30 days", 30], ["On receipt", 0]],
    askPay: "Where should they pay you? Send your UPI ID (like name@okhdfc), or bank account number + IFSC. I'll save it for next time.",
    payHelp: 'That doesn\'t look like a UPI ID or a bank account + IFSC. Try "name@okhdfc", or type "skip".',
    chPay: "Payment details updated.", chAddr: "Address updated.",
    viaYbex: "This deal is paid through Ybex's secure payment hold, so the invoice says “Paid through Ybex” — no second payment, no TDS line.",
    making: "Making your invoice…", saveFail: "I couldn't save the invoice — check your internet and say “try again”.",
    ready: (n, t) => `Here's your invoice for ${n}. Total ${t}.`, readyTds: (n, p, t) => `Here's your invoice for ${n}. ${p}% TDS is shown as cut, so you'll receive ${t}.`,
    hint: 'Need a change? Just say it — "due in 30 days", "no TDS", "10% discount", "add 1 story 3500", "change UPI" or "receipt style".',
    chDue: (n) => `Now due in ${n} days.`, chTdsOff: "TDS removed.", chTdsOn: (l) => `TDS ${l} added.`, chDisc: (s) => `${s} discount added.`, chAdd: (d) => `Added ${d}.`, chTpl: "Style changed.",
    updated: (s) => `Done. ${s}`, cancel: 'Okay, dropped it. Say "create invoice" whenever you need one.',
    who: (b) => (b ? "creators" : "brands"), dl: "Download", wa: "WhatsApp", view: "View",
    ph: { addr: "Address or city…", client: "Type a name…", gstin: "GSTIN, or skip", state: "State…", item: 'Like "2 reels 9k each"', price: "Like 9000", tds: "Pick one…", due: "Pick one…", pay: "UPI ID, or account + IFSC", done: "Ask for a change…", idle: "Say “create invoice”…" },
    dlDone: "Invoice downloaded", dlFail: "Couldn't make the file — try again", openHist: "Opening your invoices.",
    invTitle: "My invoices", toReceive: "To receive", unpaidN: (n) => `${n} invoice${n === 1 ? "" : "s"} pending`, received: "Received · 30 days",
    filters: { all: "All", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" }, st: { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue", cancelled: "Cancelled" }, newInv: "+ New", empty: "No invoices here yet.",
    markPaid: "Mark as paid", remind: "Remind on WhatsApp", paidDone: "Marked as paid", paidOn: (d) => `Paid on ${d}`, overdueBy: (n) => `Overdue by ${n} day${n === 1 ? "" : "s"}`,
    dueIn: (n) => (n <= 0 ? "Due today" : `Due in ${n} day${n === 1 ? "" : "s"}`), loading: "Getting your details…", loadFail: "Couldn't load your details. Check your internet.", retry: "Try again",
    notes: "Payment by the due date via UPI / bank transfer. Content use is limited to the agreed platforms and period. If TDS is deducted, please share Form 16A.",
    notesYbex: "Paid through Ybex's secure payment hold. Content use as per the Ybex agreement.", skip: "Skip", noTds: "No TDS / not sure",
  },
  hi: {
    intro: "Bilkul — invoice pe ye details aayengi:", fName: "Naam", fAddr: "Address", notAdded: "Abhi nahi daala", payLbl: "Payment",
    askAddr: "Invoice pe kaunsa address likhun? Sirf city bhi chalega. Agli baar ke liye save kar dungi.",
    askClient: (w) => `Invoice kiske liye hai? Naam likho, ya apne ${w} mein se chuno.`,
    otherLbl: "Koi aur", otherClient: "Theek hai — naam likho. Ybex pe na ho to bhi chalega.",
    askGstin: (n) => `${n} ka GSTIN hai? Bhej do (state usi se le lungi), ya skip karo.`,
    askState: (n) => `${n} kis state mein hai? Isi se CGST + SGST ya IGST tay hoga.`, sameState: (s) => `Mere wala (${s})`,
    badGstin: "Ye GSTIN sahi nahi lag raha — shayad ek akshar galat hai. Dobara bhejo, ya skip karo.",
    askItem: (n) => `${n} ko kis kaam ka bill karna hai? Bas "2 reels 9k each" jaisa likh do.`,
    askItemCamp: (n) => `${n} ko kis kaam ka bill karna hai? Ybex deal chuno to main bhar dungi, ya khud likho.`,
    otherItem: 'Theek hai — likho kya kiya, jaise "2 reels" ya "1 YouTube video 15000".',
    askPrice: (q, d) => (q > 1 ? `Har ${d} ka kitna?` : `${d} ka kitna charge kar rahe ho?`), needAmt: "Bas amount bhejo, jaise 9000 ya 9k.",
    askTds: "Kya wo TDS kaatenge? Zyada tar brands creators ka 1% (194C) kaatte hain; chhote kaam pe aksar nahi. Pata nahi? “No TDS” chuno — kaatenge to Form 16A denge.",
    askDue: "Payment kab tak chahiye?", dueChips: [["7 din", 7], ["15 din", 15], ["30 din", 30], ["Turant", 0]],
    askPay: "Paisa kahan aaye? UPI ID bhejo (jaise name@okhdfc), ya account number + IFSC. Agli baar ke liye save kar dungi.",
    payHelp: 'Ye UPI ID ya account + IFSC jaisa nahi lag raha. "name@okhdfc" jaisa bhejo, ya "skip" likho.',
    chPay: "Payment details badal diye.", chAddr: "Address badal diya.",
    viaYbex: "Is deal ka paisa Ybex ke secure payment hold mein hai, isliye invoice pe “Paid through Ybex” aayega — dobara payment nahi, TDS line nahi.",
    making: "Invoice bana rahi hoon…", saveFail: "Invoice save nahi ho payi — internet check karke “try again” bolo.",
    ready: (n, t) => `${n} ki invoice ready hai. Total ${t}.`, readyTds: (n, p, t) => `${n} ki invoice ready hai. ${p}% TDS kata dikhaya hai, to tumhe ${t} milenge.`,
    hint: 'Kuch badalna hai? Bas bolo — "30 din mein due", "no TDS", "10% discount", "add 1 story 3500", "UPI badlo" ya "receipt style".',
    chDue: (n) => `Ab ${n} din mein due.`, chTdsOff: "TDS hata diya.", chTdsOn: (l) => `TDS ${l} laga diya.`, chDisc: (s) => `${s} discount laga diya.`, chAdd: (d) => `${d} jod diya.`, chTpl: "Style badal diya.",
    updated: (s) => `Ho gaya. ${s}`, cancel: 'Theek hai, chhod diya. Jab chahiye "invoice banao" bolo.',
    who: (b) => (b ? "creators" : "brands"), dl: "Download", wa: "WhatsApp", view: "Dekho",
    ph: { addr: "Address ya city…", client: "Naam likho…", gstin: "GSTIN, ya skip", state: "State…", item: 'Jaise "2 reels 9k each"', price: "Jaise 9000", tds: "Ek chuno…", due: "Ek chuno…", pay: "UPI ID, ya account + IFSC", done: "Kuch badalna ho to bolo…", idle: "“Invoice banao” bolo…" },
    dlDone: "Invoice download ho gayi", dlFail: "File nahi ban payi — dobara try karo", openHist: "Tumhari invoices khol rahi hoon.",
    invTitle: "Meri invoices", toReceive: "Aana baaki", unpaidN: (n) => `${n} invoice pending`, received: "Mila · 30 din",
    filters: { all: "Sab", unpaid: "Baaki", overdue: "Overdue", paid: "Paid" }, st: { paid: "Paid", unpaid: "Baaki", overdue: "Overdue", cancelled: "Cancel" }, newInv: "+ Nayi", empty: "Abhi yahan koi invoice nahi.",
    markPaid: "Paid mark karo", remind: "WhatsApp pe yaad dilao", paidDone: "Paid mark ho gaya", paidOn: (d) => `${d} ko paid`, overdueBy: (n) => `${n} din se overdue`,
    dueIn: (n) => (n <= 0 ? "Aaj due" : `${n} din mein due`), loading: "Tumhari details la rahi hoon…", loadFail: "Details load nahi hui. Internet check karo.", retry: "Dobara try",
    notes: "Payment due date tak UPI / bank transfer se. Content sirf tay platforms aur samay tak use hoga. TDS kaata ho to Form 16A share karein.",
    notesYbex: "Payment Ybex ke secure payment hold se. Content use Ybex agreement ke hisaab se.", skip: "Skip", noTds: "No TDS / pata nahi",
  },
};

// ── the two invoice designs ────────────────────────────────────────────────────────────────────────────────────
const Row = ({ k, v, bold, style }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 600 : 400, ...style }}><span>{k}</span><span>{v}</span></div>;
function PayBox({ v, size = 72 }) {
  if (v.isPaid) return <div style={{ padding: "14px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#6B6F66" }}>PAYMENT</span><span style={{ fontSize: 12, fontWeight: 600, color: "#047857" }}>Received{v.paidOn ? ` · ${v.paidOn}` : ""}</span><span style={{ fontSize: 10, color: "#6B6F66" }}>Thank you!</span></div>;
  if (v.viaYbex) return <div style={{ padding: "14px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#6B6F66" }}>PAYMENT</span><span style={{ fontSize: 12, fontWeight: 600, color: "#047857" }}>Paid through Ybex</span><span style={{ fontSize: 10, color: "#6B6F66" }}>Secure payment hold</span></div>;
  return (
    <div style={{ padding: "14px 10px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
      <span style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#6B6F66" }}>{v.payQr ? "SCAN TO PAY" : "PAY TO"}</span>
      {v.payQr && <QRCodeCanvas value={v.payQr} size={size} level="M" includeMargin={false} />}
      <span style={{ fontSize: 11, overflowWrap: "anywhere" }}>{v.payLine}</span>
    </div>
  );
}
export function ProInvoice({ v }) {
  const grid = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 30px 64px 72px", gap: 6 };
  return (
    <div data-testid="invoice-pro" style={{ width: "100%", maxWidth: 440, margin: "0 auto", boxSizing: "border-box", background: "#FFFFFF", borderRadius: 6, padding: "26px 24px 18px", color: "#16201A", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 18px 30px -18px rgba(0,0,0,.3)", position: "relative" }}>
      {v.isPaid && <div style={{ position: "absolute", right: 22, top: 70, transform: "rotate(-12deg)", border: "3px double #047857", borderRadius: 6, padding: "2px 12px", fontSize: 20, fontWeight: 700, letterSpacing: ".1em", color: "#047857", opacity: 0.8 }}>PAID</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16.5, fontWeight: 600 }}>{v.fromName}</span>
          {v.fromAddr && <span style={{ color: "#6B6F66" }}>{v.fromAddr}</span>}
          {v.fromId && <span style={{ color: "#6B6F66" }}>{v.fromId}</span>}
          {v.fromEmail && <span style={{ color: "#6B6F66", overflowWrap: "anywhere" }}>{v.fromEmail}</span>}
        </div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}><span style={{ fontSize: 17, fontWeight: 300, letterSpacing: ".14em" }}>{v.docTitle}</span><span style={{ color: "#6B6F66" }}>{v.no}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, letterSpacing: ".1em", color: "#6B6F66" }}>BILL TO</span><span style={{ fontWeight: 600 }}>{v.toName}</span>
          {v.toSub && <span style={{ color: "#6B6F66" }}>{v.toSub}</span>}{v.toAddr && <span style={{ color: "#6B6F66" }}>{v.toAddr}</span>}
          {v.campaign && <span style={{ color: "#6B6F66" }}>Campaign · {v.campaign}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "1px 10px", justifyContent: "end", textAlign: "right", alignContent: "start" }}>
          <span style={{ color: "#6B6F66" }}>Date</span><span>{v.date}</span><span style={{ color: "#6B6F66" }}>Due</span><span>{v.due}</span>
          {v.pos && <><span style={{ color: "#6B6F66" }}>Supply</span><span>{v.pos}</span></>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ ...grid, padding: "8px 0", borderBottom: "1px solid #16201A", fontSize: 10, letterSpacing: ".08em", color: "#6B6F66" }}><span>ITEM{v.gstOn ? ` · SAC ${SAC}` : ""}</span><span style={{ textAlign: "center" }}>QTY</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>AMOUNT</span></div>
        {v.items.map((i) => <div key={i.n} style={{ ...grid, padding: "9px 0", borderBottom: "1px solid #ECEBE6" }}><span style={{ overflowWrap: "anywhere" }}>{i.d}</span><span style={{ textAlign: "center" }}>{i.q}</span><span style={{ textAlign: "right" }}>{i.rate}</span><span style={{ textAlign: "right" }}>{i.amt}</span></div>)}
      </div>
      <div style={{ alignSelf: "flex-end", width: "64%", display: "flex", flexDirection: "column", gap: 4, color: "#6B6F66" }}>
        <Row k="Subtotal" v={v.sub} />
        {v.hasDisc && <Row k={v.discLabel} v={v.disc} />}
        {v.hasCsgst && <><Row k="CGST 9%" v={v.half} /><Row k="SGST 9%" v={v.half} /></>}
        {v.hasIgst && <Row k="IGST 18%" v={v.gst} />}
        {(v.hasDisc || v.gstOn || v.hasTds) && <Row k="Total" v={v.total} style={{ color: "#16201A" }} />}
        {v.hasTds && <Row k={v.tdsLabel} v={v.tds} />}
        <Row k={v.isPaid ? "Amount paid" : v.viaYbex ? "Total" : "Amount due"} v={v.amountDue} bold style={{ fontSize: 14, color: "#16201A", paddingTop: 6, borderTop: "1px solid #16201A" }} />
        <span style={{ fontSize: 9.5, textAlign: "right" }}>{v.words}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", border: "1px solid #ECEBE6", borderRadius: 8 }}>
        <PayBox v={v} />
        <div style={{ padding: "14px 10px 12px", borderLeft: "1px solid #ECEBE6", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
          <span style={{ fontSize: 9.5, letterSpacing: ".12em", color: "#6B6F66" }}>{v.isCreator ? "MY WORK" : "WEBSITE"}</span>
          <QRCodeCanvas value={`https://${v.link}`} size={72} level="M" />
          <span style={{ fontSize: 10.5, overflowWrap: "anywhere" }}>{v.link.replace(/\?.*$/, "")}</span>
        </div>
      </div>
      {v.notes && <div style={{ fontSize: 9.5, lineHeight: 1.5, color: "#6B6F66" }}>{v.notes}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 9, color: "#8A8E86", borderTop: "1px solid #ECEBE6", paddingTop: 8 }}>
        <span>{v.gstNote || "Computer-generated invoice · no signature needed"}</span><span>Made free with Ybex Eva · ybexmedia.in</span>
      </div>
    </div>
  );
}
export function ReceiptInvoice({ v }) {
  const dash = { borderTop: "1.5px dashed rgba(28,26,23,.45)" };
  const teeth = (up) => <div style={{ display: "flex", height: 7, overflow: "hidden", justifyContent: "center" }}>{Array.from({ length: 34 }, (_, i) => <div key={i} style={{ flexShrink: 0, width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", [up ? "borderBottom" : "borderTop"]: "7px solid #F3EEE4" }} />)}</div>;
  const bars = []; const s = String(v.no || "YBEX");
  for (let i = 0; i < 44; i += 1) { const c = s.charCodeAt(i % s.length) + i * 7; bars.push([1 + (c % 3), "#1C1A17"], [1 + ((c >> 2) % 2), "transparent"]); }
  return (
    <div data-testid="invoice-receipt" style={{ position: "relative", width: "100%", maxWidth: 440, margin: "0 auto", fontFamily: "'IBM Plex Mono',ui-monospace,monospace", color: "#1C1A17", filter: "drop-shadow(0 14px 18px rgba(0,0,0,.18))" }}>
      {teeth(true)}
      <div style={{ position: "relative", background: "#F3EEE4", padding: "18px 22px 20px", display: "flex", flexDirection: "column", gap: 14, fontSize: 11, lineHeight: 1.5, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 34, lineHeight: 0.9, letterSpacing: -1, color: "#D42B2B" }}>{v.docTitle}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", paddingTop: 3 }}><span style={{ fontSize: 9, letterSpacing: ".14em", color: "#6B645A" }}>NO.</span><span style={{ fontSize: 11.5, fontWeight: 600 }}>{v.no}</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ fontFamily: "'Yellowtail',cursive", fontSize: 28, lineHeight: 1.1, color: "#D42B2B" }}>{v.fromName}</div>
          {v.handle && <div style={{ fontSize: 10.5, color: "#6B645A" }}>{v.handle}</div>}
          {v.fromAddr && <div style={{ fontSize: 10, color: "#4A443B", marginTop: 4 }}>{v.fromAddr}</div>}
          <div style={{ fontSize: 10, color: "#4A443B" }}>{[v.fromId, v.fromEmail].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={dash} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 10.5 }}>
          <span style={{ color: "#6B645A", letterSpacing: ".08em" }}>DATE</span><span style={{ color: "#6B645A", letterSpacing: ".08em", textAlign: "right" }}>DUE</span>
          <span style={{ fontWeight: 600 }}>{v.date}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v.due}</span>
        </div>
        <div style={dash} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 9.5, letterSpacing: ".14em", color: "#6B645A" }}>BILL TO</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: "uppercase" }}>{v.toName}</span>
          {v.toSub && <span style={{ fontSize: 10, color: "#4A443B" }}>{v.toSub}</span>}
          {v.pos && <span style={{ fontSize: 10, color: "#4A443B" }}>Place of supply: {v.pos}</span>}
          {v.campaign && <span style={{ fontSize: 10, color: "#4A443B", marginTop: 3 }}>Campaign · <span style={{ color: "#D42B2B" }}>{v.campaign}</span></span>}
        </div>
        <div style={{ ...dash, display: "flex", flexDirection: "column", gap: 9, paddingTop: 12 }}>
          {v.items.map((i) => (
            <div key={i.n} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 11.5, fontWeight: 500, textTransform: "uppercase" }}>{i.d}</span><span style={{ flex: 1, minWidth: 12, borderBottom: "1.5px dotted rgba(28,26,23,.45)", transform: "translateY(-3px)" }} /><span style={{ fontSize: 11.5, fontWeight: 600 }}>{i.amt}</span></div>
              <span style={{ fontSize: 10, color: "#6B645A" }}>{i.q} × {i.rate}</span>
            </div>
          ))}
        </div>
        <div style={{ ...dash, display: "flex", flexDirection: "column", gap: 3, paddingTop: 10 }}>
          <Row k="SUBTOTAL" v={v.sub} />
          {v.hasDisc && <Row k={v.discLabel.toUpperCase()} v={v.disc} />}
          {v.hasCsgst && <><Row k="CGST 9%" v={v.half} /><Row k="SGST 9%" v={v.half} /></>}
          {v.hasIgst && <Row k="IGST 18%" v={v.gst} />}
          <Row k="TOTAL" v={v.total} bold />
          {v.hasTds && <Row k={v.tdsLabel.toUpperCase()} v={v.tds} style={{ color: "#4A443B" }} />}
        </div>
        <div style={{ ...dash, position: "relative", display: "flex", flexDirection: "column", gap: 2, padding: "12px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em" }}>{v.isPaid ? "AMOUNT PAID" : v.viaYbex ? "TOTAL" : "AMOUNT DUE"}</span><span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, color: "#D42B2B" }}>{v.amountDue}</span></div>
          <span style={{ fontSize: 9.5, color: "#6B645A" }}>{v.words}</span>
          {v.isPaid && <div style={{ position: "absolute", right: 6, top: -26, transform: "rotate(-12deg)", border: "3px double #D42B2B", borderRadius: 6, padding: "2px 12px", fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: ".08em", color: "#D42B2B", opacity: 0.82 }}>PAID</div>}
        </div>
        <div style={{ border: "1.5px solid #1C1A17", borderRadius: 4, background: "#FFFDF8" }}><PayBox v={v} size={76} /></div>
        {v.notes && <div style={{ fontSize: 9.5, lineHeight: 1.5, color: "#4A443B" }}>{v.notes}</div>}
        <div style={{ ...dash, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 12 }}>
          <div style={{ display: "flex", height: 40, alignItems: "stretch" }}>{bars.map(([w, c], i) => <div key={i} style={{ width: w, background: c }} />)}</div>
          <span style={{ fontSize: 9.5, letterSpacing: ".3em" }}>{v.no}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <QRCodeCanvas value={`https://${v.link}`} size={58} level="M" bgColor="#F3EEE4" />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><span style={{ fontFamily: "'Yellowtail',cursive", fontSize: 24, color: "#D42B2B" }}>Thank you!</span><span style={{ fontSize: 9.5, color: "#4A443B" }}>{v.isCreator ? "Scan for my work & rate card" : "Scan to visit us"}</span><span style={{ fontSize: 10.5, fontWeight: 600 }}>{v.link.replace(/\?.*$/, "")}</span></div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 8.5, letterSpacing: ".06em", color: "#8A8276" }}><span>{v.gstOn ? `SAC ${SAC} · ` : ""}COMPUTER-GENERATED</span><span>Made with Ybex Eva</span></div>
      </div>
      {teeth(false)}
    </div>
  );
}
export const InvoiceView = ({ v, tpl }) => (tpl === "receipt" ? <ReceiptInvoice v={v} /> : <ProInvoice v={v} />);

/** A saved record + her details → everything the designs print. */
export function invData(rec, me, role, today = todayIso()) {
  const from = rec.from || me || {};
  const c = calc({ ...rec, gstOn: rec.gstOn ?? me?.gstOn }, from.state || me?.state || "");
  const st = statusOf(rec, today);
  const pay = rec.viaYbex ? null : from.pay || me?.pay || null;
  const upi = pay && pay.label === "UPI" ? pay.v : "";
  const link = `${from.link || me?.link || "ybexmedia.in"}${(from.link || me?.link || "").includes("?") ? "&" : "?"}ref=invoice`;
  return {
    no: rec.no || "DRAFT", date: fmtDate(rec.date), due: fmtDate(rec.due), docTitle: c.gstOn ? "TAX INVOICE" : "INVOICE", isCreator: role !== "brand",
    fromName: from.name || me?.name || "", fromAddr: from.address || me?.address || "", fromEmail: from.email || me?.email || "", handle: from.handle || me?.handle || "",
    fromId: from.id ? `${from.idLabel || "PAN"} ${from.id}` : "", link,
    toName: rec.billTo?.name || "", toSub: [rec.billTo?.gstin ? `GSTIN ${rec.billTo.gstin}` : "", rec.billTo?.sub && !String(rec.billTo.sub).includes(rec.billTo?.gstin || "~") ? rec.billTo.sub : ""].filter(Boolean).join(" · ") || rec.billTo?.sub || "", toAddr: rec.billTo?.address || "",
    campaign: rec.campaign?.name || "", viaYbex: Boolean(rec.viaYbex), gstOn: c.gstOn,
    pos: c.gstOn && rec.billTo?.st ? `${GST_STATES[rec.billTo.st] || "State"} (${rec.billTo.st})` : "",
    items: c.items.filter((i) => i.d && i.amount > 0).map((i, n) => ({ n: n + 1, d: i.d, q: i.q, rate: inr(i.r), amt: inr(i.amount) })),
    sub: inr(c.sub), hasDisc: c.disc > 0, disc: "−" + inr(c.disc), discLabel: rec.disc?.mode === "pct" ? `Discount (${Number(rec.disc.val)}%)` : "Discount",
    hasCsgst: c.gstOn && !c.inter, hasIgst: c.gstOn && c.inter, half: inr(c.half), gst: inr(c.igst), total: inr(c.total),
    hasTds: c.tds > 0, tdsLabel: `Less TDS u/s ${c.tdsInfo.sec} (${Math.round(c.tdsInfo.rate * 100)}%)`, tds: "−" + inr(c.tds), amountDue: inr(c.net), net: c.net,
    words: words(c.net), gstNote: c.gstOn ? "" : "GST not charged · supplier not registered under GST",
    notes: rec.notes || "", payLine: pay ? `${pay.label} · ${pay.v}` : "Ask for payment details", payQr: upi ? upiUri(upi, from.name || me?.name, c.net, rec.no) : "",
    isPaid: st === "paid", paidOn: rec.paidOn ? fmtDate(rec.paidOn) : "", status: st, stLabel: st, ...ST_CARD[st],
  };
}

// ── the chat ─────────────────────────────────────────────────────────────────────────────────────────────────
class EvaInvoiceChat extends React.Component {
  listRef = React.createRef();
  exportRef = React.createRef();
  timers = [];
  state = { boot: null, loadErr: false, msgs: [], input: "", typing: false, lang: "en", f: null, curId: null, view: null, filter: "all", viewer: null, sheet: null, exportId: null, toast: "", busy: false };

  componentDidMount() {
    const s = readEvaSettings();
    const lang = s.lang === "hi" || s.lang === "hinglish" || isHi(this.props.text || "") ? "hi" : "en";
    this.setState({ lang }, () => this.load(() => { if (this.props.view === "list") this.setState({ view: "list" }); else this.startInvoice(this.props.text || ""); }));
    if (!document.getElementById("yb-receipt-fonts")) { const l = document.createElement("link"); l.id = "yb-receipt-fonts"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Archivo+Black&family=Yellowtail&display=swap"; document.head.appendChild(l); }
  }
  componentWillUnmount() { this.timers.forEach(clearTimeout); }
  componentDidUpdate(pp, ps) { if (ps.msgs.length !== this.state.msgs.length || ps.typing !== this.state.typing) { const el = this.listRef.current; if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 30); } }
  t() { return T[this.state.lang]; }
  role() { return this.state.boot?.role || this.props.role || "creator"; }
  me() { return this.state.boot?.me || {}; }
  later(fn, ms) { const id = setTimeout(fn, ms); this.timers.push(id); }
  push(...m) { this.setState((s) => ({ msgs: [...s.msgs, ...m.map((x, i) => ({ id: `${Date.now()}_${Math.random()}_${i}`, ...x }))] })); }
  eva(list, ms = 600, after) { this.setState({ typing: true }); this.later(() => { this.setState({ typing: false }); this.push(...list); after && after(); }, ms); }
  flash(msg) { this.setState({ toast: msg }); clearTimeout(this._t); this._t = setTimeout(() => this.setState({ toast: "" }), 2000); }
  setF(patch, cb) { this.setState((s) => ({ f: { ...s.f, ...patch } }), cb); }
  invoices() { return this.state.boot?.invoices || []; }
  today() { return this.state.boot?.today || todayIso(); }

  async load(after) {
    this.setState({ loadErr: false });
    try {
      const { data } = await api.get("invoices/bootstrap", { timeout: 20000, bypassCache: true });
      if (!data?.ok) throw new Error("bad");
      this.setState({ boot: data }, after);
    } catch { this.setState({ loadErr: true }); }
  }
  async saveProfile(patch) {
    try { const { data } = await api.put("invoices/profile", patch, { timeout: 15000 }); if (data?.ok) this.setState((s) => ({ boot: { ...s.boot, me: data.me } })); return Boolean(data?.ok); } catch { return false; }
  }

  send(text, shown) {
    const t = String(text || "").trim(); if (!t || this.state.typing || this.state.busy || !this.state.boot) return;
    const inFlow = this.state.f && this.state.f.step && this.state.f.step !== "done"; // answers mid-flow (an address, a name) don't switch language
    const lang = inFlow ? (isHi(t) ? "hi" : this.state.lang) : isHi(t) ? "hi" : /[a-z]/i.test(t) && t.split(/\s+/).length > 2 ? "en" : this.state.lang;
    this.setState({ input: "", lang }, () => {
      this.push({ kind: "user", text: shown || t });
      // v431 (Ravi: "real AI jaisa kaam kare"): mid-invoice, the AI reads what the person meant first; the old rules
      // below are the fallback when the AI is off / slow / unsure.
      if (this.state.f && this.state.f.step !== "saving" && !this.noAi) return this.understand(t, () => this.rules(t));
      this.rules(t);
    });
  }
  rules(t) {
    {
      const f = this.state.f;
      if (f && f.step !== "done" && /^(cancel|stop|rehne do|chhodo|chodo|band karo)\b/i.test(t)) { this.setState({ f: null }); return this.eva([{ kind: "eva", text: this.t().cancel }], 400); }
      if (/^(try again|retry|dobara)\b/i.test(t) && f?.step === "saving") return this.generate();
      if (f && f.step && f.step !== "done" && f.step !== "saving") return this.answer(t);
      if (/my invoices|invoice history|all invoices|meri invoices/i.test(t)) return this.eva([{ kind: "eva", text: this.t().openHist }], 400, () => this.setState({ view: "list" }));
      if (f && f.step === "done" && this.editDone(t)) return;
      if (/invoice|bill/i.test(t)) return this.startInvoice(t);
      this.eva([{ kind: "eva", text: this.state.lang === "hi" ? "Ye invoice ka screen hai — “invoice banao” bolo, ya upar ← se Eva pe wapas jao." : "This is the invoice screen — say “create invoice”, or tap ← to go back to Eva." }], 400);
    }
  }
  // v431: ask the server's AI what this message means for the invoice being made → apply it, or fall back to the rules.
  async understand(t, fallback) {
    const f = this.state.f || {}, me = this.me();
    const context = JSON.stringify({
      asked: f.step === "done" ? "invoice is made — the user may ask for changes" : (f.step || "start"),
      role: this.role(), client: f.client?.name || "", items: (f.items || []).map((i) => ({ d: i.d, q: i.q, r: i.r || 0 })),
      due_days: f.due ?? null, tds: f.tds ?? null, has_payment_details: Boolean(me.pay), has_address: Boolean(me.address),
      known_clients: (this.state.boot?.clients || []).slice(0, 15).map((c) => c.name),
    });
    const history = this.state.msgs.filter((m) => m.kind === "eva" || m.kind === "user").slice(-7, -1).map((m) => ({ user: m.kind === "user", text: String(m.text || "") }));
    this.setState({ typing: true });
    let d = null;
    try {
      const { data } = await api.post("assist/ai", { task: "invoice", text: t, context, history, lang: this.state.lang === "hi" ? "hinglish" : "en" }, { timeout: 11000 });
      d = data?.ok ? data.data : null;
    } catch { d = null; }
    this.setState({ typing: false });
    if (!d || !this.applyAi(d, t)) fallback();
  }
  /** true when the AI answer was used. */
  applyAi(d, t) {
    const tt = this.t(), f = { ...this.state.f }, done = f.step === "done" && this.state.curId;
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const isJunk = (x) => !x || /^(yes|yeah|ok|okay|haan|ha|han|no|nahi|sure|hmm+)$/i.test(String(x).trim());
    const cleanItems = (list) => (Array.isArray(list) ? list : []).map((i) => ({ d: String(i?.d || "").trim().slice(0, 80), q: Math.max(1, Math.min(999, Math.round(num(i?.q) || 1))), r: Math.round(num(i?.r)) || "" })).filter((i) => i.d && !isJunk(i.d));
    const action = String(d.action || "update");
    if (action === "cancel") { this.setState({ f: null }); this.eva([{ kind: "eva", text: tt.cancel }], 300); return true; }
    if (action === "download" && done) { this.setState({ sheet: this.state.curId }); return true; }
    if (action === "share" && done) { const cur = this.invoices().find((h) => h.id === this.state.curId); if (cur) { this.share(cur); return true; } }
    if (action === "history") { this.eva([{ kind: "eva", text: tt.openHist }], 300, () => this.setState({ view: "list" })); return true; }
    const changes = [], profile = {};
    if (d.client && d.client.name && !isJunk(d.client.name)) {
      const known = (this.state.boot?.clients || []).find((c) => c.name.toLowerCase() === String(d.client.name).toLowerCase());
      f.client = known || { ...(f.client || {}), name: tidyName(d.client.name) || String(d.client.name).slice(0, 80), ...(d.client.gstin && gstinOk(String(d.client.gstin).toUpperCase()) ? { gstin: String(d.client.gstin).toUpperCase(), st: String(d.client.gstin).slice(0, 2) } : {}) };
      changes.push(this.state.lang === "hi" ? `Client: ${f.client.name}.` : `Client: ${f.client.name}.`);
    }
    const items = cleanItems(d.items);
    if (items.length) { f.items = items; changes.push(this.state.lang === "hi" ? `Items: ${items.map((i) => `${i.q} × ${i.d}`).join(", ")}.` : `Items: ${items.map((i) => `${i.q} × ${i.d}`).join(", ")}.`); }
    const adds = cleanItems(d.add_items);
    if (adds.length) { f.items = [...(f.items || []), ...adds]; changes.push(tt.chAdd(adds.map((i) => `${i.q} × ${i.d.toLowerCase()}`).join(", "))); }
    if (!items.length && num(d.item_price) && (f.items || []).some((i) => !i.r)) {
      const i = f.items.findIndex((x) => !x.r); f.items = f.items.map((x, j) => (j === i ? { ...x, r: Math.round(num(d.item_price)) } : x));
    }
    if (d.due_days !== null && d.due_days !== undefined && d.due_days !== "" && Number.isFinite(Number(d.due_days)) && (f.step === "due" || /\d|receipt|turant|abhi|today|aaj/i.test(t))) { f.due = Math.max(0, Math.min(120, Math.round(Number(d.due_days)))); if (done) changes.push(tt.chDue(f.due)); }
    if (d.tds && !f.viaYbex && TDS[d.tds] !== undefined) { f.tds = d.tds; if (done) changes.push(d.tds === "none" ? tt.chTdsOff : tt.chTdsOn(TDS[d.tds].label)); }
    else if (d.tds === "none" && !f.viaYbex) { f.tds = "none"; if (done) changes.push(tt.chTdsOff); }
    if (d.discount && num(d.discount.val)) { f.disc = { mode: d.discount.mode === "pct" ? "pct" : "flat", val: num(d.discount.val) }; changes.push(tt.chDisc(f.disc.mode === "pct" ? `${f.disc.val}%` : inr(f.disc.val))); }
    if (d.template === "receipt" || d.template === "pro") { if (f.tpl !== d.template) { f.tpl = d.template; changes.push(tt.chTpl); } }
    const upi = upiIn(d.upi || "") || upiIn(t), bank = d.bank_account && d.ifsc ? { acc: String(d.bank_account).replace(/\D/g, ""), ifsc: String(d.ifsc).toUpperCase() } : bankIn(t);
    if (upi || (bank && bank.acc && bank.ifsc)) { profile.pay = { v: upi || `${bank.acc} ${bank.ifsc}` }; f.askedPay = true; changes.push(tt.chPay); }
    if (d.address && String(d.address).trim().length >= 2 && (f.step === "addr" || /address|pata|city|shehar/i.test(t))) { profile.address = String(d.address).slice(0, 200); f.askedAddr = true; changes.push(tt.chAddr); }
    if (d.skip && (f.step === "addr" || f.step === "pay" || f.step === "gstin")) {
      if (f.step === "addr") f.askedAddr = true; if (f.step === "pay") f.askedPay = true; if (f.step === "gstin") f.client = { ...f.client, gstin: "" };
      changes.push("skip");
    }
    const changed = changes.length > 0 || items.length > 0 || JSON.stringify(f.items) !== JSON.stringify(this.state.f.items) || f.due !== this.state.f.due || f.tds !== this.state.f.tds;
    if (!changed) {
      if (d.wants_change === "upi" || d.wants_change === "address") {
        this.setState({ f: { ...f, step: d.wants_change === "upi" ? "pay" : "addr", editing: Boolean(done) } }, () => this.eva([{ kind: "eva", text: d.wants_change === "upi" ? tt.askPay : tt.askAddr }], 300));
        return true;
      }
      if (action === "answer" && d.reply) {
        const reply = String(d.reply).slice(0, 300);
        if (done) { this.eva([{ kind: "eva", text: reply }], 300); return true; }
        this.setState({ f: { ...f } }, () => this.next([{ kind: "eva", text: reply }]));
        return true;
      }
      return false; // nothing understood → the old rules try
    }
    const note = changes.filter((c) => c && c !== "skip").join(" ") || (this.state.lang === "hi" ? "Badal diya." : "Updated.");
    (Object.keys(profile).length ? this.saveProfile(profile) : Promise.resolve(true)).then(() => {
      if (done) return this.setState({ f: { ...f, step: (f.items || []).some((i) => !i.r) ? null : "done", editing: false } }, () => ((f.items || []).some((i) => !i.r) ? this.next() : this.generate([], note)));
      this.setState({ f: { ...f, editing: false } }, () => this.next());
    });
    return true;
  }
  parseClient(t) {
    const low = t.toLowerCase();
    const list = this.state.boot?.clients || [];
    let client = list.find((c) => low.includes(c.name.toLowerCase()) || (c.name.split(" ")[0].length > 3 && new RegExp(`\\b${c.name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}\\b`).test(low))) || null;
    if (!client) {
      const m = t.match(/\b(?:for|to)\s+((?:[A-Z][\w&.'-]*\s?){1,4})/) || t.match(/((?:[A-Z][\w&.'-]*\s?){1,4})\s+(?:ke|ko)\s+(?:liye|bill)/);
      if (m && !parseItems(m[1]).length && !/^(Instagram|Invoice|Me|My)\b/.test(m[1])) client = { name: m[1].trim() };
    }
    const g = gstinIn(t);
    if (client && g && gstinOk(g)) client = { ...client, gstin: g, st: g.slice(0, 2) };
    return client;
  }
  startInvoice(t) {
    const tt = this.t(), me = this.me();
    const client = this.parseClient(t || "");
    const items = parseItems(t || ""); const amount = parseAmount(t || "");
    if (items.length === 1 && !items[0].r && amount) items[0].r = /each|per|ek ka|har/i.test(t) || items[0].q === 1 ? amount : Math.round(amount / items[0].q);
    const dm = String(t || "").match(/(\d+)\s*(din|days?)/i);
    const intro = [{ kind: "eva", text: tt.intro }, { kind: "from" }];
    this.setState({ curId: null, f: { step: null, client, items, campaign: null, viaYbex: false, due: dm ? Number(dm[1]) : null, tds: this.role() === "creator" ? null : "none", disc: null, tpl: "pro", askedAddr: Boolean(me.address), askedPay: false } }, () => this.next(intro));
  }
  next(prefix = []) {
    const f = this.state.f, tt = this.t(), me = this.me(), list = this.state.boot?.clients || [];
    const ask = (step, text, chips) => { this.setF({ step }); this.eva([...prefix, { kind: "eva", text }, ...(chips && chips.length ? [{ kind: "chips", chips }] : [])], prefix.length > 1 ? 900 : 550); };
    if (!f.askedAddr && !me.address) return ask("addr", tt.askAddr, [{ label: tt.skip, say: "skip" }]);
    if (!f.client) return ask("client", tt.askClient(tt.who(this.role() === "brand")), [...list.slice(0, 5).map((c) => ({ label: c.name, say: c.name, isNew: c.onYbex })), { label: tt.otherLbl, other: "client" }]);
    if (me.gstOn && !f.client.onYbex && f.client.gstin === undefined) return ask("gstin", tt.askGstin(f.client.name), [{ label: tt.skip, say: "skip" }]);
    if (me.gstOn && !f.client.st) return ask("state", tt.askState(f.client.name), [...(me.state ? [{ label: tt.sameState(GST_STATES[me.state]), say: GST_STATES[me.state] }] : []), ...["Delhi", "Maharashtra", "Karnataka"].filter((s) => s !== GST_STATES[me.state]).map((s) => ({ label: s, say: s }))]);
    if (!f.items.length) {
      const camps = (list.find((c) => c.name === f.client.name) || {}).camps || [];
      return ask("item", camps.length ? tt.askItemCamp(f.client.name) : tt.askItem(f.client.name), camps.length ? [...camps.map((k) => ({ label: k.name, campId: k.id })), { label: tt.otherLbl, other: "item" }] : (this.role() === "brand" ? ["Product sampling kit", "Gift hamper", "Shipping"] : ["1 reel", "2 reels", "1 story", "UGC video"]).map((q) => ({ label: q, say: q })));
    }
    const miss = f.items.find((i) => !i.r);
    if (miss) return ask("price", tt.askPrice(miss.q, miss.d.toLowerCase()));
    if (!f.viaYbex && f.tds == null) return ask("tds", tt.askTds, [{ label: tt.noTds, say: "no tds", tds: "none" }, { label: "194C · 1%", say: "194C 1%", tds: "194C1" }, { label: "194C · 2%", say: "194C 2%", tds: "194C2" }, { label: "194J · 10%", say: "194J 10%", tds: "194J" }]);
    if (f.due == null && f.viaYbex) { f.due = 0; this.state.f.due = 0; } // a Ybex deal is already paid into the hold — no "when should they pay?"
    if (f.due == null) return ask("due", tt.askDue, tt.dueChips.map(([l, n]) => ({ label: l, say: l, due: n })));
    if (!f.viaYbex && !me.pay && !f.askedPay) return ask("pay", tt.askPay, [{ label: tt.skip, say: "skip" }]);
    this.generate(prefix);
  }
  async answer(t) {
    const f = this.state.f, tt = this.t(), me = this.me(), skip = /^(skip|no|nahi|nahin|na|baad mein|later|pata nahi)\b/i.test(t.trim());
    if (f.step === "addr") {
      if (!skip) await this.saveProfile({ address: t.slice(0, 200) });
      if (f.editing && this.state.curId) return this.setF({ askedAddr: true, editing: false, step: "done" }, () => this.generate([], tt.chAddr || "Address updated."));
      return this.setF({ askedAddr: true }, () => this.next());
    }
    if (f.step === "client") {
      if (skip || tidyName(t).length < 2) return this.eva([{ kind: "eva", text: tt.askClient(tt.who(this.role() === "brand")) }], 400); // a name is needed — "skip" isn't a client
      const client = this.parseClient(t) || (this.state.boot?.clients || []).find((c) => c.name.toLowerCase() === t.toLowerCase()) || { name: tidyName(t) || t.slice(0, 80) };
      const items = parseItems(t);
      return this.setF({ client, items: items.length ? items : f.items }, () => this.next());
    }
    if (f.step === "gstin") {
      if (skip) return this.setF({ client: { ...f.client, gstin: "" } }, () => this.next());
      const g = gstinIn(t);
      if (!g || !gstinOk(g)) return this.eva([{ kind: "eva", text: tt.badGstin }, { kind: "chips", chips: [{ label: tt.skip, say: "skip" }] }], 400);
      return this.setF({ client: { ...f.client, gstin: g, st: g.slice(0, 2) } }, () => this.next());
    }
    if (f.step === "state") {
      const st = stateCodeIn(t);
      if (!st) return this.eva([{ kind: "eva", text: tt.askState(f.client.name) }], 400);
      return this.setF({ client: { ...f.client, st } }, () => this.next());
    }
    if (f.step === "item") {
      // v431 (Ravi's screenshot): "yes" became the item ("How much for the yes?") — a yes / no / ok isn't a service
      if (/^(yes|yeah|yep|ok|okay|haan|ha|han|hmm+|no|nahi|sure|done|theek|thik)\.?!?$/i.test(t.trim())) return this.eva([{ kind: "eva", text: tt.otherItem }], 400);
      const items = parseItems(t); const amt = parseAmount(t);
      if (items.length === 1 && !items[0].r && amt) items[0].r = items[0].q === 1 || /each|per|har/i.test(t) ? amt : Math.round(amt / items[0].q);
      return this.setF({ items: items.length ? items : [{ d: tidyName(t) || t.slice(0, 80), q: 1, r: amt || "" }] }, () => this.next());
    }
    if (f.step === "price") {
      const a = parseAmount(t); if (!a) return this.eva([{ kind: "eva", text: tt.needAmt }], 400);
      const i = f.items.findIndex((x) => !x.r), it = f.items[i];
      // v431: "2 reels 4500 each" here is the full line, not just a price — it was saved as 1 × "yes" = ₹4,500 (should be ₹9,000)
      const its = parseItems(t);
      if (its.length) {
        if (its.length === 1 && !its[0].r) its[0].r = its[0].q === 1 || /each|per|har|ek ka/i.test(t) ? a : (/total|sab|kul|milake/i.test(t) ? Math.round(a / its[0].q) : a);
        if (its.every((x) => x.r)) return this.setF({ items: [...f.items.slice(0, i), ...its, ...f.items.slice(i + 1)] }, () => this.next());
      }
      const r = it.q > 1 && /total|sab|overall|kul|milake/i.test(t) ? Math.round(a / it.q) : a;
      return this.setF({ items: f.items.map((x, j) => (j === i ? { ...x, r } : x)) }, () => this.next());
    }
    if (f.step === "tds") {
      const k = /194j|10\s*%/i.test(t) ? "194J" : /2\s*%/.test(t) ? "194C2" : /194c|1\s*%/i.test(t) ? "194C1" : "none";
      return this.setF({ tds: k }, () => this.next());
    }
    if (f.step === "due") {
      const n = /turant|receipt|abhi|today|aaj|immediate/i.test(t) ? 0 : Number((t.match(/\d+/) || [15])[0]);
      return this.setF({ due: Math.max(0, Math.min(120, n)) }, () => this.next());
    }
    if (f.step === "pay") {
      if (skip) return this.setF({ askedPay: true }, () => this.next());
      const upi = upiIn(t), bank = bankIn(t);
      if (!upi && !bank) return this.eva([{ kind: "eva", text: tt.payHelp }, { kind: "chips", chips: [{ label: tt.skip, say: "skip" }] }], 400);
      await this.saveProfile({ pay: { v: upi || `${bank.acc} ${bank.ifsc}` } });
      if (f.editing && this.state.curId) return this.setF({ askedPay: true, editing: false, step: "done" }, () => this.generate([], tt.chPay || "Payment details updated."));
      return this.setF({ askedPay: true }, () => this.next());
    }
  }
  pickChip(c) {
    const f = this.state.f; if (this.state.typing || this.state.busy) return;
    if (c.other) { if (!f) return; this.push({ kind: "user", text: c.label }); return this.eva([{ kind: "eva", text: c.other === "client" ? this.t().otherClient : this.t().otherItem }], 400); }
    if (c.campId) {
      if (!f || f.step !== "item") return;
      const camp = ((this.state.boot?.clients || []).find((x) => x.name === f.client.name) || {}).camps?.find((k) => k.id === c.campId);
      if (!camp) return;
      this.push({ kind: "user", text: camp.name });
      return this.setF({ campaign: { name: camp.name, id: camp.id }, viaYbex: Boolean(camp.viaYbex), items: camp.items.map((i) => ({ ...i })), tds: camp.viaYbex ? "none" : f.tds }, () => this.next(camp.viaYbex ? [{ kind: "eva", text: this.t().viaYbex }] : []));
    }
    if (c.tds && f?.step === "tds") { this.push({ kind: "user", text: c.label }); return this.setF({ tds: c.tds }, () => this.next()); }
    if (c.due != null && f?.step === "due") { this.push({ kind: "user", text: c.label }); return this.setF({ due: c.due }, () => this.next()); }
    this.send(c.say, c.label);
  }
  body(f = this.state.f) {
    const client = f.client || {};
    return { billTo: { name: client.name, sub: client.sub || "", gstin: client.gstin || "", st: client.st || "", address: client.address || "", userId: client.userId || null }, campaign: f.campaign, viaYbex: f.viaYbex,
      items: f.items.map((i) => ({ d: i.d, q: i.q, r: i.r })), disc: f.disc || { mode: "flat", val: 0 }, tds: f.viaYbex ? "none" : f.tds || "none", dueDays: f.due ?? 15, date: this.today(), notes: f.viaYbex ? T.en.notesYbex : T.en.notes /* the invoice itself is always in English */, tpl: f.tpl || "pro" };
  }
  async generate(prefix = [], note) {
    const tt = this.t(), S = this.state, first = !S.curId;
    this.setF({ step: "saving" }); this.setState({ busy: true, typing: true });
    let inv = null;
    try {
      const { data } = first ? await api.post("invoices", this.body(), { timeout: 20000 }) : await api.patch(`invoices/${encodeURIComponent(S.curId)}`, this.body(), { timeout: 20000 });
      inv = data?.ok ? data.invoice : null;
    } catch { inv = null; }
    this.setState({ busy: false, typing: false });
    if (!inv) return this.push(...prefix, { kind: "eva", text: tt.saveFail }, { kind: "chips", chips: [{ label: "Try again", say: "try again" }] });
    this.setState((s) => ({ f: { ...s.f, step: "done" }, curId: inv.id, boot: { ...s.boot, invoices: [inv, ...(s.boot.invoices || []).filter((x) => x.id !== inv.id)] } }));
    const v = invData(inv, this.me(), this.role(), this.today());
    const head = note ? tt.updated(note) : v.hasTds ? tt.readyTds(inv.billTo.name, Math.round((TDS[inv.tds]?.rate || 0) * 100), v.amountDue) : tt.ready(inv.billTo.name, v.total);
    this.push(...prefix, { kind: "eva", text: head }, { kind: "invoice", id: inv.id }, ...(first ? [{ kind: "eva", text: tt.hint }] : []));
  }
  editDone(t) {
    const f = { ...this.state.f }, tt = this.t(), ch = [];
    const cur = this.invoices().find((h) => h.id === this.state.curId);
    if (/download|pdf|jpg/i.test(t)) { this.setState({ sheet: this.state.curId }); return true; }
    // v431 (Ravi: "i want to change my upi id" → "This is the invoice screen…"): payment details / address can be changed here
    {
      const upi = upiIn(t), bank = bankIn(t);
      if (upi || bank) {
        this.saveProfile({ pay: { v: upi || `${bank.acc} ${bank.ifsc}` } }).then(() => this.generate([], tt.chPay || "Payment details updated."));
        return true;
      }
      if (/\b(upi|bank|account|ifsc|payment details?|pay(ment)? (to|id)|khata)\b/i.test(t)) {
        this.setState({ f: { ...this.state.f, step: "pay", editing: true } }, () => this.eva([{ kind: "eva", text: tt.askPay }, { kind: "chips", chips: [{ label: tt.skip, say: "skip" }] }], 400));
        return true;
      }
      if (/\b(address|pata|city)\b/i.test(t)) {
        this.setState({ f: { ...this.state.f, step: "addr", editing: true } }, () => this.eva([{ kind: "eva", text: tt.askAddr }], 400));
        return true;
      }
    }
    if (/share|whatsapp|bhej/i.test(t) && cur) { this.share(cur); return true; }
    if (/receipt/i.test(t)) { f.tpl = "receipt"; ch.push(tt.chTpl); } else if (/professional|simple|normal|basic/i.test(t)) { f.tpl = "pro"; ch.push(tt.chTpl); }
    const dm = t.match(/(\d+)\s*(din|days?)/i); if (dm) { f.due = Number(dm[1]); ch.push(tt.chDue(f.due)); }
    if (!f.viaYbex) {
      if (/(no|without|remove|hata\w*)\s*tds|tds\s*(nahi|hata\w*|mat|remove|off)/i.test(t)) { f.tds = "none"; ch.push(tt.chTdsOff); }
      else if (/tds/i.test(t)) { const k = /194j|10\s*%/i.test(t) ? "194J" : /2\s*%/.test(t) ? "194C2" : "194C1"; f.tds = k; ch.push(tt.chTdsOn(TDS[k].label)); }
    }
    if (/discount|\boff\b|chhoot/i.test(t)) { const m = t.match(/(\d[\d,.]*)\s*(%|percent|k\b)?/i); if (m) { const pct = /%|percent/i.test(m[2] || ""); const v = pct ? parseFloat(m[1]) : parseAmount(m[0]) || parseFloat(m[1]); f.disc = { mode: pct ? "pct" : "flat", val: v }; ch.push(tt.chDisc(pct ? `${v}%` : inr(v))); } }
    if (/\b(add|aur|plus|jodo|also|bhi)\b/i.test(t) && !/tds|discount/i.test(t)) { const its = parseItems(t); if (its.length) { f.items = [...f.items, ...its]; ch.push(tt.chAdd(its.map((i) => `${i.q} × ${i.d.toLowerCase()}`).join(", "))); } }
    if (!ch.length) return false;
    this.setState({ f: { ...f, step: f.items.some((i) => !i.r) ? null : "done" } }, () => (f.items.some((i) => !i.r) ? this.next([{ kind: "eva", text: ch.join(" ") }]) : this.generate([], ch.join(" "))));
    return true;
  }
  async patchInv(id, body) { try { const { data } = await api.patch(`invoices/${encodeURIComponent(id)}`, body, { timeout: 15000 }); return data?.ok ? data.invoice || true : null; } catch { return null; } }
  async markPaid(id) {
    const inv = await this.patchInv(id, { status: "PAID" });
    if (!inv || inv === true) return this.flash(this.t().saveFail);
    this.setState((s) => ({ boot: { ...s.boot, invoices: s.boot.invoices.map((h) => (h.id === id ? inv : h)) } })); this.flash(this.t().paidDone);
  }
  wa(text) { try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener"); } catch { /* blocked */ } }
  remind(inv) { const v = invData(inv, this.me(), this.role(), this.today()); this.patchInv(inv.id, { event: "remind" }); this.wa(`Hi ${v.toName}, a gentle reminder for invoice ${v.no} of ${v.amountDue}, due on ${v.due}. Pay to: ${v.payLine}. Thank you!`); }
  share(inv) {
    const v = invData(inv, this.me(), this.role(), this.today()); this.patchInv(inv.id, { event: "share" });
    const text = `Invoice ${v.no} from ${v.fromName}\nAmount: ${v.amountDue}\nDue: ${v.due}\n${v.viaYbex ? "Paid through Ybex" : `Pay to: ${v.payLine}`}\n${v.isCreator ? "My work" : "Website"}: https://${v.link}`;
    if (navigator.share) { navigator.share({ title: v.no, text }).catch(() => {}); return; }
    this.wa(text);
  }
  exportAs(id, fmt) {
    const tt = this.t(), inv = this.invoices().find((h) => h.id === id); if (!inv) return;
    const v = invData(inv, this.me(), this.role(), this.today());
    this.setState({ sheet: null, exportId: id }); this.flash(fmt === "pdf" ? "Preparing PDF…" : "Preparing JPG…");
    this.later(async () => {
      try {
        const el = this.exportRef.current; if (!el) throw new Error("no node");
        if (document.fonts?.ready) await document.fonts.ready;
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#E9EAE6", useCORS: true, logging: false });
        const name = v.no.replace(/\//g, "-");
        if (fmt === "jpg") { const a = document.createElement("a"); a.href = canvas.toDataURL("image/jpeg", 0.92); a.download = `${name}.jpg`; document.body.appendChild(a); a.click(); a.remove(); }
        else { const { jsPDF } = await import("jspdf"); const w = canvas.width / 2, h = canvas.height / 2; const pdf = new jsPDF({ orientation: "p", unit: "pt", format: [w, h] }); pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, w, h); pdf.save(`${name}.pdf`); }
        this.patchInv(id, { event: "download" });
        this.flash(tt.dlDone);
      } catch { this.flash(tt.dlFail); }
      this.setState({ exportId: null });
    }, 500);
  }

  render() {
    const S = this.state, tt = this.t(), me = this.me(), role = this.role(), today = this.today(), close = this.props.onClose;
    const btnIcon = { width: 44, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 18, fontWeight: 300 };
    const lime = { border: "none", background: "#C6F432", color: "#14532D", fontFamily: FONT, fontWeight: 500, cursor: "pointer" };
    const recs = this.invoices().map((rec) => ({ rec, st: statusOf(rec, today), v: invData(rec, me, role, today) }));
    const count = (k) => (k === "all" ? recs.length : recs.filter((x) => x.st === k).length);
    const detail = S.view && S.view !== "list" ? recs.find((x) => x.rec.id === S.view) : null;
    const viewer = S.viewer ? recs.find((x) => x.rec.id === S.viewer) : null;
    const sheet = S.sheet ? recs.find((x) => x.rec.id === S.sheet) : null;
    const exp = S.exportId ? recs.find((x) => x.rec.id === S.exportId) : null;
    const since = addDaysIso(today, -30);
    const last = S.msgs.length - 1;
    const step = S.f?.step;
    return (
      <div data-testid="eva-invoice" className="ybinv-wrap" style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(10,20,12,.55)", display: "flex", justifyContent: "center", fontFamily: FONT }}>
        <div className="ybinv-panel" style={{ width: "100%", maxWidth: 480, height: "100%", position: "relative", display: "flex", flexDirection: "column", color: "#fff", background: BG, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(12px + env(safe-area-inset-top)) 16px 10px", flexShrink: 0 }}>
            <button type="button" onClick={close} aria-label="Back to Eva" data-testid="invoice-close" style={btnIcon}>←</button>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: ORB }} /><div style={{ fontSize: 16, fontWeight: 500 }}>Ybex Eva · Invoice</div></div>
            <button type="button" onClick={() => this.setState({ view: "list" })} aria-label="My invoices" data-testid="invoice-list-open" style={{ ...btnIcon, fontSize: 16 }}>☰</button>
          </div>

          <div ref={this.listRef} className="ybinv-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {!S.boot && <div style={{ textAlign: "center", padding: 40, fontWeight: 300 }}>{S.loadErr ? <>{tt.loadFail}<br /><button type="button" onClick={() => this.load(() => this.startInvoice(this.props.text || ""))} style={{ ...lime, marginTop: 14, height: 40, padding: "0 18px", borderRadius: 20 }}>{tt.retry}</button></> : tt.loading}</div>}
            {S.msgs.map((m, idx) => {
              const prev = S.msgs[idx - 1];
              if (m.kind === "user") return <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "80%", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.14)", borderRadius: "20px 20px 6px 20px", padding: "9px 14px", fontSize: 15, lineHeight: 1.45 }}>{m.text}</div>;
              if (m.kind === "eva") return <div key={m.id} style={{ display: "flex", gap: 10 }}><div style={{ width: 20, flexShrink: 0, paddingTop: 2 }}>{(!prev || prev.kind === "user") && <div style={{ width: 20, height: 20, borderRadius: "50%", background: ORB }} />}</div><div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 300, lineHeight: 1.6 }}>{m.text}</div></div>;
              if (m.kind === "from") {
                const ok = "#fff", miss = "#FDE68A";
                const lines = [[tt.fName, me.name, true], [me.idLabel || "PAN", me.id || tt.notAdded, Boolean(me.id)], [tt.fAddr, me.address || me.city || tt.notAdded, Boolean(me.address)], [tt.payLbl, me.pay ? `${me.pay.label} · ${me.pay.v}` : tt.notAdded, Boolean(me.pay)]];
                return <div key={m.id} data-testid="invoice-from" style={{ marginLeft: 30, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,.28)", padding: "2px 0 2px 12px", gap: 4 }}>{lines.map(([k, v, good]) => <div key={k} style={{ display: "flex", gap: 10, fontSize: 13 }}><span style={{ width: 62, flexShrink: 0, fontWeight: 300, color: "rgba(255,255,255,.66)" }}>{k}</span><span style={{ color: good ? ok : miss, minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></div>)}{!me.gstOn && role === "creator" && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{S.lang === "hi" ? "GST number nahi hai, isliye GST nahi lagega (₹20 lakh/saal tak zaroori nahi)." : "No GST number, so no GST is charged (not required under ₹20 lakh a year)."}</div>}</div>;
              }
              if (m.kind === "chips") {
                if (idx !== last || S.typing) return null;
                return <div key={m.id} style={{ marginLeft: 30, display: "flex", flexWrap: "wrap", gap: 7 }}>{m.chips.map((c) => <button key={c.label} type="button" onClick={() => this.pickChip(c)} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 36, padding: "0 13px", borderRadius: 18, border: "1px solid rgba(255,255,255,.26)", background: "rgba(255,255,255,.07)", color: "#fff", fontFamily: FONT, fontSize: 13.5, cursor: "pointer" }}>{c.label}{c.isNew && <span style={{ fontSize: 9, fontWeight: 600, background: "#C6F432", color: "#14532D", borderRadius: 5, padding: "2px 5px" }}>YBEX</span>}</button>)}</div>;
              }
              if (m.kind === "invoice") {
                const x = recs.find((r) => r.rec.id === m.id); if (!x) return null;
                return (
                  <div key={m.id} data-testid="invoice-card" style={{ marginLeft: 30, borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)" }}>
                    <button type="button" onClick={() => this.setState({ viewer: x.rec.id })} aria-label="Open invoice" style={{ display: "block", width: "100%", height: 156, padding: 0, border: "none", cursor: "pointer", position: "relative", overflow: "hidden", background: "#E9EAE6" }}>
                      <div style={{ position: "absolute", left: "50%", top: 14, width: 400, marginLeft: -200, transform: "scale(.6)", transformOrigin: "top center", pointerEvents: "none" }}><InvoiceView v={x.v} tpl={x.rec.tpl} /></div>
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 50, background: "linear-gradient(180deg,rgba(230,234,228,0),#E6EAE4)" }} />
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 14px" }}>
                      <button type="button" onClick={() => this.setState({ viewer: x.rec.id })} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: "#fff", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, fontFamily: FONT }}><span style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Invoice · {x.rec.billTo.name}</span><span style={{ fontSize: 12, fontWeight: 300, color: "rgba(255,255,255,.7)" }}>{x.v.no} · {x.v.amountDue}</span></button>
                      <button type="button" data-testid="invoice-download" onClick={() => this.setState({ sheet: x.rec.id })} style={{ ...lime, height: 38, padding: "0 14px", borderRadius: 19, fontSize: 13 }}>↓ {tt.dl}</button>
                    </div>
                  </div>
                );
              }
              return null;
            })}
            {S.typing && <div style={{ display: "flex", gap: 10, alignItems: "center", height: 24 }}><div style={{ width: 20, height: 20, borderRadius: "50%", background: ORB }} /><div style={{ display: "flex", gap: 4 }}>{[0, 0.15, 0.3].map((d) => <div key={d} style={{ width: 5, height: 5, borderRadius: 3, background: "#D9F99D", animation: `ybDot 1s ${d}s infinite` }} />)}</div></div>}
          </div>

          {S.view && (
            <div data-testid="invoice-history" style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", background: BG }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(12px + env(safe-area-inset-top)) 16px 10px", flexShrink: 0 }}>
                <button type="button" onClick={() => this.setState({ view: S.view === "list" || !detail ? null : "list" })} aria-label="Back" style={btnIcon}>←</button>
                <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 16, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail ? detail.v.no : tt.invTitle}</div>
                {S.view === "list" ? <button type="button" onClick={() => this.setState({ view: null, msgs: [] }, () => this.startInvoice(""))} style={{ ...lime, height: 44, padding: "0 15px", borderRadius: 22, fontSize: 13.5 }}>{tt.newInv}</button> : <div style={{ width: 44 }} />}
              </div>
              <div className="ybinv-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
                {S.view === "list" && <>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 10 }}>
                    <div style={{ padding: 14, borderRadius: 20, background: "#C6F432", color: "#14532D", display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 11.5, fontWeight: 500 }}>{tt.toReceive}</span><span style={{ fontSize: 24, fontWeight: 500 }}>{inr(recs.filter((x) => x.st === "unpaid" || x.st === "overdue").reduce((n, x) => n + x.v.net, 0))}</span><span style={{ fontSize: 12 }}>{tt.unpaidN(count("unpaid") + count("overdue"))}</span></div>
                    <div style={{ padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 11.5, color: "rgba(255,255,255,.8)" }}>{tt.received}</span><span style={{ fontSize: 24 }}>{inr(recs.filter((x) => x.st === "paid" && (x.rec.paidOn || x.rec.due || "") >= since).reduce((n, x) => n + x.v.net, 0))}</span>{count("overdue") > 0 && <span style={{ fontSize: 12, color: "#FECACA" }}>{tt.filters.overdue} · {count("overdue")}</span>}</div>
                  </div>
                  <div style={{ display: "flex", padding: 4, gap: 4, borderRadius: 16, background: "rgba(255,255,255,.1)" }}>{["all", "unpaid", "overdue", "paid"].map((k) => <button key={k} type="button" onClick={() => this.setState({ filter: k })} style={{ flex: 1, height: 36, borderRadius: 12, border: "none", cursor: "pointer", background: S.filter === k ? "#fff" : "transparent", color: S.filter === k ? "#14532D" : "#fff", fontFamily: FONT, fontSize: 12.5, fontWeight: 500 }}>{tt.filters[k]} <span style={{ opacity: 0.6 }}>{count(k)}</span></button>)}</div>
                  {recs.filter((x) => S.filter === "all" || x.st === S.filter).map(({ rec, st, v }) => (
                    <button key={rec.id} type="button" onClick={() => this.setState({ view: rec.id })} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: FONT }}>
                      <span style={{ width: 40, height: 40, borderRadius: 13, background: "rgba(255,255,255,.9)", color: "#14532D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{initials(rec.billTo.name)}</span>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.billTo.name}</span><span style={{ fontSize: 11.5, fontWeight: 300, color: "rgba(255,255,255,.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.no} · {v.date}{rec.campaign ? ` · ${rec.campaign.name}` : ""}</span></span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}><span style={{ fontSize: 15 }}>{v.amountDue}</span><span style={{ fontSize: 10.5, fontWeight: 500, borderRadius: 999, padding: "2px 8px", background: ST_LIST[st].bg, color: ST_LIST[st].c }}>{tt.st[st]}</span></span>
                    </button>
                  ))}
                  {!recs.some((x) => S.filter === "all" || x.st === S.filter) && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 14, fontWeight: 300 }}>{tt.empty}</div>}
                </>}
                {detail && <>
                  <div style={{ textAlign: "center", fontSize: 13, color: detail.st === "overdue" ? "#FECACA" : "rgba(255,255,255,.8)" }}>{detail.st === "paid" ? tt.paidOn(fmtDate(detail.rec.paidOn || detail.rec.due)) : detail.st === "overdue" ? tt.overdueBy(daysBetween(detail.rec.due, today)) : tt.dueIn(daysBetween(today, detail.rec.due))}</div>
                  <InvoiceView v={detail.v} tpl={detail.rec.tpl} />
                  <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={() => this.setState({ sheet: detail.rec.id })} style={{ ...lime, flex: 1, height: 44, borderRadius: 22, fontSize: 14 }}>{tt.dl}</button><button type="button" onClick={() => this.share(detail.rec)} style={{ flex: 1, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.26)", background: "transparent", color: "#fff", fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>{tt.wa}</button></div>
                  {detail.st !== "paid" && detail.st !== "cancelled" && !detail.rec.viaYbex && <div style={{ display: "flex", gap: 8 }}><button type="button" data-testid="invoice-mark-paid" onClick={() => this.markPaid(detail.rec.id)} style={{ flex: 1, height: 44, borderRadius: 22, border: "none", background: "#fff", color: "#14532D", fontFamily: FONT, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>{tt.markPaid}</button><button type="button" onClick={() => this.remind(detail.rec)} style={{ flex: 1.3, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.26)", background: "transparent", color: "#fff", fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>{tt.remind}</button></div>}
                </>}
              </div>
            </div>
          )}

          {viewer && (
            <div style={{ position: "absolute", inset: 0, zIndex: 6, background: "#161A14", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(12px + env(safe-area-inset-top)) 14px 10px", flexShrink: 0 }}>
                <button type="button" onClick={() => this.setState({ viewer: null })} aria-label="Close" style={{ ...btnIcon, fontSize: 16 }}>✕</button>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{viewer.rec.billTo.name}</span><span style={{ fontSize: 11.5, fontWeight: 300, color: "rgba(255,255,255,.6)" }}>{viewer.v.no}</span></div>
                <button type="button" onClick={() => this.share(viewer.rec)} aria-label="Share" style={{ ...btnIcon, fontSize: 16 }}>↗</button>
                <button type="button" onClick={() => this.setState({ sheet: viewer.rec.id })} style={{ ...lime, height: 44, padding: "0 14px", borderRadius: 22, fontSize: 13.5 }}>↓ {tt.dl}</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px 40px" }}><InvoiceView v={viewer.v} tpl={viewer.rec.tpl} /></div>
            </div>
          )}

          {sheet && (
            <div style={{ position: "absolute", inset: 0, zIndex: 8, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => this.setState({ sheet: null })} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }} />
              <div style={{ position: "relative", margin: "0 10px calc(14px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ borderRadius: 18, background: "#F7F6F2", overflow: "hidden", color: "#16201A", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "13px 16px", textAlign: "center", fontSize: 12, color: "#6B6F66", borderBottom: "1px solid #E7E6E0" }}>Download {sheet.v.no}</div>
                  {[["pdf", "Download as PDF", "Best for brands and accounts teams"], ["jpg", "Download as JPG", "Quick to send on WhatsApp or Instagram"]].map(([k, a, b]) => <button key={k} type="button" data-testid={`invoice-dl-${k}`} onClick={() => this.exportAs(sheet.rec.id, k)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "14px 18px", border: "none", borderBottom: "1px solid #E7E6E0", background: "transparent", color: "#16201A", cursor: "pointer", textAlign: "left", fontFamily: FONT }}><span style={{ fontSize: 16, fontWeight: 500 }}>{a}</span><span style={{ fontSize: 12.5, fontWeight: 300, color: "#6B6F66" }}>{b}</span></button>)}
                </div>
                <button type="button" onClick={() => this.setState({ sheet: null })} style={{ height: 52, borderRadius: 18, border: "none", background: "#fff", color: "#16201A", fontFamily: FONT, fontSize: 16, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div ref={this.exportRef} aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 400, padding: 28, background: "#E9EAE6" }}>{exp && <InvoiceView v={exp.v} tpl={exp.rec.tpl} />}</div>
          {S.toast && <div style={{ position: "absolute", zIndex: 10, left: "50%", bottom: 104, transform: "translateX(-50%)", background: "#0F2A14", color: "#fff", borderRadius: 999, padding: "9px 16px", fontSize: 13, whiteSpace: "nowrap" }}>{S.toast}</div>}

          <div style={{ padding: "10px 14px calc(16px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 5px 5px 18px", borderRadius: 28, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)" }}>
              <input data-testid="invoice-input" value={S.input} onChange={(e) => this.setState({ input: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") this.send(S.input); }} placeholder={tt.ph[step] || (S.f ? tt.ph.done : tt.ph.idle)} enterKeyHint="send"
                style={{ flex: 1, minWidth: 0, height: 42, border: "none", background: "transparent", color: "#fff", fontFamily: FONT, fontSize: 16, fontWeight: 300, outline: "none" }} />
              <button type="button" onClick={() => this.send(S.input)} aria-label="Send" data-testid="invoice-send" style={{ width: 42, height: 42, borderRadius: 21, border: "none", background: S.input.trim() ? "#C6F432" : "rgba(198,244,50,.4)", color: "#14532D", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>↑</button>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 300, color: "rgba(255,255,255,.6)", textAlign: "center", marginTop: 8 }}>{S.lang === "hi" ? "Eva se galti ho sakti hai — invoice bhejne se pehle details check karo." : "Eva can make mistakes — check the details before you send an invoice."}</div>
          </div>
          <style>{".ybinv-list>*{flex-shrink:0}.ybinv-panel{border-radius:0}@media (min-width:720px){.ybinv-wrap{align-items:center}.ybinv-panel{height:92vh!important;border-radius:28px;box-shadow:0 30px 60px -20px rgba(0,40,10,.5)}}@keyframes ybDot{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}"}</style>
        </div>
      </div>
    );
  }
}

/** The chat card from the brains ({ type: "invoice", auto, text, view }) — opens the invoice screen. */
export function InvoiceCard({ c = {} }) {
  const [open, setOpen] = React.useState(false);
  const opened = React.useRef(false);
  React.useEffect(() => { if (c.auto && !opened.current) { opened.current = true; setOpen(true); } }, [c.auto]);
  const btn = { height: 40, padding: "0 16px", borderRadius: 20, border: "none", background: "#C6F432", color: "#14532D", font: "700 13px 'DM Sans',sans-serif", cursor: "pointer" };
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="eva-invoice-card">
        <button type="button" style={btn} onClick={() => { opened.current = true; setOpen("new"); }}>Create invoice</button>
        <button type="button" style={{ ...btn, background: "rgba(255,255,255,.14)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }} onClick={() => setOpen("list")}>My invoices</button>
      </div>
      {open && typeof document !== "undefined" && createPortal(<EvaInvoiceChat text={open === true ? c.text : ""} view={open === "list" || (open === true && c.view === "list") ? "list" : null} role={c.role} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
export default InvoiceCard;
export { EvaInvoiceChat }; // v431: tests drive the chat

/** Admin → "Eva invoices": the marketing view (who creators bill outside Ybex = sales leads, rates, usage). */
export function InvoiceInsightsAdmin() {
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(false);
  const load = React.useCallback(() => { setErr(false); api.get("admin/invoices/insights", { timeout: 20000, bypassCache: true }).then((r) => (r?.data?.ok ? setD(r.data) : setErr(true))).catch(() => setErr(true)); }, []);
  React.useEffect(load, [load]);
  const card = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 };
  const th = { textAlign: "left", fontSize: 11, color: "#6B7280", fontWeight: 600, padding: "6px 8px", borderBottom: "1px solid #E5E7EB" };
  const td = { fontSize: 13, padding: "8px", borderBottom: "1px solid #F3F4F6" };
  if (err) return <div style={card}>Couldn't load invoice data. <button type="button" onClick={load} style={{ marginLeft: 8, textDecoration: "underline" }}>Retry</button></div>;
  if (!d) return <div style={card}>Loading…</div>;
  const t = d.totals || {};
  const csv = () => { const rows = [["Brand", "GSTIN", "Invoices", "Value", "Creators"], ...(d.offYbexBrands || []).map((b) => [b.name, b.gstin, b.invoices, b.value, b.creators])]; const blob = new Blob([rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "eva-invoice-brand-leads.csv"; a.click(); };
  return (
    <div data-testid="admin-invoice-insights" style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, color: "#111827" }}>
      <div><div style={{ fontSize: 20, fontWeight: 700 }}>Eva invoices</div><div style={{ fontSize: 13, color: "#6B7280" }}>Free invoices made in Eva. Brands that creators bill outside Ybex are sales leads.</div></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        {[["Invoices", t.invoices], ["People using it", t.people], ["Total billed", inr(t.value)], ["Billed outside Ybex", inr(t.offYbexValue)], ["Marked paid", t.paid], ["Downloads / shares", `${t.downloads || 0} / ${t.shares || 0}`]].map(([k, v]) => <div key={k} style={card}><div style={{ fontSize: 12, color: "#6B7280" }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v ?? 0}</div></div>)}
      </div>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><b>Brand leads (billed by creators, not on Ybex deals)</b><button type="button" onClick={csv} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB", fontSize: 12, fontWeight: 600 }}>Download CSV</button></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={th}>Brand</th><th style={th}>GSTIN</th><th style={th}>Invoices</th><th style={th}>Value</th><th style={th}>Creators</th></tr></thead>
          <tbody>{(d.offYbexBrands || []).map((b) => <tr key={b.name}><td style={td}>{b.name}</td><td style={td}>{b.gstin || "—"}</td><td style={td}>{b.invoices}</td><td style={td}>{inr(b.value)}</td><td style={td}>{b.creators}</td></tr>)}{!(d.offYbexBrands || []).length && <tr><td style={td} colSpan={5}>No invoices yet.</td></tr>}</tbody></table></div>
      </div>
      <div style={card}>
        <b>What creators charge (from invoices)</b>
        <div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={th}>Item</th><th style={th}>Invoices</th><th style={th}>Average</th><th style={th}>Range</th></tr></thead>
          <tbody>{(d.rates || []).map((r) => <tr key={r.item}><td style={td}>{r.item}</td><td style={td}>{r.invoices}</td><td style={td}>{inr(r.avg)}</td><td style={td}>{inr(r.min)} – {inr(r.max)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
