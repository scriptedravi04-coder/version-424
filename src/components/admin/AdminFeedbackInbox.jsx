import React, { useEffect, useMemo, useState } from "react";
import { Bug, Lightbulb, HelpCircle, MessageCircle, Mail, Phone, MapPin, RefreshCw, Smartphone, CheckCircle2, RotateCcw } from "lucide-react";
import { api } from "../../lib/api";

// Session 43 (v287 → v293, Ravi): everything people tell the "Ybex Assist" bot, kept apart from Support
// tickets. Four boxes — Suggestions, Bugs, Confusing, Other — each with its own list, who sent it,
// which part of the app it is about, how urgent it looks, and a "Reviewed" tick. No new table: these
// are support_tickets with page_context /feedback-bot, hidden from the Support list.
export const KINDS = {
  feature: { label: "Suggestions", one: "Suggestion", Icon: Lightbulb, bg: "#DCFCE7", fg: "#15803D", empty: "No suggestions yet." },
  bug: { label: "Bugs", one: "Bug", Icon: Bug, bg: "#FEE2E2", fg: "#B91C1C", empty: "No bugs reported." },
  confusing: { label: "Confusing", one: "Confusing", Icon: HelpCircle, bg: "#FEF3C7", fg: "#B45309", empty: "Nothing confusing reported." },
  general: { label: "Other", one: "General", Icon: MessageCircle, bg: "#EDE9FE", fg: "#6D28D9", empty: "Nothing here yet." },
};
const PRIORITY = { HIGH: { label: "Urgent", bg: "#FEE2E2", fg: "#B91C1C" }, MEDIUM: { label: "Normal", bg: "#F3F4F6", fg: "#4B5563" }, LOW: { label: "Idea", bg: "#F3F4F6", fg: "#6B7280" } };
// v330: IST, and "" instead of "Invalid Date" for a missing/bad timestamp
const when = (iso) => { try { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""; } catch { return ""; } };

export default function AdminFeedbackInbox() {
  const [kind, setKind] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("open");
  const [area, setArea] = useState("");
  const [data, setData] = useState({ items: [], counts: {}, openCounts: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const { data: d } = await api.get("admin/feedback", { params: { role: role || undefined, status: status === "all" ? undefined : status }, bypassCache: true });
      setData({ items: d?.items || [], counts: d?.counts || {}, openCounts: d?.openCounts || {} });
    } catch { setErr("Could not load the chatbot reports."); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [role, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // First look: the first box that has something waiting (Suggestions → Bugs → Confusing → Other).
  useEffect(() => {
    if (kind || loading) return;
    const first = Object.keys(KINDS).find((k) => data.openCounts[k] > 0) || "feature";
    setKind(first);
  }, [loading, data, kind]);

  const shown = useMemo(() => data.items.filter((i) => i.kind === kind && (!area || i.area === area)), [data, kind, area]);
  const areas = useMemo(() => {
    const m = new Map();
    data.items.filter((i) => i.kind === kind).forEach((i) => { if (i.area) m.set(i.area, (m.get(i.area) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, kind]);

  const setItemStatus = async (it, next) => {
    setBusyId(it.ticket_id);
    try {
      await api.patch(`/admin/support/tickets/${encodeURIComponent(it.ticket_id)}/status`, { status: next });
      await load();
    } catch { setErr("Could not update it. Try again."); }
    setBusyId("");
  };

  const pill = (on) => ({ height: 32, padding: "0 13px", borderRadius: 16, border: on ? "none" : "1px solid #E5E7EB", background: on ? "#0A0A0A" : "#fff", color: on ? "#fff" : "#1F2937", font: "600 12.5px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
  const k = KINDS[kind] || KINDS.feature;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="admin-feedback">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0A0A0A", margin: 0 }}>Chatbot · Ybex Eva</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>What creators and brands told the dashboard bot. Hi / thanks chats are not saved — only real reports.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} style={{ ...pill(false), opacity: loading ? 0.6 : 1 }}><RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}</button>{/* v332: busy state */}
      </div>

      {/* The four boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
        {Object.entries(KINDS).map(([key, v]) => {
          const on = kind === key;
          const open = data.openCounts[key] || 0;
          return (
            <button key={key} type="button" onClick={() => { setKind(key); setArea(""); }} data-testid={`feedback-filter-${key}`}
              style={{ textAlign: "left", padding: 14, borderRadius: 18, border: on ? `2px solid ${v.fg}` : "1px solid #ECECF0", background: on ? v.bg : "#fff", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: 12, background: on ? "#fff" : v.bg, color: v.fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><v.Icon size={18} /></span>
              <span style={{ font: "700 15px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{v.label}</span>
              <span style={{ font: "600 12px 'DM Sans',sans-serif", color: open ? v.fg : "#9CA3AF" }}>{loading && !data.items.length ? "Loading…" : <>{open ? `${open} waiting` : "All reviewed"} · {data.counts[key] || 0} total</>}</span>{/* v332: no "All reviewed · 0 total" flash before data */}
            </button>
          );
        })}
      </div>

      <EvaRatings />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        {[["open", "Waiting"], ["done", "Reviewed"], ["all", "All"]].map(([s, l]) => <button key={s} type="button" onClick={() => setStatus(s)} style={pill(status === s)}>{l}</button>)}
        <span style={{ width: 1, height: 20, background: "#E5E7EB", margin: "0 4px" }} />
        {[["", "Everyone"], ["creator", "Creators"], ["brand", "Brands"]].map(([r, l]) => <button key={r || "all"} type="button" onClick={() => setRole(r)} style={pill(role === r)}>{l}</button>)}
      </div>
      {areas.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" onClick={() => setArea("")} style={{ ...pill(area === ""), height: 28, fontSize: 12 }}>Every area</button>
          {areas.map(([a, n]) => <button key={a} type="button" onClick={() => setArea(a)} style={{ ...pill(area === a), height: 28, fontSize: 12 }}>{a} · {n}</button>)}
        </div>
      )}

      {err && <p style={{ marginTop: 16, color: "#B91C1C", fontSize: 13 }}>{err} <button type="button" onClick={load} style={{ textDecoration: "underline", fontWeight: 600, background: "none", border: "none", color: "inherit", cursor: "pointer" }}>Try again</button></p>}{/* v332: retry */}
      {loading && <p style={{ marginTop: 24, color: "#9CA3AF", fontSize: 13 }}>Loading…</p>}
      {!loading && !err && shown.length === 0 && <p style={{ marginTop: 24, color: "#6B7280", fontSize: 14 }}>{status === "open" ? `No ${k.label.toLowerCase()} waiting here.` : k.empty}{/* v332: the old text swap turned "Nothing confusing reported." into just "waiting here." */}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {shown.map((it) => {
          const u = it.user || {};
          const pr = PRIORITY[it.priority] || PRIORITY.MEDIUM;
          return (
            <div key={it.ticket_id} style={{ background: "#fff", border: "1px solid #ECECF0", borderRadius: 18, padding: 16, opacity: it.open ? 1 : 0.78 }} data-testid="feedback-item">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {it.area && <span style={{ height: 24, padding: "0 10px", borderRadius: 12, background: k.bg, color: k.fg, font: "700 11.5px/24px 'DM Sans',sans-serif" }}>{it.area}</span>}
                {it.kind === "bug" && <span style={{ height: 24, padding: "0 10px", borderRadius: 12, background: pr.bg, color: pr.fg, font: "700 11.5px/24px 'DM Sans',sans-serif" }}>{pr.label}</span>}
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{when(it.created_at)}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: it.open ? "#B45309" : "#15803D" }}>{it.open ? "Waiting" : "Reviewed"}</span>
              </div>
              {it.headline && <div style={{ marginTop: 10, font: "700 15px/1.35 'DM Sans',sans-serif", color: "#0A0A0A" }}>{it.headline}</div>}
              <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: "#EDE9FE", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#6D28D9" }}>
                  {u.photo ? <img src={u.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : String(u.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#0A0A0A", fontSize: 14.5 }}>{u.name || "Unknown"} {u.role ? <span style={{ fontWeight: 600, fontSize: 11.5, color: "#6B7280", textTransform: "capitalize" }}>· {u.role}</span> : null}{/* v332: no dangling "·" */}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3, fontSize: 12.5, color: "#4B5563" }}>
                    {u.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Mail size={12} /> {u.email}</span>}
                    {u.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={12} /> {u.phone}</span>}
                    {u.city && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {u.city}</span>}
                    {u.joined && <span>Joined {when(u.joined)}</span>}
                  </div>
                  {it.device && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 12, color: "#6B7280" }}><Smartphone size={12} /> {it.device}</div>}
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {(it.messages || []).map((m) => ( /* v332: no crash when a report has no messages */
                  <div key={m.id} style={{ background: m.from === "admin" ? "#F5F3FF" : "#F9FAFB", borderRadius: 12, padding: "10px 12px", fontSize: 13.5, color: "#111827", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.text}
                    {(m.attachments || []).map((a) => <a key={a} href={a} target="_blank" rel="noreferrer"><img src={a} alt="Screenshot" style={{ display: "block", marginTop: 8, maxWidth: 220, borderRadius: 10, border: "1px solid #E5E7EB" }} /></a>)}
                    <div style={{ marginTop: 4, fontSize: 11, color: "#9CA3AF" }}>{when(m.at)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                {it.open ? (
                  <button type="button" disabled={busyId === it.ticket_id} onClick={() => setItemStatus(it, "RESOLVED")} data-testid="feedback-reviewed"
                    style={{ height: 36, padding: "0 14px", borderRadius: 18, border: "none", background: "#0A0A0A", color: "#fff", font: "600 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: busyId === it.ticket_id ? 0.6 : 1 }}>
                    <CheckCircle2 size={15} /> Mark reviewed
                  </button>
                ) : (
                  <button type="button" disabled={busyId === it.ticket_id} onClick={() => setItemStatus(it, "OPEN")} data-testid="feedback-reopen"
                    style={{ height: 36, padding: "0 14px", borderRadius: 18, border: "1px solid #E5E7EB", background: "#fff", color: "#1F2937", font: "600 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: busyId === it.ticket_id ? 0.6 : 1 }}>
                    <RotateCcw size={14} /> Reopen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Session 58 (Ravi approved eva_feedback): 👍 / 👎 people gave Eva's replies — last 30 days + the latest votes.
export function EvaRatings() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [only, setOnly] = useState("down");
  useEffect(() => {
    let alive = true;
    api.get("admin/eva-feedback", { bypassCache: true }).then((r) => { if (alive && r?.data?.ok) setD(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!d) return null;
  const total = d.up + d.down;
  const list = (d.items || []).filter((x) => !only || x.vote === only).slice(0, 30);
  return (
    <div data-testid="admin-eva-ratings" style={{ marginTop: 14, padding: 14, borderRadius: 18, border: "1px solid #ECECF0", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "700 15px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Eva reply ratings</span>
        <span style={{ font: "600 13px 'DM Sans',sans-serif", color: "#15803D" }}>👍 {d.up}</span>
        <span style={{ font: "600 13px 'DM Sans',sans-serif", color: "#B91C1C" }}>👎 {d.down}</span>
        <span style={{ font: "500 12px 'DM Sans',sans-serif", color: "#6B7280" }}>{total ? `${Math.round((d.up / total) * 100)}% liked · last 30 days` : "No ratings in the last 30 days"}</span>
        <span style={{ flex: 1 }} />
        {d.items?.length ? <button type="button" onClick={() => setOpen((v) => !v)} style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "1px solid #E5E7EB", background: "#fff", font: "600 12px 'DM Sans',sans-serif", cursor: "pointer" }}>{open ? "Hide" : "See replies"}</button> : null}
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["down", "👎 Disliked"], ["up", "👍 Liked"], ["", "All"]].map(([k, l]) => (
              <button key={k || "all"} type="button" onClick={() => setOnly(k)} style={{ height: 28, padding: "0 11px", borderRadius: 14, border: only === k ? "none" : "1px solid #E5E7EB", background: only === k ? "#0A0A0A" : "#fff", color: only === k ? "#fff" : "#1F2937", font: "600 12px 'DM Sans',sans-serif", cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          {list.length === 0 ? <p style={{ fontSize: 13, color: "#6B7280" }}>Nothing here.</p> : list.map((x) => (
            <div key={x.id} style={{ padding: "8px 0", borderTop: "1px solid #F2F2F5", display: "flex", gap: 10 }}>
              <span>{x.vote === "up" ? "👍" : "👎"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#1F2937", whiteSpace: "pre-wrap" }}>{x.text || "(no text)"}</div>
                <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2, textTransform: "capitalize" }}>{x.role || "user"}{x.card ? ` · ${x.card} card` : ""} · {when(x.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
