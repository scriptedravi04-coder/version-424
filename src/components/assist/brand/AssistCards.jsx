import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { inr } from "../../feedback/assistKnowledge";
import { nameOf, followersOf, reachOf, nicheOf, cid, shortNum, UGC_FORMATS, describeFilters } from "./brandLogic";
import { openUgcDraft, openCampaignDraft, saveSearch } from "./tools";
import { isLiveQuestion } from "./brain";
import SocialLogo from "../../common/SocialLogo"; // v364: real platform logos

// Session 51 (Ravi): the cards Ybex Assist shows inside the brand chat — like product cards in a shopping
// chat. Plain white cards on the green chat so numbers stay easy to read. Every button either opens an
// existing app screen (prefilled) or a sheet the app already has; nothing here pays or sends by itself.

const ink = "#0F2A14", sub = "#4B5563", line = "#E5E7EB", green = "#15803D";
// Session 53 (Eva): frosted white glass on the green chat — numbers stay easy to read, the chat shows through.
const card = { background: "rgba(255,255,255,.9)", backdropFilter: "blur(18px) saturate(140%)", WebkitBackdropFilter: "blur(18px) saturate(140%)", border: "1px solid rgba(255,255,255,.65)", borderRadius: 22, padding: 14, color: ink, boxShadow: "0 18px 36px -22px rgba(0,40,0,.8)", font: "500 13px/1.4 'DM Sans',sans-serif", width: "100%", boxSizing: "border-box" };
const glassChip = { height: 40, /* v329: 40px tap target (was 34) */ padding: "0 14px", borderRadius: 17, border: "1px solid rgba(255,255,255,.45)", background: "rgba(255,255,255,.16)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", color: "#fff", font: "700 12.5px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const btn = (primary) => ({ height: 40, /* v329: 40px tap target (was 38) */ padding: "0 14px", borderRadius: 19, border: primary ? "none" : `1px solid ${line}`, background: primary ? green : "#fff", color: primary ? "#fff" : ink, font: "700 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });
const h = { font: "800 14px/1.3 'DM Sans',sans-serif", margin: "0 0 8px", overflowWrap: "anywhere", wordBreak: "break-word" }; // v329: a long one-word title can't push the card wider

// v329: a missing number shows ₹0 / "—", never "₹NaN" or "undefined" (inr(undefined) printed ₹NaN).
const num = (n) => Number(n) || 0;
const rs = (n) => inr(num(n));
const ell = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
const wrapText = { overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0 };
// v329: "Copied" was shown even when the clipboard refused (writeText's promise was never awaited).
const copyText = async (text) => { try { await navigator.clipboard.writeText(String(text || "")); toast.success("Copied"); } catch { toast.error("Couldn't copy — select and copy by hand"); } };
// v329: first letter without splitting an emoji / Hindi letter in half; an empty name → "?".
const firstChar = (text) => (Array.from(String(text || "").trim())[0] || "?").toUpperCase();

function Avatar({ c }) {
  const pic = c?.profile_picture || c?.picture || c?.photo || c?.avatar_url || c?.profile_image;
  const [bad, setBad] = useState(false); // v329: a dead photo URL showed a broken-image icon — fall back to the initial
  return pic && !bad
    ? <img src={pic} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: 40, height: 40, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#F3F4F6" }} />
    : <div style={{ width: 40, height: 40, borderRadius: 12, background: "#DCFCE7", color: green, display: "flex", alignItems: "center", justifyContent: "center", font: "800 15px 'DM Sans',sans-serif", flexShrink: 0 }}>{firstChar(nameOf(c))}</div>;
}

// Session 53 (Ravi: "jo dashboard pe 'Meet our creators' ka UI hai sim vaisa hi rakh … piche little little glow"):
// creators show as the same photo cards as brand home — 3 columns, soft colour glow behind each card, a slow
// float. Tap a card to pick it (tick), the small arrow opens the profile; picked ones are invited together.
const GLOW = ["#7C3AED", "#F43F5E", "#0EA5E9", "#EC4899", "#F97316", "#B45309"];
const COL = [{ pt: 6, h: 150, f: 3.5, d: 6.2 }, { pt: 24, h: 154, f: 4, d: 6.8 }, { pt: 0, h: 148, f: 3.5, d: 6.5 }];
const photoOf = (c) => c?.profile_picture || c?.picture || c?.photo || c?.avatar_url || c?.profile_image || "";

// Session 58 (Eva handoff §7.1): results are a horizontal, swipeable row of photo cards (like Home's
// "Meet the Creators"): photo, name, AVG REACH, soft colour glow, slow float. Tap = tick (lime glow ring).
// Rates are private — no rate anywhere on these cards and no lowest-rate sort.
function CreatorTile({ c, idx, on, onToggle, onOpen }) {
  const reach = reachOf(c) || followersOf(c);
  const [bad, setBad] = useState(false); // v329: a dead photo left an empty dark tile — show the initial instead
  return (
    <div style={{ position: "relative", flex: "0 0 136px", height: 184, scrollSnapAlign: "start", animation: `ybFloat${idx % 3} ${6.2 + (idx % 3) * 0.4}s ease-in-out ${idx * 0.3}s infinite, evaCardIn .55s cubic-bezier(.22,1,.36,1) ${idx * 0.08}s both` }}>
      <div style={{ position: "absolute", inset: "14px 6px -8px", borderRadius: 22, background: GLOW[idx % GLOW.length], opacity: 0.6, filter: "blur(18px)", transform: "translateZ(0)" }} />
      <button type="button" onClick={onToggle} aria-pressed={on} aria-label={`${on ? "Unselect" : "Select"} ${nameOf(c)}`} data-testid="assist-creator-tick"
        style={{ position: "relative", display: "block", width: "100%", height: "100%", padding: 0, borderRadius: 20, overflow: "hidden", background: "#16161B", border: on ? "2px solid #C6F432" : "1px solid rgba(255,255,255,.1)", boxShadow: on ? "0 0 0 4px rgba(198,244,50,.35), 0 0 22px 2px rgba(198,244,50,.55)" : "0 10px 22px -12px rgba(18,18,26,.65)", cursor: "pointer", transition: "box-shadow .25s ease, transform .18s cubic-bezier(.34,1.56,.64,1)" }}
        className="eva-press">
        {photoOf(c) && !bad
          ? <img src={photoOf(c)} alt="" loading="lazy" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={() => setBad(true)} />
          : <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.75)", font: "800 34px 'DM Sans',sans-serif" }}>{firstChar(nameOf(c))}</span>}
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "30px 10px 10px", background: "linear-gradient(180deg,rgba(10,10,10,0) 0%,rgba(10,10,10,.88) 100%)", textAlign: "left" }}>
          <span style={{ display: "block", font: "700 13px/1.2 'DM Sans',sans-serif", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(c)}</span>
          {reach ? (
            <span style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
              <span style={{ font: "700 12px 'DM Sans',sans-serif", color: "#fff" }}>{shortNum(reach)}</span>
              <span style={{ font: "600 8px 'DM Sans',sans-serif", letterSpacing: ".5px", color: "rgba(255,255,255,.75)" }}>{reachOf(c) ? "AVG REACH" : "FOLLOWERS"}</span>
            </span>
          ) : nicheOf(c) ? <span style={{ display: "block", marginTop: 2, font: "600 10px 'DM Sans',sans-serif", color: "rgba(255,255,255,.8)" }}>{nicheOf(c)}</span> : null}
        </span>
        {on && (
          <span style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, background: "#C6F432", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(0,0,0,.3)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#14532D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
        )}
      </button>
      {/* v329: 40px tap area around the small 26px arrow (a near miss ticked the card instead of opening the profile) */}
      <button type="button" onClick={onOpen} aria-label={`Open ${nameOf(c)}'s profile`}
        style={{ position: "absolute", top: 1, left: 1, width: 40, height: 40, padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <span style={{ width: 26, height: 26, borderRadius: 13, background: "rgba(0,0,0,.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
        </span>
      </button>
    </div>
  );
}

function Creators({ c: cardData, onInvite, close }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState(() => new Set());
  const [sort, setSort] = useState(cardData.filters?.sort === "rate" ? "" : cardData.filters?.sort || "");
  const items = useMemo(() => {
    const by = { reach: (a, b) => reachOf(b) - reachOf(a), followers: (a, b) => followersOf(b) - followersOf(a) };
    return sort && by[sort] ? [...cardData.items].sort(by[sort]) : cardData.items;
  }, [cardData.items, sort]);
  const toggle = (id) => { try { navigator.vibrate?.(8); } catch { /* no haptics */ } setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const picked = items.filter((c) => sel.has(String(cid(c))));
  const shown = items.slice(0, 12);
  const [alertSt, setAlert] = useState("idle"); // v329: "Alert me" could be tapped again while saving (saved twice)
  const from = num(cardData.from); // v329: page 2 said "Showing 12 of 40 · say show more" even on the last page
  const total = num(cardData.total) || items.length;
  const pill = (active) => ({ ...glassChip, height: 36, /* v329: was 30 */ padding: "0 12px", font: "700 11.5px 'DM Sans',sans-serif", background: active ? "#fff" : glassChip.background, color: active ? "#14532D" : "#fff" });
  const alertMe = async () => {
    if (alertSt !== "idle") return;
    setAlert("busy");
    const where = await saveSearch(cardData.filters, describeFilters(cardData.filters) || "my search").catch(() => null);
    if (!where) { setAlert("idle"); toast.error("Couldn't save the alert — please try again"); return; } // v329: a failure said "Saved"
    setAlert("on");
    toast.success(where === "server" ? "Saved — you'll get a phone notification when new creators match" : "Saved — I'll tell you when new creators match");
  };
  return (
    <div data-testid="assist-creators" style={{ width: "100%" }}>
      <style>{"@keyframes ybFloat0{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}@keyframes ybFloat1{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes ybFloat2{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}@keyframes evaCardIn{0%{opacity:0;filter:blur(12px);transform:translateX(30px) scale(.9)}100%{opacity:1;filter:blur(0);transform:none}}"}</style>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["", "Best"], ["reach", "Reach"], ["followers", "Followers"]].map(([k, l]) => (
          <button key={k || "best"} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} style={pill(sort === k)}>{l}</button>
        ))}
        {/* v329: picks the top 5 the brand can SEE (it used the full list; with "Reach" sort they matched, but a 6th+ hidden one could be picked) */}
        <button type="button" onClick={() => setSel(new Set(shown.slice(0, 5).map((c) => String(cid(c)))))} style={pill(false)}>Top {Math.min(5, shown.length)}</button>
      </div>
      <div className="no-scrollbar" data-testid="assist-creators-row" style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollPaddingLeft: 22, padding: "26px 22px 34px", margin: "-20px -22px -24px", marginRight: -18, /* v329: -22 reached 2px past the chat's own padding → the whole chat could be dragged sideways */ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {/* Session 58 (Ravi: "glow cut kyu ho raha hai"): a scrolling row clips everything outside its box, so the
            row gets room on every side for the glow and the lime ring (negative margin keeps the layout the same). */}
        {shown.map((c, idx) => {
          const id = String(cid(c));
          return <CreatorTile key={id} c={c} idx={idx} on={sel.has(id)} onToggle={() => toggle(id)} onOpen={() => { close?.(); navigate(`/creator/${id}`); }} />;
        })}
      </div>
      {(from > 0 || total > shown.length) && <div style={{ color: "rgba(255,255,255,.85)", margin: "0 0 6px", font: "600 11.5px 'DM Sans',sans-serif" }}>
        {from > 0 ? `Showing ${from + 1}–${from + shown.length} of ${total}.` : `Showing ${shown.length} of ${total}.`}{from + shown.length < total ? ' Say "show more" for the next ones.' : ""}
      </div>}
      <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {cardData.filters && (
          <button type="button" style={{ ...glassChip, opacity: alertSt === "busy" ? 0.7 : 1 }} disabled={alertSt !== "idle"} aria-busy={alertSt === "busy"} onClick={alertMe}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></svg>
            {alertSt === "on" ? "✓ Alert on" : alertSt === "busy" ? "Saving…" : "Alert me"}
          </button>
        )}
        <button type="button" style={{ ...glassChip, background: "#C6F432", color: "#14532D", border: "none", opacity: picked.length ? 1 : 0.6, cursor: picked.length ? "pointer" : "default" }} disabled={!picked.length} data-testid="assist-invite"
          onClick={() => { if (!picked.length) return; onInvite?.(picked, cardData.filters?.maxRate || 0); setSel(new Set()); /* v329: the ticks + lime rings stayed after inviting */ }}>{picked.length ? `Invite ${picked.length}` : "Tick to invite"}</button>
      </div>
    </div>
  );
}

function Compare({ c: d, close }) {
  const navigate = useNavigate();
  const rows = d.rows.filter((r) => r.creator);
  // Session 58: rates are private from brands, so no "best value" (reach per ₹) — just the biggest reach.
  const best = rows.length > 1 ? rows.reduce((b, r) => (reachOf(r.creator) > (b ? reachOf(b.creator) : 0) ? r : b), null) : null;
  const cell = { padding: "7px 6px", borderBottom: `1px solid ${line}`, textAlign: "right", whiteSpace: "nowrap" };
  return (
    <div style={card} data-testid="assist-compare">
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead><tr>{["Creator", "Niche", "City", "Followers", "Avg reach"].map((x, i) => <th key={x} style={{ ...cell, textAlign: i ? "right" : "left", color: sub, font: "700 11px 'DM Sans',sans-serif" }}>{x}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = r.creator;
              return (
                <tr key={String(cid(c))} style={{ background: best === r ? "#F0FDF4" : undefined }}>
                  {/* v329: a long name is cut with "…" (it stretched the table so the numbers scrolled out of view); 40px tap height */}
                  <td style={{ ...cell, textAlign: "left", maxWidth: 120 }}><button type="button" title={nameOf(c)} onClick={() => { close?.(); navigate(`/creator/${cid(c)}`); }} style={{ ...ell, display: "block", maxWidth: 120, minHeight: 32, background: "none", border: "none", padding: 0, font: "800 12.5px 'DM Sans',sans-serif", color: green, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", textAlign: "left" }}>{nameOf(c)}</button></td>
                  {/* Session 58 (handoff hard rule 4): creator rates are private — no Rate / Reach-per-₹1k columns. */}
                  <td style={cell}>{nicheOf(c) || "—"}</td>
                  <td style={cell}>{c.city || c.location || "—"}</td>
                  <td style={cell}>{followersOf(c) ? shortNum(followersOf(c)) : "—"}</td>
                  <td style={{ ...cell, fontWeight: best === r ? 800 : 500, color: best === r ? green : ink }}>{reachOf(c) ? shortNum(reachOf(c)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.rows.some((r) => !r.creator) && <div style={{ color: sub, fontSize: 11.5, marginTop: 6 }}>Not found: {d.rows.filter((r) => !r.creator).map((r) => r.query).join(", ")}</div>}
      {best && <div style={{ marginTop: 8, fontSize: 12.5 }}>Highest reach: <b>{nameOf(best.creator)}</b></div>}
    </div>
  );
}

function Applicants({ c: d, close }) {
  const navigate = useNavigate();
  const id = d.campaign?.campaign_id || d.campaign?.id;
  const rows = d.rows || [];
  const max = Math.max(1, ...rows.map((r) => num(r.score))); // v329: a missing score made the bar width "NaN%"
  const total = num(d.total) || rows.length; // v329: "Open all undefined applicants"
  return (
    <div style={card} data-testid="assist-applicants">
      {!rows.length && <div style={{ color: sub, padding: "4px 0 2px" }}>No applications yet. Share the campaign or invite creators — new applicants show up here.</div>}
      {rows.map((r, i) => (
        <div key={String(r.app?.application_id || cid(r.creator) || i)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${line}` }}>
          <div style={{ width: 20, color: sub, font: "800 12px 'DM Sans',sans-serif" }}>{i + 1}</div>
          <Avatar c={r.creator} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 13px 'DM Sans',sans-serif", ...ell }}>{nameOf(r.creator)}</div>{/* v329: long names end in "…" */}
            <div style={{ color: sub, fontSize: 11.5, ...wrapText }}>{(r.why || []).join(" · ") || "profile data missing"}</div>
            <div style={{ height: 4, borderRadius: 2, background: "#F3F4F6", marginTop: 4 }}><div style={{ width: `${Math.max(6, Math.min(100, (num(r.score) / max) * 100))}%`, height: 4, borderRadius: 2, background: green }} /></div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" style={btn(true)} onClick={() => { close?.(); navigate(id ? `/brand/campaigns/${id}/applicants` : "/brand/campaigns"); }}>{total ? `Open all ${total} applicant${total === 1 ? "" : "s"}` : "Open the campaign"}</button>
      </div>
    </div>
  );
}

function Alerts({ c: d, close }) {
  const navigate = useNavigate();
  return (
    <div style={card} data-testid="assist-alerts">
      {d.items.map((a) => (
        <div key={a.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${line}` }}>
          <div style={{ flex: 1, ...wrapText }}>{a.text}</div>{/* v329: a long campaign title wraps instead of pushing the button out */}
          {a.link && <button type="button" style={{ ...btn(true), height: 36, flexShrink: 0 }} onClick={() => { close?.(); navigate(a.link); }}>{a.cta || "Open"}</button>}
        </div>
      ))}
    </div>
  );
}

function Report({ c: d }) {
  const r = d.report;
  // v329: missing numbers show 0 (was "₹NaN" / an empty tile); avg hours rounded.
  const tiles = [["Spent", r.spent == null ? "—" : rs(r.spent)], ["Videos delivered", num(r.videos)], ["Creators", num(r.creators)], ["Avg delivery", num(r.avgHours) ? `${Math.round(num(r.avgHours))} h` : "—"], ["Live campaigns", num(r.liveCampaigns)]];
  return (
    <div style={card} data-testid="assist-report">
      <div style={h}>{r.monthName}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {tiles.map(([k, v]) => <div key={k} style={{ background: "#F0FDF4", borderRadius: 12, padding: "8px 10px" }}><div style={{ color: sub, fontSize: 11 }}>{k}</div><div style={{ font: "800 16px 'DM Sans',sans-serif" }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" style={btn(false)} onClick={() => copyText(d.text)}>Copy</button>{/* v329: real success / failure toast */}
        <button type="button" style={btn(true)} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(d.text || "")}`, "_blank", "noopener")}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><SocialLogo platform="whatsapp" size={15} />Share on WhatsApp</span></button>
      </div>
    </div>
  );
}

function UgcDraft({ c: d, close }) {
  const navigate = useNavigate();
  const x = d.draft;
  const fmt = UGC_FORMATS.find((f) => f.key === x.deliverable_type);
  const sub1 = num(x.budget) * num(x.max_creators); // v329: a missing field gave "₹NaN"
  return (
    <div style={card} data-testid="assist-ugc-draft">
      <div style={h}>{x.title || "UGC brief"}</div>
      {/* v329: no "undefined" when duration / delivery hours are missing; long text wraps */}
      {[["Product", x.product_name || "—"], ["Format", [fmt?.label || x.deliverable_type, x.video_duration].filter(Boolean).join(" · ") || "—"], ["Videos", `${num(x.max_creators) || 1} × ${rs(x.budget)}`], ["Delivery", num(x.delivery_hours) ? `${num(x.delivery_hours)} h` : "—"], ["Requirements", x.detailed_requirements || "—"]].map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: `1px solid ${line}` }}><span style={{ color: sub, flexShrink: 0 }}>{k}</span><span style={{ textAlign: "right", fontWeight: 700, maxWidth: "65%", ...wrapText }}>{v}</span></div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, font: "800 14px 'DM Sans',sans-serif" }}><span>Videos total</span><span>{rs(sub1)}</span></div>
      <div style={{ color: sub, fontSize: 11.5, marginTop: 2 }}>Convenience fee + GST are added on the payment screen. Money stays in the secure payment hold until you approve.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" style={btn(true)} data-testid="assist-ugc-pay" onClick={() => { const to = openUgcDraft(x); close?.(); navigate(to); }}>Review & Pay now</button>
      </div>
    </div>
  );
}

// Session 58 (Eva handoff §7.2): Niche, Platforms, Reach tiers, Payout per creator, Deliverables, Applications
// close, Targeting + "Publishing this brief · Free · ₹0" / "Payment hold funded · Only on hiring".
// Save as draft (left) / Review & Publish (right) — both only write `campaign_draft`; the brand publishes there.
function CampaignDraft({ c: d, close }) {
  const navigate = useNavigate();
  const x = d.draft;
  const payout = x.isBudgetRange && x.budgetMin && x.budgetMax && x.budgetMin !== x.budgetMax ? `${inr(Number(x.budgetMin))} – ${inr(Number(x.budgetMax))}` : x.budget || x.budgetMax ? inr(Number(x.budget || x.budgetMax)) : "set on the next screen";
  // v329: IST date (a phone on another time zone showed the day before); a bad date says "in 14 days", not "Invalid Date".
  const dl = x.deadline ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(x.deadline)) ? `${x.deadline}T12:00:00+05:30` : x.deadline) : null;
  const closes = dl && !Number.isNaN(dl.getTime()) ? dl.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "in 14 days";
  const [saved, setSaved] = useState(false);
  return (
    <div style={card} data-testid="assist-campaign-draft">
      <div style={{ font: "700 10.5px 'DM Sans',sans-serif", letterSpacing: 1, color: green, marginBottom: 4 }}>CAMPAIGN DRAFT</div>
      <div style={h}>{x.campaignTitle || "New campaign"}</div>
      {x.requirementsText ? <div style={{ color: sub, fontSize: 12.5, marginBottom: 6, ...wrapText }}>{x.requirementsText}</div> : null}
      {[["Niche", (x.selectedCategories || []).join(", ") || "—"], ["Platforms", (x.selectedPlatforms || []).join(", ") || "Instagram"], ["Reach tiers", (x.selectedFollowerRanges || []).join(", ") || "Micro"], ["Payout per creator", payout], ["Deliverables", x.deliverablesText || "—"], ["Applications close", closes], ["Targeting", `${x.gender || "Any"} · ${(x.selectedLanguages || ["Hindi", "English"]).join(", ")} · ${(x.selectedLocations || []).join(", ") || "Pan India"} · ${x.creatorsNeeded || "5–15"} creators`], ["Publishing this brief", "Free · ₹0"], ["Payment hold funded", "Only on hiring"]].map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: `1px solid ${line}` }}><span style={{ color: sub, flexShrink: 0 }}>{k}</span><span style={{ textAlign: "right", fontWeight: 700, ...wrapText }}>{v}</span></div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        {/* v329: the button now shows it saved (a second tap only repeated the toast); a failed save says so */}
        <button type="button" style={{ ...btn(false), color: saved ? green : ink }} data-testid="assist-campaign-save" onClick={() => { try { openCampaignDraft(x, "step1"); setSaved(true); toast.success("Draft saved. Open Create campaign any time to finish it."); } catch { toast.error("Couldn't save the draft on this phone"); } }}>{saved ? "✓ Saved" : "Save as draft"}</button>
        <button type="button" style={btn(true)} data-testid="assist-campaign-open" onClick={() => { const to = openCampaignDraft(x, x.openAdvanced ? "advanced" : "review"); toast("Opening Create campaign · Review & launch"); close?.(); navigate(to); }}>Review & Publish</button>
      </div>
    </div>
  );
}

// Session 58 (Eva handoff §6): the glass question box under Eva's question — label, "n of N", lime progress,
// big options with a chevron; free-text questions get a text box + Next and suggestions under "OR PICK ONE".
function Question({ c: q, onSay }) {
  const [val, setVal] = useState("");
  const [done, setDone] = useState(false);
  // v328: an older question box (another flow / an answered field) no longer sends its answer into the open question.
  const answer = (label, value) => {
    if (done) return;
    setDone(true);
    if (q.flow && q.field && !isLiveQuestion(q.flow, q.field)) { toast("That question is closed — answer the latest one below."); return; }
    // v328 review: Eva still answering → the tap was ignored, so keep the box open for another try.
    if (onSay?.(String(label), value !== undefined ? value : label) === false) setDone(false);
  };
  const glassBox = { background: "linear-gradient(160deg,rgba(255,255,255,.24),rgba(255,255,255,.12))", border: "1px solid rgba(255,255,255,.24)", backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)", borderRadius: 24, padding: 14, color: "#fff", boxSizing: "border-box", width: "100%" };
  const opt = { width: "100%", minHeight: 46, padding: "10px 14px", borderRadius: 16, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.14)", color: "#fff", font: "700 14px 'DM Sans',sans-serif", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: done ? "default" : "pointer", opacity: done ? 0.55 : 1 };
  const step = num(q.step), total = num(q.total);
  const min = num(q.minLength), len = Array.from(val.trim()).length;
  const canSend = !done && len > 0 && len >= min;
  const picks = (q.chips || []).length + (q.suggestions || []).length; // v329: `chips: []` hid the suggestions' spacing
  const chev = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C6F432" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
  return (
    <div style={glassBox} data-testid="assist-question">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", font: "800 10.5px 'DM Sans',sans-serif", letterSpacing: 1, color: "#DCFCE7" }}>
        <span>{q.label}</span>{step && total ? <span>{step} of {total}</span> : null}{/* v329: no "0 of undefined" */}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,.18)", margin: "8px 0 12px" }}>
        <div style={{ width: `${total ? Math.round((Math.min(step, total) / total) * 100) : 0}%`, height: 4, borderRadius: 2, background: "#C6F432", transition: "width .4s ease" }} />
      </div>
      {q.input && (
        <form onSubmit={(e) => { e.preventDefault(); if (canSend) answer(val.trim()); }} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: picks ? 10 : 0 }}>
          {/* v329: 16px text so iPhone doesn't zoom the whole chat on focus; Enter / Go sends like Next */}
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={q.placeholder || "Type here"} disabled={done} data-testid="assist-question-input" enterKeyHint="send" aria-label={q.ask || q.label || "Your answer"}
            style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 16, border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.12)", color: "#fff", padding: "0 14px", font: "600 16px 'DM Sans',sans-serif", outline: "none" }} />
          <button type="submit" disabled={!canSend} style={{ height: 46, padding: "0 16px", borderRadius: 16, border: "none", background: "#C6F432", color: "#14532D", font: "800 14px 'DM Sans',sans-serif", cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.6 }}>Next</button>
          {/* v329: the brief needs 15 characters (brandLogic minLength) — show n/15 instead of a silent grey Next */}
          {min > 0 && !done ? <span data-testid="assist-question-count" aria-live="polite" style={{ flexBasis: "100%", textAlign: "right", font: "700 10.5px 'DM Sans',sans-serif", color: len >= min ? "rgba(255,255,255,.7)" : "#FDE68A" }}>{len >= min ? `${len} characters` : `${len}/${min} · at least ${min} characters`}</span> : null}
        </form>
      )}
      {q.input && picks > 0 && <div style={{ font: "700 10px 'DM Sans',sans-serif", letterSpacing: 1, color: "rgba(255,255,255,.65)", margin: "2px 0 8px" }}>OR PICK ONE</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.chips || []).map((x) => <button key={String(x.value)} type="button" className="eva-press" style={opt} onClick={() => answer(x.label, x.value)}>{x.label}{chev}</button>)}
        {(q.suggestions || []).map((x) => <button key={x} type="button" className="eva-press" style={opt} onClick={() => answer(x)}>{x}{chev}</button>)}
      </div>
    </div>
  );
}

function TextCard({ c: d }) {
  return (
    <div style={card} data-testid="assist-text">
      <div style={h}>{d.title}</div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{d.text}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" style={btn(true)} onClick={() => copyText(d.text)}>Copy</button>{/* v329: real success / failure toast */}
      </div>
    </div>
  );
}

function Plan({ c: d, onSay }) {
  const p = d.plan;
  return (
    <div style={card} data-testid="assist-plan">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "8px 10px" }}><div style={{ color: sub, fontSize: 11 }}>Creators (reels)</div><div style={{ font: "800 15px 'DM Sans',sans-serif" }}>{rs(p.creatorsShare)}</div><div style={{ color: sub, fontSize: 11 }}>{num(p.micro)} micro + {num(p.nano)} nano</div></div>
        <div style={{ background: "#F0FDF4", borderRadius: 12, padding: "8px 10px" }}><div style={{ color: sub, fontSize: 11 }}>UGC videos (ads)</div><div style={{ font: "800 15px 'DM Sans',sans-serif" }}>{rs(p.ugcShare)}</div><div style={{ color: sub, fontSize: 11 }}>~{num(p.ugc)} videos</div></div>
      </div>
      <div style={{ marginTop: 10 }}>
        {/* v329: missing numbers show 0 (was ₹NaN); a plan without a timeline no longer crashes the chat */}
        {(p.timeline || []).map((s) => <div key={s.when} style={{ display: "flex", gap: 10, padding: "4px 0" }}><span style={{ width: 104, flexShrink: 0, color: green, fontWeight: 800, fontSize: 12 }}>{s.when}</span><span style={{ fontSize: 12.5, ...wrapText }}>{s.what}</span></div>)}
      </div>
      {d.text && <div style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12.5, borderTop: `1px solid ${line}`, paddingTop: 8 }}>{d.text}</div>}
      <div style={{ color: sub, fontSize: 11, marginTop: 6 }}>Rough numbers from Ybex's usual rates; real rates are on each creator's profile.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(false)} onClick={() => onSay?.(`I need ${p.ugc} UGC videos ${Math.round(p.ugcShare / Math.max(1, p.ugc))} per video`)}>Post UGC brief</button>
        <button type="button" style={btn(true)} onClick={() => onSay?.(`Create a new campaign for micro creators budget ${Math.round(p.creatorsShare / Math.max(1, p.micro + p.nano))}`)}>Make the campaign</button>
      </div>
    </div>
  );
}

function BriefCheck({ c: d, close }) {
  const navigate = useNavigate();
  return (
    <div style={card} data-testid="assist-brief-check">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 46, height: 46, borderRadius: 23, background: d.score >= 70 ? "#DCFCE7" : "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", font: "800 15px 'DM Sans',sans-serif" }}>{d.score}</div>
        <div style={{ fontWeight: 800 }}>{d.score >= 70 ? "Looks good" : "Can be better"}</div>
      </div>
      {(d.issues || []).map((x) => <div key={x} style={{ padding: "4px 0" }}>⚠️ {x}</div>)}
      {(d.good || []).map((x) => <div key={x} style={{ padding: "4px 0", color: green }}>✓ {x}</div>)}
      {d.betterTitle && <div style={{ marginTop: 6 }}>Better title: <b>{d.betterTitle}</b></div>}
      {d.kind && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" style={btn(true)} onClick={() => { close?.(); navigate(d.kind === "ugc" ? "/brand/ugc/post" : "/brand/campaigns/create"); }}>Edit the brief</button>
        </div>
      )}
    </div>
  );
}

function Handoff({ c: d }) {
  return (
    <div style={card} data-testid="assist-handoff">
      <div style={{ whiteSpace: "pre-wrap", color: sub, fontSize: 12, marginBottom: 10 }}>{d.text}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" style={btn(true)} onClick={() => window.open(`https://wa.me/${d.number}?text=${encodeURIComponent(d.text)}`, "_blank", "noopener")}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><SocialLogo platform="whatsapp" size={15} />Chat with Campaign Manager</span></button>
      </div>
    </div>
  );
}

function Chips({ c: d, onSay }) {
  const last = React.useRef(0); // v329: a quick double tap sent the same message twice
  const tap = (x) => { const now = Date.now(); if (now - last.current < 900) return; last.current = now; onSay?.(String(x.label), x.value); };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {(d.chips || []).map((x) => <button key={String(x.value)} type="button" className="eva-press" style={glassChip} onClick={() => tap(x)}>{x.label}</button>)}
    </div>
  );
}

// v419: the free invoice maker (loaded only when used).
const LazyInvoice = React.lazy(() => import("../invoice/EvaInvoice"));
const InvoiceOpen = ({ c }) => <React.Suspense fallback={null}><LazyInvoice c={c} /></React.Suspense>;
const VIEWS = { invoice: InvoiceOpen, question: Question, creators: Creators, compare: Compare, applicants: Applicants, alerts: Alerts, report: Report, ugcDraft: UgcDraft, campaignDraft: CampaignDraft, text: TextCard, plan: Plan, briefCheck: BriefCheck, handoff: Handoff, chips: Chips };

/** One card in the chat. onSay(text) sends a message as if typed; onInvite(creators) opens the invite sheet; close() closes the chat. */
export default function AssistCard({ card: c, onSay, onInvite, close }) {
  const View = VIEWS[c?.type];
  if (!View) return null;
  return <View c={c} onSay={onSay} onInvite={onInvite} close={close} />;
}
