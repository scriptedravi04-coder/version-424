import React, { useState } from "react";
import HomeCampaignCard from "../../campaigns/mobile/HomeCampaignCard";
import { CREATOR_POPULAR, CREATOR_MORE } from "./capsChips";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { inr } from "../../feedback/assistKnowledge";
import { referralCodeFor, referralLinkFor } from "../../../utils/referral";
import * as T from "./tools";
import * as L from "./creatorLogic";
import CreatorReviewInvitationModal from "../../campaigns/CreatorReviewInvitationModal";
import { formatBudget } from "../../../utils/invitationUtils";
import { safeStorage } from "../../../utils/storage";
import SocialLogo from "../../common/SocialLogo"; // v364: real platform logos

// Session 54: the cards Eva shows a CREATOR — frosted white glass on the green chat (same look as the brand
// cards). Buttons open the app's own screens; the only thing sent from here is a campaign application, and
// only when the creator taps "Send" on a filled-in card.

const ink = "#0F2A14", sub = "#4B5563", line = "#E5E7EB", green = "#15803D";
const card = { background: "rgba(255,255,255,.9)", backdropFilter: "blur(18px) saturate(140%)", WebkitBackdropFilter: "blur(18px) saturate(140%)", border: "1px solid rgba(255,255,255,.65)", borderRadius: 22, padding: 14, color: ink, boxShadow: "0 18px 36px -22px rgba(0,40,0,.8)", font: "500 13px/1.45 'DM Sans',sans-serif", width: "100%", boxSizing: "border-box" };
const btn = (primary) => ({ height: 40, /* v329: 40px tap target (was 38) */ padding: "0 14px", borderRadius: 19, border: primary ? "none" : `1px solid ${line}`, background: primary ? green : "#fff", color: primary ? "#fff" : ink, font: "700 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 });
const glassChip = { height: 40, /* v329: 40px tap target (was 34) */ padding: "0 14px", borderRadius: 17, border: "1px solid rgba(255,255,255,.45)", background: "rgba(255,255,255,.16)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", color: "#fff", font: "700 12.5px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
const row = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${line}` };
const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Couldn't copy — select and copy by hand"); } };

// v329: first letter without splitting an emoji / Hindi letter in half (charAt(0) drew a broken glyph); "  " → "?".
const firstChar = (text) => (Array.from(String(text || "").trim())[0] || "?").toUpperCase();
function Initial({ text, color = "#DCFCE7", ink: c = green }) {
  return <div style={{ width: 38, height: 38, borderRadius: 12, background: color, color: c, display: "flex", alignItems: "center", justifyContent: "center", font: "800 15px 'DM Sans',sans-serif", flexShrink: 0 }}>{firstChar(text)}</div>;
}
/** v329: a brand logo that falls back to the initial when the image fails (it used to show a broken image). */
function Logo({ src, text }) {
  const [bad, setBad] = useState(false);
  if (!src || bad || String(src).includes("dicebear")) return <Initial text={text} />;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />;
}
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" }; // v329: a long one-word title can't push the card wider

// ── apply form (inside the opportunities row and the "apply" card) ───────────────────────────────────
// Session 58 (Eva handoff part 3): pitch 20–500 characters with a live counter, a quote of ₹100–₹50,00,000
// checked against the creator's reach (✅ / ⚠️ line), and one full-width "Send application" button.
// Sending is still the one `campaigns/apply` call (tools.applyTo), only after the creator taps it.
const fieldLabel = { display: "block", font: "800 10.5px 'DM Sans',sans-serif", letterSpacing: ".7px", color: sub, textTransform: "uppercase" };
// v329: applications sent in this session, shared by every card (a re-mounted card kept showing the form and
// could send twice; the opportunities row didn't know the apply card had sent).
const sentApps = new Set();
const sentSubs = new Set();
// v329: these memories belong to one login — another account in the same tab starts clean.
let memOwner = null;
const syncAccount = () => {
  let id = "";
  try { id = JSON.parse(safeStorage.getItem("ybex_user") || "null")?.user_id || ""; } catch { /* noop */ }
  if (id !== memOwner) { memOwner = id; sentApps.clear(); try { inviteFinal.clear(); } catch { /* not ready yet */ } }
};
const markSent = (id) => { syncAccount(); sentApps.add(String(id)); sentSubs.forEach((f) => f()); };
const useSentApps = () => { syncAccount(); const [, bump] = useState(0); React.useEffect(() => { const f = () => bump((n) => n + 1); sentSubs.add(f); return () => { sentSubs.delete(f); }; }, []); return sentApps; };
// v329: grow the pitch box with the text (it stayed 4 rows and scrolled inside itself).
const grow = (el) => { if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, 260)}px`; };
// v329: the phone keyboard covered the field — bring it to the middle once the keyboard is up.
const intoView = (e) => { const el = e.currentTarget; setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* old browser */ } }, 320); };
function ApplyForm({ opp, close, onDone }) {
  const navigate = useNavigate();
  const sent = useSentApps();
  const [pitch, setPitch] = useState(() => L.cutChars(opp.pitch || "", L.PITCH_MAX));
  const [amount, setAmount] = useState(() => L.cleanQuoteInput(opp.amount ? String(opp.amount) : ""));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(() => (sent.has(String(opp.id)) ? { ok: true } : null));
  const sending = React.useRef(false); // v329: a double tap sent twice (busy is only set after the re-render)
  const ta = React.useRef(null);
  React.useEffect(() => { grow(ta.current); }, [pitch]);
  const pc = L.pitchCheck(pitch);
  const qc = L.quoteCheck(opp.reach, amount);
  const ready = pc.ok && qc.ok && !busy;
  const send = async () => {
    if (!ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    let r;
    try { r = await T.applyTo(opp, { pitch, amount }); } catch { r = { ok: false, code: "SERVER", message: "Couldn't send the application. Please try again." }; }
    sending.current = false;
    setBusy(false);
    setRes(r);
    if (r.ok || r.code === "APPLIED") { markSent(opp.id); onDone?.(); }
    if (r.ok) toast.success("Application sent!");
  };
  if (res?.ok || sent.has(String(opp.id))) return <div data-testid="eva-apply-sent" style={{ marginTop: 10, height: 44, borderRadius: 22, background: "#DCFCE7", color: green, display: "flex", alignItems: "center", justifyContent: "center", font: "800 13.5px 'DM Sans',sans-serif" }}>{res?.code === "APPLIED" ? "✓ Already applied" : "✓ Application sent"}</div>;
  // v329: &from=eva so Back / done returns to Eva; a closed campaign and an expired login get their own button.
  const fix = { KYC: ["/settings?section=kyc&from=eva", "Do KYC"], ONBOARD: ["/onboarding", "Finish setup"], UGC: ["/creator/ugc", "Open UGC"], LOGIN: ["/login", "Log in"] }[res?.code];
  const tone = { warn: ["#FEF3C7", "#78350F"], good: ["#DCFCE7", "#14532D"], error: ["#FEE2E2", "#991B1B"], info: ["#F3F4F6", sub] }[qc.level];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10 }} data-testid="eva-apply-form">
      <label style={fieldLabel}>Pitch to brand
        {/* v329: no maxLength (it counts an emoji as 2); the cut is by characters, the box grows, font 16px so iPhone doesn't zoom */}
        <textarea ref={ta} value={pitch} onChange={(e) => setPitch(L.cutChars(e.target.value, L.PITCH_MAX))} onFocus={intoView} rows={4} placeholder="Why you're a good fit, in a few lines…" aria-describedby={`eva-pc-${opp.id}`}
          style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, border: `1px solid ${line}`, borderRadius: 14, padding: 10, font: "500 16px/1.45 'DM Sans',sans-serif", color: ink, background: "#fff", resize: "none", overflowY: "auto", minHeight: 96, textTransform: "none", letterSpacing: 0 }} />
        <span id={`eva-pc-${opp.id}`} aria-live="polite" data-testid="eva-pitch-count" style={{ display: "block", textAlign: "right", marginTop: 3, font: "700 10.5px 'DM Sans',sans-serif", letterSpacing: 0, color: pc.short ? "#B45309" : sub, textTransform: "none" }}>{pc.label}</span>
      </label>
      <label style={fieldLabel}>Your quote (₹)
        <input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={amount} placeholder="e.g. 4500" onFocus={intoView} onChange={(e) => setAmount(L.cleanQuoteInput(e.target.value))} /* v328: "4,500.50" → 4500 · v329: no letters / minus / leading zeros */
          style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, height: 44, border: `1px solid ${qc.level === "error" ? "#FCA5A5" : line}`, borderRadius: 14, padding: "0 12px", font: "800 16px 'DM Sans',sans-serif", color: ink, background: "#fff", letterSpacing: 0 }} />
        {amount && Number(amount) >= 1000 ? <span style={{ display: "block", marginTop: 3, font: "600 11px 'DM Sans',sans-serif", color: sub, letterSpacing: 0, textTransform: "none" }}>{inr(Number(amount))}</span> : null}{/* v329: "500000" read back as ₹5,00,000 */}
      </label>
      {qc.message ? <div data-testid="eva-quote-check" data-level={qc.level} style={{ background: tone[0], color: tone[1], borderRadius: 12, padding: "8px 10px", font: "600 12px/1.45 'DM Sans',sans-serif" }}>{qc.message}</div> : null}
      <button type="button" className="eva-press" style={{ ...btn(true), width: "100%", height: 44, borderRadius: 22, opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "default" }} disabled={!ready} aria-disabled={!ready} onClick={send} data-testid="eva-apply-send">{busy ? "Sending…" : "Send application"}</button>
      {!ready && !busy && (pc.short || qc.level === "empty") ? <div style={{ color: sub, fontSize: 11.5, textAlign: "center", marginTop: -4 }}>{pc.short ? `Write at least ${L.PITCH_MIN} characters in your pitch` : "Enter your quote"} to send.</div> : null}{/* v329: why Send is grey */}
      {res && !res.ok && (
        <div role="alert" data-testid="eva-apply-error" style={{ display: "flex", gap: 8, alignItems: "center", background: "#FEF3C7", color: "#78350F", borderRadius: 12, padding: "8px 10px", font: "600 12px/1.4 'DM Sans',sans-serif" }}>
          <span style={{ flex: 1, minWidth: 0, ...wrap }}>{String(res.message || "Couldn't send the application.")}</span>
          {fix ? <button type="button" style={btn(false)} onClick={() => { close?.(); navigate(fix[0]); }}>{fix[1]}</button>
            : <button type="button" style={btn(false)} onClick={() => { close?.(); navigate(`/campaigns/${opp.id}`); }}>Open</button>}
        </div>
      )}
    </div>
  );
}

// ── opportunities: a swipeable row of campaign / UGC cards ("Apply in 1 tap") ─────────────────────────
const UGC_KIND = { collaboration_reel: "Collab reel", ugc_video_edited: "Edited video", ugc_video_raw: "Raw clips" };
function oppDeliverables(o) {
  const r = o.raw || {};
  if (o.kind === "ugc") return [UGC_KIND[r.deliverable_type] || "UGC video", r.video_duration].filter(Boolean).join(" · ");
  const d = Array.isArray(r.deliverables) ? r.deliverables.map((x) => (typeof x === "string" ? x : x?.label || x?.type || "")).filter(Boolean) : [];
  if (d.length) return d.slice(0, 2).join(" + ");
  const p = Array.isArray(r.platforms) ? r.platforms.filter(Boolean) : [];
  return p.length ? `${p.slice(0, 2).join(" + ")} content` : "As per brief";
}
function oppPay(o) {
  if (!o.budget) return "Open budget";
  if (o.kind === "ugc") return `${inr(o.budget)} / video budget`; // v328 (Ravi): brief budget only, not what the creator receives
  return o.budget_min && o.budget_min < o.budget ? `${inr(o.budget_min)}–${inr(o.budget)}` : `up to ${inr(o.budget)}`;
}
// v333 (Ravi: "Eva ke andar campaign ka alag UI mat bana — dashboard jaisa, bas green"): the same card as the
// creator home "Best matches" (brand face, posted / closes, brief line, pay, deliverable, views, applied), in green.
const EVA_VIEWER = { role: "creator" }; // same generated views / applied numbers as the Campaigns page
function OppTile({ o, idx, applied, open, onApply, onView }) {
  const raw = o.raw || {};
  const isUgc = o.kind === "ugc";
  const c = {
    ...raw,
    id: raw.id || o.id,
    title: o.title || raw.title,
    brand_name: o.brand || raw.brand_name,
    matchScore: Number.isFinite(Number(o.score)) && o.score !== null && o.score !== "" ? Math.round(Number(o.score)) : null,
    deliverables: oppDeliverables(o) ? [oppDeliverables(o)] : raw.deliverables,
    description: raw.description || raw.detailed_requirements || raw.brief || "",
  };
  const action = isUgc
    ? <button type="button" className="eva-press" style={{ ...btn(true), width: "100%" }} onClick={onView} data-testid="eva-ugc-claim">Claim on UGC</button>
    : applied
      ? <span style={{ ...btn(false), width: "100%", color: green, cursor: "default", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>✓ Applied</span>
      : <button type="button" className="eva-press" style={{ ...btn(!open), width: "100%" }} onClick={onApply} data-testid="eva-apply-open">{open ? "Close" : "Apply in 1 tap"}</button>;
  return (
    <div data-testid="eva-opp" style={{ flex: "0 0 auto", display: "flex", scrollSnapAlign: "start", animation: `evaCardIn .55s cubic-bezier(.22,1,.36,1) ${idx * 0.08}s both` }}>
      <HomeCampaignCard c={c} user={EVA_VIEWER} tone="green" tag={isUgc ? "UGC" : null} onOpen={onView}
        payLabel={isUgc ? "Budget per video" : "Per creator"} payText={oppPay(o) || null}
        selected={open} footer={action} style={{ width: "min(280px, 76vw)", color: "#0A0A0A" }} />
    </div>
  );
}
function Opps({ c: d, close, onSay }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const sent = useSentApps(); // v329: an application sent from another card (or before a re-mount) shows "✓ Applied" here too
  const cur = d.items.find((o) => o.id === open && o.kind === "campaign");
  const shown = d.shown || d.items.length;
  return (
    <div data-testid="eva-opps" style={{ width: "100%" }}>
      <style>{"@keyframes evaCardIn{0%{opacity:0;filter:blur(12px);transform:translateX(30px) scale(.9)}100%{opacity:1;filter:blur(0);transform:none}}"}</style>
      <div className="no-scrollbar" data-testid="eva-opps-row" style={{ display: "flex", alignItems: "stretch", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollPaddingLeft: 22, padding: "20px 22px 30px", margin: "-16px -22px -22px", marginRight: -18, /* v329: -22 reached 2px past the chat's padding → the whole chat could be dragged sideways */ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {d.items.map((o, idx) => (
          <OppTile key={`${o.kind}-${o.id}`} o={o} idx={idx} applied={o.applied || done.has(o.id) || (o.kind === "campaign" && sent.has(String(o.id)))} open={open === o.id}
            onApply={() => setOpen(open === o.id ? null : o.id)}
            onView={() => { close?.(); navigate(o.kind === "ugc" ? "/creator/ugc" : `/campaigns/${o.id}`); }} />
        ))}
      </div>
      {cur && !cur.applied && (
        <div style={{ ...card, marginTop: 12, animation: "evaCardIn .4s cubic-bezier(.22,1,.36,1) both" }}>
          <div style={{ font: "800 13.5px 'DM Sans',sans-serif", ...wrap }}>{cur.title}</div>
          <div style={{ color: sub, fontSize: 11.5, ...wrap }}>{[cur.brand, oppPay(cur)].filter(Boolean).join(" · ")}</div>
          <ApplyFormLoader opp={cur} close={close} onDone={() => setDone((s) => new Set([...s, cur.id]))} />
        </div>
      )}
      {d.total > shown && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5 }}>Showing {shown} of {d.total}</span>
          <button type="button" style={{ ...glassChip, height: 36 /* v329: was 30 */ }} onClick={() => onSay?.("Show more", "show more")}>Show more</button>
        </div>
      )}
    </div>
  );
}
/** Fills the pitch + quote for one opportunity, then shows the form. */
function ApplyFormLoader({ opp, close, onDone }) {
  const [filled, setFilled] = useState(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { profile } = await T.loadMe();
      if (alive) setFilled({ ...opp, pitch: L.pitchFor(opp, profile), amount: L.suggestedAmount(opp, profile), reach: L.fairRates(profile).reach });
    })().catch(() => { if (alive) setFilled({ ...opp, pitch: "", amount: "", reach: 0 }); });
    return () => { alive = false; };
  }, [opp]);
  if (!filled) return <div style={{ color: sub, fontSize: 12, padding: "8px 0" }}>Filling your pitch…</div>;
  return <ApplyForm opp={filled} close={close} onDone={onDone} />;
}

function Apply({ c: d, close }) {
  return (
    <div style={card} data-testid="eva-apply">
      {d.items.map((o, oi) => (
        <div key={`${o.id ?? "o"}-${oi}`} style={{ ...row, flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ font: "800 13.5px 'DM Sans',sans-serif", ...wrap }}>{o.title}</div>
          <div style={{ color: sub, fontSize: 11.5, ...wrap }}>{[o.brand, oppPay(o), Number.isFinite(Number(o.score)) && o.score != null ? `${Math.round(Number(o.score))}% match` : ""].filter(Boolean).join(" · ")}</div>{/* v329: no "undefined% match" */}
          <ApplyForm opp={o} close={close} />
        </div>
      ))}
    </div>
  );
}

function AlertToggle() {
  const [state, setState] = useState("idle");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" style={glassChip} disabled={state !== "idle"} onClick={async () => {
        setState("busy");
        // v329: a failed profile load left the button stuck on "Turning on…"
        const ok = await (async () => { const { profile } = await T.loadMe(); return T.setCampaignAlerts(true, profile); })().catch(() => false);
        setState(ok ? "on" : "idle");
        toast[ok ? "success" : "error"](ok ? "Alerts on — you'll get a phone notification" : "Couldn't turn alerts on");
      }}>{state === "on" ? "✓ Alerts on" : state === "busy" ? "Turning on…" : "🔔 Turn on alerts"}</button>
    </div>
  );
}

function Lines({ c: d }) {
  return <div style={card}>{d.lines.map((l, i) => <div key={i} style={{ padding: "5px 0", borderBottom: i < d.lines.length - 1 ? `1px solid ${line}` : "none" }}>{l}</div>)}</div>;
}

// Session 58: one amount ("around ₹X per reel") and the ✅ / ⚠️ check of the creator's own reel rate.
function Rate({ c: d, close }) {
  const navigate = useNavigate();
  const r = d.rate || {};
  const tone = { warn: ["#FEF3C7", "#78350F"], good: ["#DCFCE7", "#14532D"], info: ["#F3F4F6", sub] }[d.check?.level] || ["#F3F4F6", sub];
  return (
    <div style={card} data-testid="eva-rate">
      {d.fair ? (
        <div style={{ textAlign: "center", padding: "4px 0 10px" }}>
          <div style={{ font: "700 10.5px 'DM Sans',sans-serif", color: sub, letterSpacing: ".7px" }}>{d.label || "FAIR REEL RATE"}</div>
          <div style={{ font: "800 26px 'DM Sans',sans-serif", color: green, marginTop: 2 }}>Around {inr(d.fair)}</div>
          <div style={{ fontSize: 11.5, color: sub }}>{d.unit || "per reel"}{r.reach ? ` · ~${Number(r.reach).toLocaleString("en-IN")} avg reach` : ""}</div>
        </div>
      ) : null}
      {Array.isArray(d.facts) && d.facts.length ? <ul data-testid="eva-rate-facts" style={{ margin: "0 0 8px", paddingLeft: 18, color: ink, fontSize: 12.5, lineHeight: 1.5 }}>{d.facts.map((f, i) => <li key={i}>{f}</li>)}</ul> : null /* v419: her real numbers */}
      {d.check?.message ? <div data-testid="eva-rate-check" data-level={d.check.level} style={{ background: tone[0], color: tone[1], borderRadius: 12, padding: "8px 10px", font: "600 12px/1.45 'DM Sans',sans-serif" }}>{d.check.message}</div>
        : (d.own ? null : <div style={{ color: sub }}>You haven't set this rate yet — add it so brands can invite you directly.</div>)}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" style={btn(true)} onClick={() => { close?.(); navigate("/settings?section=rates&from=eva"); }}>{d.own ? "Edit my rates" : "Set my rates"}</button>
      </div>
    </div>
  );
}

// ── brand invitations: the card, and the app's own review popup for Accept / Decline (with a reason) ─────
// v328: the final state of each invite is shared by every invites card in the chat (module-level map), so an
// older card for the same invite shows ACCEPTED / DECLINED / NO LONGER OPEN too.
const inviteFinal = new Map();
const inviteSubs = new Set();
const setInviteFinal = (id, v) => { syncAccount(); inviteFinal.set(String(id), v); inviteSubs.forEach((f) => f()); };
function Invites({ c: d, close }) {
  const navigate = useNavigate();
  const [reviewing, setReviewing] = useState(null);
  const [, bump] = useState(0);
  React.useEffect(() => { const f = () => bump((n) => n + 1); inviteSubs.add(f); return () => { inviteSubs.delete(f); }; }, []);
  syncAccount(); // v329
  const result = Object.fromEntries(d.items.map((i) => [i.id, inviteFinal.get(String(i.id))]).filter(([, v]) => v));
  // v328: the popup closed without accept / decline (e.g. a 409 "no longer open") → re-check; gone → collapse.
  const recheck = async (inv) => {
    if (!inv || inviteFinal.get(String(inv.id))) return;
    const still = await T.loadInvites();
    if (!still.some((x) => String(x.id) === String(inv.id))) setInviteFinal(inv.id, "closed");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }} data-testid="eva-invites">
      {d.items.map((i, idx) => {
        const done = result[i.id];
        const brand = i.brand_name || "A brand";
        const logo = i.brand_logo || "";
        const note = i.notes || i.message || i.pitch || "";
        return (
          <div key={i.id} style={{ ...card, animation: `evaCardIn .5s cubic-bezier(.22,1,.36,1) ${idx * 0.08}s both` }} data-testid="eva-invite">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo src={logo} text={brand} />{/* v329: a dead logo showed a broken image */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: sub, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{brand} invited you</div>
                <div style={{ font: "800 14px/1.3 'DM Sans',sans-serif", ...wrap }}>{i.campaign_title || "Campaign collaboration"}</div>
              </div>
              {done ? <span data-testid="eva-invite-status" style={{ padding: "4px 9px", borderRadius: 10, background: done === "accepted" ? "#DCFCE7" : "#F3F4F6", color: done === "accepted" ? green : sub, font: "800 10px 'DM Sans',sans-serif", letterSpacing: ".7px" }}>{done === "accepted" ? "ACCEPTED" : done === "closed" ? "NO LONGER OPEN" : "DECLINED"}</span> : null}
            </div>
            {!done && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "8px 10px", minWidth: 0 }}>
                    <div style={{ font: "700 9.5px 'DM Sans',sans-serif", color: sub, letterSpacing: ".6px" }}>OFFERED BUDGET</div>
                    <div style={{ font: "800 14px 'DM Sans',sans-serif", color: green, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatBudget(i.proposed_budget || i.budget_range)}</div>
                  </div>
                  <div style={{ background: "#F7F7FA", borderRadius: 12, padding: "8px 10px", minWidth: 0 }}>
                    <div style={{ font: "700 9.5px 'DM Sans',sans-serif", color: sub, letterSpacing: ".6px" }}>TIMELINE</div>
                    <div style={{ font: "700 13px 'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.timeline || "Flexible"}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, ...wrap }}><b>Deliverables:</b> {i.deliverables || "Details in the deal room"}</div>
                {note ? <div style={{ marginTop: 6, color: sub, fontSize: 12.5, fontStyle: "italic", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>"{note}"</div> : null}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="eva-press" style={{ ...btn(false), flex: "0 0 86px", padding: "0 10px" }} onClick={() => setReviewing(i)} data-testid="eva-invite-decline">Decline</button>
                  <button type="button" className="eva-press" style={{ ...btn(true), flex: 1, minWidth: 0, padding: "0 10px", whiteSpace: "nowrap", fontSize: 12.5 }} onClick={() => setReviewing(i)} data-testid="eva-invite-accept">Accept & open deal room</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {reviewing && (
        <CreatorReviewInvitationModal isOpen invite={reviewing} onClose={() => { const inv = reviewing; setReviewing(null); recheck(inv).catch(() => null); }}
          onAccepted={(inv, threadId) => { setInviteFinal(inv.id, "accepted"); close?.(); navigate(threadId ? `/chat/${threadId}` : "/inbox"); }}
          onDeclined={(inv) => setInviteFinal(inv.id, "declined")} />
      )}
    </div>
  );
}

function Profile({ c: { score: ps }, close, onSay }) {
  const navigate = useNavigate();
  return (
    <div style={card} data-testid="eva-profile">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ font: "800 26px 'DM Sans',sans-serif", color: ps.score >= 80 ? green : ps.score >= 50 ? "#B45309" : "#B91C1C" }}>{ps.score}%</div>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#F3F4F6" }}><div style={{ width: `${ps.score}%`, height: 8, borderRadius: 4, background: green }} /></div>
      </div>
      {ps.items.map((i, ii) => (
        <div key={`${i.key ?? "i"}-${ii}`} style={{ ...row, padding: "7px 0" }}>
          <span style={{ width: 20, color: i.done ? green : "#D1D5DB", font: "800 14px 'DM Sans',sans-serif" }}>{i.done ? "✓" : "○"}</span>
          <span style={{ flex: 1, color: i.done ? sub : ink, textDecoration: i.done ? "line-through" : "none" }}>{i.label}</span>
          {!i.done && <button type="button" style={{ ...btn(true), height: 36, /* v329: was 30 */ padding: "0 12px", fontSize: 12 }} onClick={() => { close?.(); navigate(`/settings?section=${i.section}&from=eva`); }}>Fix</button>}
        </div>
      ))}
      {/* v419: fill the missing details right here in the chat — Eva saves them. */}
      {ps.score < 100 && onSay && <button type="button" data-testid="eva-fill-in-chat" style={{ ...btn(false), width: "100%", height: 40, marginTop: 8 }} onClick={() => onSay("Fill my details here", "Complete my profile in chat")}>Fill missing details here ✨</button>}
    </div>
  );
}

// v333 (Ravi: "script ki jagah normal ek box"): a script reads like a script — HOOKS / SCRIPT / CAPTION as
// sections, each with its own Copy, plus "Copy all". Plain text (a bio) stays one block.
const SECTION_RX = /^(HOOKS?|SCRIPT(\s*\(.*\))?|CAPTION|HASHTAGS?|PITCH|BIO)\s*:?\s*$/i;
export function splitSections(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const l = raw.replace(/^\*+|\*+$/g, "").trim();
    if (SECTION_RX.test(l)) { cur = { title: l.replace(/:$/, "").toUpperCase(), body: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title: "", body: [] }; out.push(cur); }
    cur.body.push(raw.replace(/\*\*/g, ""));
  }
  return out.map((x) => ({ title: x.title, body: x.body.join("\n").trim() })).filter((x) => x.body);
}
function CopyCard({ c: d, close }) {
  const navigate = useNavigate();
  const [done, setDone] = useState("");
  const parts = splitSections(d.text);
  const doCopy = (txt, k) => { copy(txt); setDone(k); setTimeout(() => setDone((v) => (v === k ? "" : v)), 1600); };
  const sectioned = parts.length > 1 || (parts[0] && parts[0].title);
  return (
    <div style={card} data-testid="eva-copy">
      {sectioned ? parts.map((p, i) => (
        <div key={i} style={{ padding: "8px 0", borderTop: i ? `1px solid ${line}` : "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
            <span style={{ font: "800 11px 'DM Sans',sans-serif", letterSpacing: ".08em", color: sub }}>{p.title || (d.title || "TEXT").toUpperCase()}</span>
            <button type="button" onClick={() => doCopy(p.body, `s${i}`)} aria-label={`Copy ${p.title || "text"}`}
              style={{ border: "none", background: "transparent", color: "#15803D", font: "700 12px 'DM Sans',sans-serif", cursor: "pointer", padding: "4px 6px", minHeight: 28 }}>
              {done === `s${i}` ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{p.body}</div>
        </div>
      )) : <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{d.text}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        {d.section && <button type="button" style={btn(false)} onClick={() => { copy(d.text); close?.(); navigate(`/settings?section=${d.section}&from=eva`); }}>Copy & open {d.section}</button>}
        <button type="button" style={btn(true)} onClick={() => doCopy(d.text, "all")}>{done === "all" ? "Copied ✓" : sectioned ? "Copy all" : "Copy"}</button>
      </div>
    </div>
  );
}

function Brief({ c: d }) {
  const [ticks, setTicks] = useState(() => new Set());
  const b = d.brief;
  return (
    <div style={card} data-testid="eva-brief">
      <div style={{ font: "800 14px 'DM Sans',sans-serif", marginBottom: 6 }}>{b.title}</div>
      {b.lines.map((l, i) => <div key={i} style={{ padding: "2px 0" }}>{l}</div>)}
      {b.dos?.length ? <div style={{ marginTop: 8 }}><b>Do:</b> {b.dos.join(" · ")}</div> : null}
      {b.donts?.length ? <div style={{ marginTop: 4 }}><b>Don't:</b> {b.donts.join(" · ")}</div> : null}
      {d.checklist?.length ? (
        <div style={{ marginTop: 10, borderTop: `1px solid ${line}`, paddingTop: 8 }}>
          <div style={{ font: "800 12px 'DM Sans',sans-serif", color: sub, marginBottom: 4 }}>BEFORE YOU SUBMIT ({ticks.size}/{d.checklist.length})</div>
          {d.checklist.map((x, i) => (
            <button type="button" key={i} onClick={() => setTicks((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
              style={{ display: "flex", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", padding: "5px 0", cursor: "pointer", color: ink, font: "500 13px 'DM Sans',sans-serif" }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${ticks.has(i) ? green : "#D1D5DB"}`, background: ticks.has(i) ? green : "#fff", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ticks.has(i) ? "✓" : ""}</span>
              {x}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkList({ c: d, close }) {
  const navigate = useNavigate();
  return (
    <div style={card} data-testid="eva-due">
      {d.items.map((a, ai) => (
        <div key={`${a.key || a.text || "a"}-${ai}`} style={row}>
          <div style={{ flex: 1, minWidth: 0, color: a.urgent ? "#B91C1C" : ink, ...wrap }}>{a.text}</div>
          {a.link && <button type="button" style={{ ...btn(true), height: 36 /* v329: was 32 */ }} onClick={() => { close?.(); navigate(a.link); }}>{a.cta || "Open"}</button>}
        </div>
      ))}
    </div>
  );
}

function Earnings({ c: { s = {} }, close, onSay }) {
  const navigate = useNavigate();
  const n = (v) => Number(v) || 0; // v329: a missing total showed "₹NaN"
  const paid = s.paidCount ?? s.deals; // v329: "paid jobs" counts only money that reached the bank (approved ones are listed above)
  const empty = !n(s.month) && !n(s.total) && !n(s.pending) && !n(s.approved) && !n(s.deals) && !n(s.pendingCount);
  // v329: with nothing earned yet the card was three "₹0" boxes and "0 paid jobs" — say so and offer the next step.
  if (empty) return (
    <div style={card} data-testid="eva-earnings">
      <div style={{ font: "800 14px 'DM Sans',sans-serif" }}>No earnings yet</div>
      <div style={{ color: sub, marginTop: 4 }}>Your first payout shows up here once a brand approves your work.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(false)} onClick={() => { close?.(); navigate("/earnings"); }}>Open earnings</button>
        <button type="button" style={btn(true)} onClick={() => onSay?.("Show campaigns for me")}>Find campaigns</button>
      </div>
    </div>
  );
  const box = (label, v) => <div style={{ flex: 1, minWidth: 0, background: "#F0FDF4", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}><div style={{ font: "700 10.5px 'DM Sans',sans-serif", color: sub, textTransform: "uppercase" }}>{label}</div><div style={{ font: "800 15px 'DM Sans',sans-serif", marginTop: 3 }}>{v}</div></div>;
  return (
    <div style={card} data-testid="eva-earnings">
      <div style={{ display: "flex", gap: 6 }}>{box("This month", inr(n(s.month)))}{box("Total paid", inr(n(s.total)))}{box("Coming", inr(n(s.pending)))}</div>
      {/* v328: RELEASED = approved, payout next (not "paid"); no "next payout" date — the backend never sends one */}
      {s.approvedCount ? <div data-testid="eva-earnings-approved" style={{ marginTop: 8, background: "#F7F7FA", borderRadius: 12, padding: "8px 10px" }}><b>Approved · payout next:</b> {inr(n(s.approved))}{s.approvedCount > 1 ? ` (${s.approvedCount} jobs)` : ""}</div> : null}
      <div style={{ marginTop: 8, color: sub }}>{n(paid)} paid job{n(paid) === 1 ? "" : "s"} on Ybex{s.pendingCount ? ` · ${s.pendingCount} payout${s.pendingCount > 1 ? "s" : ""} on the way` : ""}.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}><button type="button" style={btn(true)} onClick={() => { close?.(); navigate("/earnings"); }}>Open earnings</button></div>
    </div>
  );
}

function Ideas({ c: d }) {
  return (
    <div style={card} data-testid="eva-ideas">
      {d.ideas.map((x, i) => <div key={i} style={{ ...row, padding: "7px 0" }}><span style={{ font: "800 13px 'DM Sans',sans-serif", color: green, width: 18 }}>{i + 1}</span><span style={{ flex: 1 }}>{x}</span></div>)}
      {d.tips?.length ? <div style={{ marginTop: 8 }}>{d.tips.map((t, i) => <div key={i} style={{ padding: "2px 0", color: sub }}>💡 {t}</div>)}</div> : null}
    </div>
  );
}

function Refer({ c: d }) {
  const code = referralCodeFor(d.user);
  const link = referralLinkFor(d.user);
  // v329: no "Use my code :" when the code is missing (user not loaded) — the link alone still works.
  const msg = `Join me on Ybex — brands pay creators for reels & UGC videos, money is held safely till you deliver. ${code ? `Use my code ${code}: ` : "Join here: "}${link}`;
  return (
    <div style={card} data-testid="eva-refer">
      <div style={{ color: sub, fontSize: 12 }}>Your code</div>
      <div style={{ font: "800 22px 'DM Sans',sans-serif", letterSpacing: "1px" }}>{code || "—"}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(false)} onClick={() => copy(msg)}>Copy invite</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><SocialLogo platform="whatsapp" size={15} />Share on WhatsApp</a>
      </div>
    </div>
  );
}

/** A 1080×1920 story image drawn on a canvas (green, the creator's name and wins) + share / save. */
function Share({ c: d }) {
  const [busy, setBusy] = useState(false);
  const name = String(d.name || "").trim() || "Creator"; // v329: no "undefined" on the story
  const line2 = d.deals ? `${d.deals} brand deal${d.deals > 1 ? "s" : ""} done` : `${d.niche || "Content"} creator`;
  // v329: shrink (then cut with "…") a long name / niche so it never runs off the 1080px story.
  const fit = (x, text, weight, size, maxW) => {
    let s = size;
    x.font = `${weight} ${s}px 'DM Sans', sans-serif`;
    while (s > 36 && x.measureText(text).width > maxW) { s -= 4; x.font = `${weight} ${s}px 'DM Sans', sans-serif`; }
    let t = text;
    while (t.length > 1 && x.measureText(t).width > maxW) t = Array.from(t).slice(0, -2).join("") + "…";
    return t;
  };
  const make = () => new Promise((resolve) => {
    const cv = document.createElement("canvas");
    cv.width = 1080; cv.height = 1920;
    const x = cv.getContext("2d");
    const g = x.createLinearGradient(0, 0, 1080, 1920);
    g.addColorStop(0, "#14532D"); g.addColorStop(0.55, "#1F7A35"); g.addColorStop(1, "#4CC765");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    const glow = x.createRadialGradient(820, 520, 20, 820, 520, 520);
    glow.addColorStop(0, "rgba(198,242,78,.55)"); glow.addColorStop(1, "rgba(198,242,78,0)");
    x.fillStyle = glow; x.fillRect(0, 0, 1080, 1920);
    x.fillStyle = "#fff"; x.textAlign = "left";
    x.font = "700 64px 'DM Sans', sans-serif"; x.fillText("YBEX", 90, 170);
    x.font = "300 92px 'DM Sans', sans-serif"; x.fillText("I'm a creator", 90, 760);
    x.font = "800 108px 'DM Sans', sans-serif"; x.fillText("on Ybex ✨", 90, 890);
    x.fillText(fit(x, name, 700, 64, 900), 90, 1080);
    x.fillStyle = "rgba(255,255,255,.9)";
    x.fillText(fit(x, line2, 500, 52, 900), 90, 1170);
    x.font = "500 52px 'DM Sans', sans-serif";
    x.fillText("Brands, collab with me on Ybex", 90, 1640);
    cv.toBlob((b) => resolve(b), "image/png");
  });
  const share = async () => {
    setBusy(true);
    try {
      const blob = await make();
      if (!blob) throw new Error("no image"); // v329: a failed canvas made a "null" file
      const file = new File([blob], "ybex-creator.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: "I'm a creator on Ybex ✨" });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ybex-creator.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast.success("Saved — post it on your story"); }
    } catch (e) { if (e?.name !== "AbortError") toast.error("Couldn't make the image — please try again"); /* v329: only a cancelled share stays silent */ } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, background: "linear-gradient(160deg,#14532D,#1F7A35 55%,#4CC765)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} data-testid="eva-share">
      <div style={{ font: "700 12px 'DM Sans',sans-serif", opacity: 0.9 }}>YBEX</div>
      <div style={{ font: "300 20px/1.15 'DM Sans',sans-serif", marginTop: 18 }}>I'm a creator</div>
      <div style={{ font: "800 24px/1.1 'DM Sans',sans-serif" }}>on Ybex ✨</div>
      <div style={{ font: "700 15px 'DM Sans',sans-serif", marginTop: 10, ...wrap }}>{name}</div>
      <div style={{ opacity: 0.9, ...wrap }}>{line2}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button type="button" style={{ ...btn(false), color: green }} onClick={share} disabled={busy}>{busy ? "Making…" : "Share to story"}</button></div>
    </div>
  );
}

function Handoff({ c: d }) {
  return (
    <div style={card}>
      <div style={{ whiteSpace: "pre-wrap", color: sub, fontSize: 12 }}>{d.text}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <a href={`https://wa.me/${d.number}?text=${encodeURIComponent(d.text)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><SocialLogo platform="whatsapp" size={15} />WhatsApp the team</a>
      </div>
    </div>
  );
}

function Chips({ c: d, onSay }) {
  const last = React.useRef(0); // v329: a quick double tap sent the same message twice
  const [open, setOpen] = React.useState(false);
  const tap = (x) => { const now = Date.now(); if (now - last.current < 900) return; last.current = now; onSay?.(x.label, x.value); };
  // v333 (Ravi / Eva design §8b): "What can you do?" = 5 popular chips + "Show more ▾ (n more)" — never one long box.
  const more = Array.isArray(d.more) ? d.more : [];
  const list = open ? [...(d.chips || []), ...more] : (d.chips || []);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((x, xi) => <button key={`${x.label}-${xi}`} type="button" className="eva-press eva-in" style={glassChip} onClick={() => tap(x)}>{x.label}</button>)}
      {more.length > 0 && (
        <button type="button" className="eva-press" aria-expanded={open} data-testid="eva-chips-more" onClick={() => setOpen((v) => !v)}
          style={{ ...glassChip, background: "transparent", borderStyle: "dashed" }}>
          {open ? "Show less ▴" : `Show more ▾ (${more.length} more)`}
        </button>
      )}
    </div>
  );
}
function Caps({ c: d, onSay }) {
  // v333: an old saved chat with the long "caps" box now shows the chips instead.
  return <Chips c={{ chips: CREATOR_POPULAR, more: CREATOR_MORE }} onSay={onSay} />;
}

// v419: the free invoice maker (loaded only when used).
const LazyInvoice = React.lazy(() => import("../invoice/EvaInvoice"));
const InvoiceOpen = ({ c }) => <React.Suspense fallback={null}><LazyInvoice c={c} /></React.Suspense>;
const VIEWS = { invoice: InvoiceOpen, opps: Opps, apply: Apply, invites: Invites, alertToggle: AlertToggle, insights: Lines, rate: Rate, profile: Profile, copy: CopyCard, brief: Brief, due: LinkList, steps: LinkList, earnings: Earnings, ideas: Ideas, refer: Refer, share: Share, handoff: Handoff, chips: Chips, caps: Caps };

export default function CreatorCard({ card: c, onSay, close }) {
  const View = VIEWS[c?.type];
  if (!View) return null;
  return <View c={c} onSay={(label, value) => onSay?.(label, value ?? label)} close={close} />;
}
