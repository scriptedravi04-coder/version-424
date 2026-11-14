// v419 (Ravi: "Eva free invoice"): the invoice maths and text reading — one copy for the phone (EvaInvoice.jsx)
// and the server (backend/assist_routes.ts re-checks every number before it saves). No React, no network here.
//
// Rules this follows (checked against the design prototype, which had these wrong):
//   • Invoice number = <initials>/<financial year of the invoice date>/<0001…>, given by the SERVER per person per FY
//     (the prototype hard-coded "26-27" and counted on the phone, so two phones made the same number).
//   • GST only when the sender has a GST number. CGST+SGST when the client's state = the sender's state, IGST when
//     it differs; an unknown client state is ASKED (the prototype silently charged CGST+SGST).
//   • TDS is the client's choice, so Eva asks; nothing is cut by default (the prototype cut 10% "194J" from every
//     creator invoice — creators are usually paid under 194C at 1%, and small payments have no TDS at all).
//   • A Ybex deal is already paid into the secure payment hold: its invoice says "Paid through Ybex", shows no UPI
//     QR and has no TDS line (the prototype asked the brand to pay the creator a second time).
//   • All amounts are whole rupees, so the lines always add up to the total shown.

export const SAC = "998361"; // advertising services
export const GST_STATES = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
  "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
const STATE_ALIASES = { "new delhi": "07", delhi: "07", ncr: "07", mumbai: "27", pune: "27", bombay: "27", bengaluru: "29", bangalore: "29", hyderabad: "36", chennai: "33", kolkata: "19", calcutta: "19", jaipur: "08", ahmedabad: "24", surat: "24", lucknow: "09", noida: "09", gurgaon: "06", gurugram: "06", chandigarh: "04", kochi: "32", indore: "23", bhopal: "23", patna: "10", goa: "30", up: "09", mp: "23", bengal: "19", tn: "33", ap: "37", "j&k": "01", kashmir: "01", orissa: "21" };
export const TDS = {
  none: { label: "No TDS", rate: 0, sec: "" },
  "194C1": { label: "194C · 1%", rate: 0.01, sec: "194C" },
  "194C2": { label: "194C · 2%", rate: 0.02, sec: "194C" },
  "194J": { label: "194J · 10%", rate: 0.1, sec: "194J" },
};

const lower = (t) => String(t || "").toLowerCase();
export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
export const initials = (s) => (String(s || "").trim().split(/\s+/).map((w) => w[0] || "").join("").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "YB");

// ── dates ─────────────────────────────────────────────────────────────────────────────────────────────────────
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const IST = 5.5 * 3600e3;
export const todayIso = (now = Date.now()) => new Date(now + IST).toISOString().slice(0, 10);
export const addDaysIso = (isoDate, n) => { const t = Date.parse(`${isoDate}T00:00:00Z`) + n * 864e5; return new Date(t).toISOString().slice(0, 10); };
export const fmtDate = (isoDate) => { const [y, m, d] = String(isoDate || "").split("-").map(Number); return y ? `${String(d).padStart(2, "0")} ${MON[m - 1]} ${y}` : ""; };
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** "2026-11-09" → "26-27" (India's financial year runs April–March). */
export const fyOf = (isoDate) => { const [y, m] = String(isoDate).split("-").map(Number); const s = m >= 4 ? y : y - 1; return `${String(s).slice(2)}-${String(s + 1).slice(2)}`; };
export const invoiceNumber = (name, isoDate, n) => `${initials(name)}/${fyOf(isoDate)}/${String(n).padStart(4, "0")}`;

// ── GSTIN / PAN / UPI ───────────────────────────────────────────────────────────────────────────────────────
const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gstinOk(g) {
  const s = String(g || "").toUpperCase().trim();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s) || !GST_STATES[s.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) { const v = GST_CHARS.indexOf(s[i]) * (i % 2 ? 2 : 1); sum += Math.floor(v / 36) + (v % 36); }
  return GST_CHARS[(36 - (sum % 36)) % 36] === s[14];
}
export const gstinIn = (t) => (String(t || "").toUpperCase().match(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/) || [])[0] || "";
export const panOk = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(p || "").toUpperCase());
export const upiIn = (t) => (String(t || "").match(/\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,30}\b/) || [])[0] || "";
export function bankIn(t) {
  const acc = (String(t || "").match(/\b\d{9,18}\b/) || [])[0], ifsc = (String(t || "").toUpperCase().match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/) || [])[0];
  return acc && ifsc ? { acc, ifsc } : null;
}
/** A state from a GSTIN, a 2-digit code, a state name or a big city. */
export function stateCodeIn(t) {
  const g = gstinIn(t); if (g) return g.slice(0, 2);
  const s = ` ${lower(t).replace(/[^a-z&\s]/g, " ").replace(/\s+/g, " ")} `;
  const byName = Object.entries(GST_STATES).sort((a, b) => b[1].length - a[1].length).find(([, n]) => s.includes(` ${lower(n).replace(/[^a-z&\s]/g, " ").replace(/\s+/g, " ")} `));
  if (byName) return byName[0];
  const al = Object.keys(STATE_ALIASES).sort((a, b) => b.length - a.length).find((k) => s.includes(` ${k} `));
  return al ? STATE_ALIASES[al] : "";
}

// ── reading what she typed ────────────────────────────────────────────────────────────────────────────────────
const KINDS = [[/^reels?$/i, "Instagram reel"], [/^(story|stories)$/i, "Instagram story"], [/^posts?$/i, "Instagram post"], [/^carousels?$/i, "Instagram carousel"], [/^ugc/i, "UGC video"], [/^(youtube|yt)/i, "YouTube integration"], [/^shorts?$/i, "YouTube short"], [/^videos?$/i, "Video"], [/^(usage|rights)/i, "Usage rights"]];
const kindOf = (w) => (KINDS.find(([r]) => r.test(String(w).trim())) || [0, String(w).trim()])[1];
const NUM = "(?:₹|rs\\.?\\s*|inr\\s*)?(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k\\b|thousand|hazaa?r|lakh|lac|l\\b)?";
export const toNum = (n, u) => { let v = parseFloat(String(n).replace(/,/g, "")); u = lower(u); if (u === "k" || u.startsWith("thousand") || u.startsWith("haza")) v *= 1000; if (u === "l" || u === "lakh" || u === "lac") v *= 100000; return Math.round(v); };
/** The first amount of ₹100 or more ("9k", "₹9,000", "1.2 lakh"); 0 when there is none. */
export const parseAmount = (t) => { const re = new RegExp(NUM, "gi"); let m; while ((m = re.exec(String(t || "")))) { const v = toNum(m[1], m[2]); if (v >= 100) return v; } return 0; };
/** "2 reels 9k each, 1 story 3500" → [{ d, q, r }] (r = "" when no price was given). */
export function parseItems(t) {
  const s = String(t || "");
  const re = /(?:(\d{1,3})\s*(?:x|×)?\s*)?\b(reels?|stories|story|posts?|carousels?|ugc(?:\s+videos?)?|youtube(?:\s+(?:integration|video))?|yt(?:\s+video)?|shorts?|videos?|usage rights?)\b/gi;
  const out = []; let m;
  while ((m = re.exec(s))) {
    const q = m[1] ? Math.min(999, Number(m[1])) : 1;
    const rest = s.slice(m.index + m[0].length, m.index + m[0].length + 34);
    const am = rest.match(new RegExp("^\\s*(?:for|at|@|of|-|,|:|ka|ki|ke|=)?\\s*" + NUM + "\\s*(each|per|ek ka|har|total|sab)?", "i"));
    let r = "";
    if (am) { const v = toNum(am[1], am[2]); if (v >= 100) r = /total|sab/i.test(am[3] || "") && q > 1 ? Math.round(v / q) : v; }
    out.push({ d: kindOf(m[2]), q, r });
  }
  return out;
}
/** A client name typed alone ("kinara organics") → "Kinara Organics"; words like invoice / for / bana are dropped. */
export const tidyName = (s) => {
  const x = String(s || "").replace(new RegExp(NUM, "gi"), " ").replace(/\b(invoice|bill|bana(o|do|na)?|create|make|an?|for|to|ke liye|ka|ki|ko|ye|yeh|hai|please|pls)\b/gi, " ").replace(/[^\p{L}\p{N}&.' -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return x === x.toLowerCase() ? x.replace(/\b\w/g, (c) => c.toUpperCase()) : x;
};

// ── the numbers ───────────────────────────────────────────────────────────────────────────────────────────────
/** rec: { items:[{d,q,r}], disc:{mode:'flat'|'pct', val}, tds, gstOn, billTo:{st}, viaYbex } · fromState: sender's state code. */
export function calc(rec, fromState = "") {
  const items = (rec.items || []).map((i) => ({ d: String(i.d || "").slice(0, 120), q: Math.max(0, Math.min(999, Math.round(Number(i.q) || 0))), r: Math.max(0, Math.min(1e8, Math.round(Number(i.r) || 0))) }))
    .map((i) => ({ ...i, amount: i.q * i.r }));
  const sub = items.reduce((n, i) => n + i.amount, 0);
  const dv = Math.max(0, Number(rec.disc?.val) || 0);
  const disc = Math.min(sub, Math.round(rec.disc?.mode === "pct" ? (sub * Math.min(dv, 100)) / 100 : dv));
  const taxable = sub - disc;
  const gstOn = Boolean(rec.gstOn);
  const toSt = rec.billTo?.st || "";
  const inter = gstOn && Boolean(toSt) && Boolean(fromState) && toSt !== fromState;
  const half = gstOn && !inter ? Math.round(taxable * 0.09) : 0;
  const igst = gstOn && inter ? Math.round(taxable * 0.18) : 0;
  const gst = half * 2 + igst;
  const total = taxable + gst;
  const tdsInfo = rec.viaYbex ? TDS.none : TDS[rec.tds] || TDS.none;
  const tds = Math.round(taxable * tdsInfo.rate); // TDS is on the amount before GST (CBDT circular 23/2017)
  return { items, sub, disc, taxable, gstOn, inter, half, igst, gst, total, tds, tdsInfo, net: total - tds };
}
export const statusOf = (rec, today = todayIso()) => (rec.status === "PAID" || rec.status === "paid" ? "paid" : rec.status === "CANCELLED" ? "cancelled" : (rec.due || "") < today ? "overdue" : "unpaid");

// ── amount in words (Indian system) ─────────────────────────────────────────────────────────────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const three = (n) => (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n));
export function words(x) {
  let n = Math.round(Number(x) || 0); if (n <= 0) return "Zero rupees only";
  const parts = []; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) parts.push(three(cr) + " Crore"); if (lk) parts.push(two(lk) + " Lakh"); if (th) parts.push(two(th) + " Thousand"); if (n) parts.push(three(n));
  return "Rupees " + parts.join(" ") + " only";
}

/** UPI deep link for the QR (amount = what she should receive). */
export const upiUri = (upi, name, amount, note) => (upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name || "")}&am=${Math.round(amount || 0)}&cu=INR&tn=${encodeURIComponent(note || "")}` : "");

/** Server-side check of a record from the phone → { ok, rec } | { ok:false, error }. */
export function cleanRecord(body = {}) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 25).map((i) => ({ d: String(i?.d || "").trim().slice(0, 120), q: Math.round(Number(i?.q) || 0), r: Math.round(Number(i?.r) || 0) })).filter((i) => i.d && i.q > 0);
  if (!items.length) return { ok: false, error: "Add at least one item." };
  if (items.some((i) => i.q > 999 || i.r < 0 || i.r > 1e8)) return { ok: false, error: "Check the quantity and price." };
  const name = String(body.billTo?.name || "").trim().slice(0, 100);
  if (!name) return { ok: false, error: "Who is the invoice for?" };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : todayIso();
  const dueDays = Math.max(0, Math.min(120, Math.round(Number(body.dueDays ?? 15))));
  const gst = gstinIn(body.billTo?.gstin || "");
  const st = (gst && gst.slice(0, 2)) || (GST_STATES[body.billTo?.st] ? body.billTo.st : "");
  const disc = body.disc && ["flat", "pct"].includes(body.disc.mode) ? { mode: body.disc.mode, val: Math.max(0, Number(body.disc.val) || 0) } : { mode: "flat", val: 0 };
  return {
    ok: true,
    rec: {
      items, date, due: addDaysIso(date, dueDays), dueDays,
      billTo: { name, sub: String(body.billTo?.sub || "").slice(0, 140), gstin: gst, st, address: String(body.billTo?.address || "").slice(0, 200), userId: body.billTo?.userId ? String(body.billTo.userId).slice(0, 80) : null },
      campaign: body.campaign && body.campaign.name ? { name: String(body.campaign.name).slice(0, 120), id: String(body.campaign.id || "").slice(0, 80) } : null,
      viaYbex: Boolean(body.viaYbex && body.campaign),
      disc, tds: TDS[body.tds] ? body.tds : "none", notes: String(body.notes || "").slice(0, 600), tpl: body.tpl === "receipt" ? "receipt" : "pro",
    },
  };
}
