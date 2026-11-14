import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Trash2, Send, EyeOff, Pencil } from "lucide-react";
import { api } from "../../lib/api";

// Session 41 (Ravi) — write a "What's new" update and publish it. Each creator / brand sees each
// published update once (popup), then never again. Unpublish hides it from people who have not
// seen it yet.
const EMPTY = { id: null, title: "", points: "", audience: "all", cta_label: "", cta_url: "" };
const AUD = { all: "Everyone", creator: "Creators", brand: "Brands" };

export default function WhatsNewManager() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null); // v332: no double publish / delete
  const [loadState, setLoadState] = useState("loading"); // v332: a failed load read "No updates yet."

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("admin/whats-new", { bypassCache: true });
      setItems(Array.isArray(data) ? data : []);
      setLoadState("ok");
    } catch (e) {
      setLoadState((s) => (s === "ok" ? s : "error"));
      toast.error(e?.response?.data?.error || "Couldn't load updates.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.post("admin/whats-new", { ...form, points: form.points.split("\n") });
      toast.success(form.id ? "Saved." : "Draft saved. Publish it when ready.");
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (it, published) => {
    if (rowBusy) return; // v332
    setRowBusy(it.id);
    try {
      await api.post(`admin/whats-new/${it.id}/publish`, { published });
      toast.success(published ? "Published — users will see it once." : "Unpublished.");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't update. Please try again.");
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (it) => {
    if (rowBusy) return; // v332
    if (!window.confirm(`Delete "${it.title}"?`)) return;
    setRowBusy(it.id);
    try {
      await api.delete(`admin/whats-new/${it.id}`);
      toast.success("Deleted."); // v332: said nothing before
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't delete. Please try again.");
    } finally {
      setRowBusy(null);
    }
  };

  const edit = (it) => setForm({
    id: it.id, title: it.title || "", points: (Array.isArray(it.points) ? it.points : []).join("\n"),
    audience: it.audience || "all", cta_label: it.cta_label || "", cta_url: it.cta_url || "",
  });

  const input = "w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2.5 text-[16px] sm:text-sm"; // v332: no iOS zoom

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><Sparkles size={18} /></div>
        <div>
          <h1 className="text-xl font-bold">What's new</h1>
          <p className="text-xs text-[var(--text-secondary)]">A popup each creator / brand sees once. Keep it short — a title and 2–4 points.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-default)] p-4 space-y-3 bg-[var(--bg-card)]">
        <div className="text-sm font-bold">{form.id ? "Edit update" : "New update"}</div>
        <input className={input} placeholder="Title — e.g. Express delivery is now free" value={form.title} onChange={set("title")} maxLength={120} />
        <textarea className={`${input} h-28`} placeholder={"One point per line (max 6)\nBrands can pick 24-hour delivery at no extra cost\nYou'll see a FREE badge on Express"} value={form.points} onChange={set("points")} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className={input} value={form.audience} onChange={set("audience")}>
            <option value="all">Everyone</option>
            <option value="creator">Creators only</option>
            <option value="brand">Brands only</option>
          </select>
          <input className={input} placeholder="Button text (optional)" value={form.cta_label} onChange={set("cta_label")} maxLength={30} />
          <input className={input} placeholder="Button page, e.g. /campaigns" value={form.cta_url} onChange={set("cta_url")} />
        </div>
        <div className="flex gap-2 justify-end">
          {form.id && <button type="button" onClick={() => setForm(EMPTY)} className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-sm font-semibold">Cancel</button>}
          <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-60">{busy ? "Saving…" : form.id ? "Save changes" : "Save draft"}</button>
        </div>
      </div>

      <div className="space-y-3">
        {/* v332: loading / failed load are not "No updates yet." */}
        {items.length === 0 && loadState === "loading" && <div className="text-sm text-[var(--text-secondary)]">Loading…</div>}
        {items.length === 0 && loadState === "error" && <div className="text-sm text-red-600">Couldn't load updates. <button type="button" onClick={load} className="underline font-semibold">Try again</button></div>}
        {items.length === 0 && loadState === "ok" && <div className="text-sm text-[var(--text-secondary)]">No updates yet.</div>}
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-[var(--border-default)] p-4 bg-[var(--bg-card)]">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{it.title}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{AUD[it.audience] || "Everyone"}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${it.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{it.published ? "Live" : "Draft"}</span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-0.5">
                  {(Array.isArray(it.points) ? it.points : []).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => edit(it)} title="Edit" aria-label="Edit" className="p-2 rounded-lg hover:bg-slate-100"><Pencil size={15} /></button>
                {it.published
                  ? <button type="button" disabled={rowBusy === it.id} onClick={() => publish(it, false)} title="Unpublish" aria-label="Unpublish" className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"><EyeOff size={15} /></button>
                  : <button type="button" disabled={rowBusy === it.id} onClick={() => publish(it, true)} title="Publish" aria-label="Publish" className="p-2 rounded-lg hover:bg-violet-50 text-violet-700 disabled:opacity-50"><Send size={15} /></button>}
                <button type="button" disabled={rowBusy === it.id} onClick={() => remove(it)} title="Delete" aria-label="Delete" className="p-2 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50">{/* v332: aria-labels + busy */}<Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ v436 (Ravi: ADMIN_HOW_IT_WORKS_VIDEOS_SPEC.md) — Admin › Developer › "How it works" videos ════════════════════
// 10 rows (B1–B5, C1–C5): a YouTube link OR an uploaded file, or Not set (hidden in the app) + the playlist link.
const HIW_ROWS = [
  ["B1", "Chat and Deal"], ["B2", "Post a UGC Brief"], ["B3", "Create a Campaign"], ["B4", "Payments"], ["B5", "Eva for Brands"],
  ["C1", "Chat and Deal"], ["C2", "Earn from UGC Briefs"], ["C3", "Apply to Campaigns"], ["C4", "Earnings and Payout"], ["C5", "Eva for Creators"],
];
const HP = "#7C3AED";
const hiwFont = { fontFamily: "'DM Sans', system-ui, sans-serif" };
const hiwInput = { width: "100%", boxSizing: "border-box", height: 44, borderRadius: 12, border: "1px solid #E5E7EB", padding: "0 12px", fontSize: 14, background: "#fff", ...hiwFont };
export const isYoutubeLink = (s) => /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/|playlist\?list=|@)|youtu\.be\/)[\w@-]/i.test(String(s || "").trim());

function HiwStatus({ v }) {
  const s = v?.source === "youtube" ? { t: "YouTube", bg: "#FEE2E2", c: "#B91C1C" } : v?.source === "file" ? { t: "Uploaded file", bg: "#F5F0FF", c: "#6D28D9" } : { t: "● Not set", bg: "#F1F1F4", c: "#5F6672" };
  return <span data-testid="hiw-status" style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: s.bg, color: s.c, fontSize: 11.5, fontWeight: 700 }}>{s.t}</span>;
}

function HiwRow({ code, title, v, onSaved, first }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(v?.source === "file" ? "file" : "youtube");
  const [yt, setYt] = useState(v?.youtube_url || "");
  const [file, setFile] = useState(v?.file_url ? { url: v.file_url, name: decodeURIComponent(String(v.file_url).split("/").pop() || "video") } : null);
  const [busy, setBusy] = useState("");
  const inputRef = React.useRef(null);
  useEffect(() => { setYt(v?.youtube_url || ""); setFile(v?.file_url ? { url: v.file_url, name: decodeURIComponent(String(v.file_url).split("/").pop() || "video") } : null); setMode(v?.source === "file" ? "file" : "youtube"); }, [v?.youtube_url, v?.file_url, v?.source]);
  const willUse = mode === "youtube" ? (isYoutubeLink(yt) ? "YouTube" : "") : (file?.url ? "Uploaded file" : "");
  const pick = async (f) => {
    if (!f) return;
    if (!/^video\//.test(f.type || "")) { toast.error("Choose a video file."); return; }
    setBusy("upload");
    try {
      const { data } = await api.post(`admin/hiw-videos/${code}/upload-url`, { filename: f.name, contentType: f.type, size: f.size });
      const { supabase } = await import("../../lib/supabase");
      const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, f, { contentType: f.type });
      if (error) throw error;
      setFile({ url: data.publicUrl, name: f.name });
      toast.success("Video uploaded — tap Save to use it");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed. Try a smaller file (max 200 MB)."); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  };
  const save = async () => {
    if (mode === "youtube" && !isYoutubeLink(yt)) { toast.error("Paste a YouTube link (youtube.com or youtu.be)."); return; }
    if (mode === "file" && !file?.url) { toast.error("Upload a video file first."); return; }
    setBusy("save");
    try {
      const { data } = await api.put(`admin/hiw-videos/${code}`, mode === "youtube" ? { source: "youtube", youtube_url: yt.trim() } : { source: "file", file_url: file.url });
      onSaved(code, data?.video);
      toast.success(`${code} saved · using ${mode === "youtube" ? "YouTube" : "Uploaded file"}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't save. Try again."); }
    finally { setBusy(""); }
  };
  const remove = async () => {
    setBusy("remove");
    try {
      const { data } = await api.put(`admin/hiw-videos/${code}`, { source: null });
      setYt(""); setFile(null); onSaved(code, data?.video);
      toast.success(`${code} removed · not set`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't remove. Try again."); }
    finally { setBusy(""); }
  };
  const preview = () => {
    const url = mode === "youtube" ? (isYoutubeLink(yt) ? yt.trim() : "") : file?.url || "";
    if (!url) { toast("Add a link or file to preview"); return; }
    window.open(/^https?:\/\//.test(url) ? url : `https://${url}`, "_blank", "noopener,noreferrer");
  };
  const seg = (on) => ({ flex: 1, height: 36, borderRadius: 10, border: "none", background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : "none", color: on ? "#111827" : "#6B7280", fontSize: 13, fontWeight: 700, cursor: "pointer", ...hiwFont });
  return (
    <div data-testid={`hiw-row-${code}`} style={{ borderTop: first ? "none" : "1px solid #F1F1F4" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", ...hiwFont }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F0FF", color: HP, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{code}</span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "#111827" }}>{title}</span>
          <HiwStatus v={v} />
        </span>
        <span aria-hidden style={{ color: "#9CA3AF", fontSize: 18, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "2px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }} data-testid={`hiw-open-${code}`}>
          <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#F1F1F4" }}>
            <button type="button" role="tab" aria-selected={mode === "youtube"} onClick={() => setMode("youtube")} style={seg(mode === "youtube")}>YouTube link</button>
            <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")} style={seg(mode === "file")}>Upload video file</button>
          </div>
          {mode === "youtube" ? (
            <>
              <input value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://youtube.com/watch?v=…" inputMode="url" style={hiwInput} data-testid={`hiw-yt-${code}`} />
              <div style={{ fontSize: 12, color: "#6B7280" }}>Play will open this link on YouTube.</div>
            </>
          ) : (
            <>
              <input ref={inputRef} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0])} data-testid={`hiw-file-${code}`} />
              {file?.url ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#fff" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                  <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)} style={{ border: "none", background: "none", color: HP, fontWeight: 700, fontSize: 13, cursor: "pointer", ...hiwFont }}>Replace</button>
                  <button type="button" onClick={() => setFile(null)} disabled={Boolean(busy)} style={{ border: "none", background: "none", color: "#DC2626", fontWeight: 700, fontSize: 13, cursor: "pointer", ...hiwFont }}>Remove</button>
                </div>
              ) : (
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy === "upload"} style={{ height: 76, borderRadius: 12, border: "1.5px dashed #C4B5FD", background: "#FAF7FF", color: HP, fontSize: 14, fontWeight: 700, cursor: "pointer", ...hiwFont }}>
                  {busy === "upload" ? "Uploading…" : "Choose video file"}
                </button>
              )}
              <div style={{ fontSize: 12, color: "#6B7280" }}>Play will show this video inside the app.</div>
            </>
          )}
          <div data-testid={`hiw-willuse-${code}`} style={{ fontSize: 12.5, fontWeight: 600, color: willUse ? "#111827" : "#9CA3AF" }}>{willUse ? `Will use: ${willUse}` : "Not set · this video stays hidden in the app"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={preview} style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", ...hiwFont }}>Preview</button>
            <button type="button" onClick={remove} disabled={Boolean(busy)} style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "none", background: "none", color: "#DC2626", fontSize: 13.5, fontWeight: 700, cursor: "pointer", ...hiwFont }}>Remove</button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={save} disabled={Boolean(busy)} data-testid={`hiw-save-${code}`} style={{ height: 40, padding: "0 18px", borderRadius: 12, border: "none", background: HP, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, ...hiwFont }}>{busy === "save" ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HiwVideosManager() {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [pl, setPl] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const load = useCallback(async () => {
    setErr("");
    try { const { data } = await api.get("admin/hiw-videos", { bypassCache: true }); setCfg(data); setPl(data?.playlist_url || ""); }
    catch (e) { setErr(e?.response?.status === 403 ? "Only admins with Developer access can edit these videos." : "Couldn't load the videos. Try again."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onSaved = (code, video) => setCfg((c) => ({ ...(c || {}), videos: { ...(c?.videos || {}), [code]: video || { source: null } } }));
  const savePl = async () => {
    if (pl.trim() && !isYoutubeLink(pl)) { toast.error("Paste a YouTube playlist link."); return; }
    setPlBusy(true);
    try { const { data } = await api.put("admin/hiw-videos-playlist", { url: pl.trim() }); setPl(data?.playlist_url || ""); toast.success(data?.playlist_url ? "Playlist saved" : "Playlist removed"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't save. Try again."); }
    finally { setPlBusy(false); }
  };
  const card = { background: "#fff", borderRadius: 18, border: "1px solid #EEF0F3", overflow: "hidden" };
  const label = { fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: "#6B7280", margin: "4px 2px 8px" };
  if (err) return <div style={{ padding: 16, borderRadius: 16, background: "#FEF2F2", color: "#B91C1C", fontSize: 13.5, ...hiwFont }}>{err} <button type="button" onClick={load} style={{ border: "none", background: "none", color: HP, fontWeight: 700, cursor: "pointer" }}>Retry</button></div>;
  if (!cfg) return <div style={{ padding: 16, color: "#6B7280", fontSize: 13.5, ...hiwFont }}>Loading…</div>;
  return (
    <div data-testid="hiw-videos" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, ...hiwFont }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>How it works videos</h3>
      <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>Add a YouTube link or upload a file for each video. Videos that are not set stay hidden in the app.</div>
      {[["BRAND VIDEOS", "B"], ["CREATOR VIDEOS", "C"]].map(([t, p]) => (
        <div key={p}>
          <div style={label}>{t}</div>
          <div style={card}>{HIW_ROWS.filter(([c]) => c[0] === p).map(([c, title], i) => <HiwRow key={c} code={c} title={title} v={cfg.videos?.[c]} onSaved={onSaved} first={i === 0} />)}</div>
        </div>
      ))}
      <div>
        <div style={label}>YOUTUBE PLAYLIST</div>
        <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={pl} onChange={(e) => setPl(e.target.value)} placeholder="https://youtube.com/playlist?list=…" inputMode="url" style={hiwInput} data-testid="hiw-playlist" />
            <button type="button" onClick={savePl} disabled={plBusy} style={{ height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: HP, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, ...hiwFont }}>{plBusy ? "…" : "Save"}</button>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Shows "Watch all on YouTube" at the end of the How it works stories. Leave empty to hide it.</div>
        </div>
      </div>
    </div>
  );
}
