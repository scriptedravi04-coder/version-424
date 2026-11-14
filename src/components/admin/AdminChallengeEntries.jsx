import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Download, Trophy, Plus, Trash2, Upload, Settings2 } from "lucide-react";
import { getAdminEntries, markWinner, getAdminConfig, saveAdminConfig, uploadChallengeFile, MAX_REEL_MB, getAdminReminders, refreshEntryStats, getAdminEntriesData, reviewEntry, setRechargeSent, getNoReelCreators, setFollows } from "../../lib/challengeApi";
import { videoCoverBlob } from "../portfolio/portfolioApi"; // v371: cover from the first frame
import { RANKS, RANK_LABEL, CHALLENGE_NAME, PAGE_PATH, PRIZES, SPONSORS, PRIZE_POOL, WINNERS_LINE, EVERYONE_WINS, datesFrom, dayText, dayTimeText, STARTS_AT, MAX_RUN_MS, RECHARGE_SLOTS, RECHARGE_AMOUNT } from "../../lib/diwaliChallenge";
import { CardGridSkeleton } from "../common/ContentSkeletons";

// v367 (Ravi's design 2h, brief point 8): Admin → Challenge entries. Every valid entry (signed stamp in a creator's
// portfolio item), sort by views / likes / date, "Mark winner" 1st / 2nd / 3rd / Top 20. Winners show on /challenge
// from results day (Admin → Sponsors & prizes → Dates). Marking needs a full admin (the server checks).

/** v377: WhatsApp chat link for an Indian number ("" when there's no number). */
export const waLink = (phone, text = "") => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
};
const NUDGE = "Hi! You're on Ybex 🎉 Add your Diwali reel to enter the challenge (win up to ₹1 lakh, ₹300 on UPI for the first 300): https://ybexmedia.in/offer";
const fmt = (n) => (n ? Number(n).toLocaleString("en-IN") : "—");
const when = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } };

export function sortEntries(list, by) {
  const a = [...(list || [])];
  if (by === "views") a.sort((x, y) => (y.views || 0) - (x.views || 0) || (y.likes || 0) - (x.likes || 0));
  else if (by === "likes") a.sort((x, y) => (y.likes || 0) - (x.likes || 0) || (y.views || 0) - (x.views || 0));
  else if (by === "oldest") a.sort((x, y) => x.no - y.no);
  else a.sort((x, y) => y.no - x.no);
  return a;
}

function toCsv(list) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  // v377: + WhatsApp, status, ₹50 recharge place / sent
  const head = ["entry", "name", "handle", "whatsapp", "email", "reel", "views", "likes", "entered_at", "status", "recharge_place", "recharge_sent", "winner", "tags_in_caption", "numbers_updated_at", "follows_ybex", "auto_reject_reason"];
  const tag = (e) => (e.caption_ok === true ? "yes" : e.caption_ok === false ? "no" : e.live_found === false ? "reel not found" : "");
  return [head.join(","), ...list.map((e) => [e.no, e.name, e.handle, e.phone || "", e.email || "", e.content_url, e.views, e.likes, e.at, e.status || "pending", e.recharge_place || "", e.recharge_sent_at ? "yes" : "", e.rank || "", tag(e), e.stats_at || "", e.follows === true ? "yes" : e.follows === false ? "no" : "", e.auto_reason || ""].map(esc).join(","))].join("\n");
}


/** Image file → small WebP data URL (max 320 px wide / 160 px high) so the page stays light. */
export function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) { reject(new Error("Pick a PNG, JPG or WebP image.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 320 / img.width, 160 / img.height);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/webp", 0.9);
      if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
      if (out.length > 380_000) { reject(new Error("This logo is still too big. Try a smaller file.")); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read this image.")); };
    img.src = url;
  });
}


// v369: <input type="date"> value (YYYY-MM-DD, India) ↔ ms. Close = that day 23:59:59 IST, results = that day 00:00 IST.
export const istDay = (ms) => { try { return new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10); } catch { return ""; } };
export const closeOf = (day) => Date.parse(`${day}T23:59:59+05:30`);
export const resultsOf = (day) => Date.parse(`${day}T00:00:00+05:30`);
const daysFromToday = (ms) => Math.round((ms - Date.now()) / 86400_000);

const blankSponsor = () => ({ name: "", logo: "", scripts: [""] });

/**
 * v368 (Ravi: "ek hi option se name, script, logo — sab jagah change ho jaye"): sponsors + prizes in one place.
 * Saved on the server; /challenge (Powered by, Brand scripts, Prizes), the Home card and the Tag-the-brand toggle
 * all read the same list. Banner / popup images are pictures, so change those in Admin → Banners / Promo popups.
 */
function SponsorsEditor({ onDone }) {
  const [sponsors, setSponsors] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [reels, setReels] = useState([]); // v371: example reels on /offer
  const [texts, setTexts] = useState({ pool: "", winners: "", everyone: "" }); // v371: headline + "everyone wins"
  const [uploading, setUploading] = useState(false);
  const [closeDay, setCloseDay] = useState(""); // v369: entries close on this day (11:59 PM IST)
  const [resultsDay, setResultsDay] = useState(""); // v369: winners shown from this day
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    getAdminConfig().then((c) => {
      const base = c?.sponsors?.length ? c.sponsors.map((x) => ({ ...x, scripts: x.scripts?.length ? x.scripts : [""] })) : (SPONSORS.length ? SPONSORS.map((x) => ({ logo: "", ...x, scripts: x.scripts?.length ? x.scripts : [""] })) : []);
      // v376: scripts saved without a brand come back as one entry with an empty name
      setSponsors(c?.scripts?.length ? [...base, { name: "", logo: "", scripts: c.scripts }] : (base.length ? base : [blankSponsor()]));
      setPrizes(c?.prizes?.length ? c.prizes : PRIZES.map(({ title, value, note }) => ({ title, value, note })));
      const d = datesFrom(c); setCloseDay(istDay(d.closesAt)); setResultsDay(istDay(d.resultsAt));
      setReels(Array.isArray(c?.reels) ? c.reels : []);
      setTexts({ pool: c?.pool || PRIZE_POOL, winners: c?.winners || WINNERS_LINE, everyone: c?.everyone || EVERYONE_WINS });
    }).catch(() => { setErr("Could not load. Refresh and try again."); setSponsors([blankSponsor()]); setPrizes([]); });
  }, []);
  const upd = (i, patch) => setSponsors((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pickLogo = async (i, file) => {
    try { upd(i, { logo: await shrinkLogo(file) }); } catch (e) { toast.error(e.message); }
  };
  const addReel = async (file) => {
    if (!file) return;
    if (!/^video\/(mp4|quicktime)$/.test(file.type)) { toast.error("Pick an MP4 or MOV video."); return; }
    if (file.size > MAX_REEL_MB * 1024 * 1024) { toast.error(`This video is ${(file.size / 1048576).toFixed(0)} MB. Keep it under ${MAX_REEL_MB} MB (1080×1920, 30–60 s, H.264).`); return; }
    setUploading(true);
    try {
      const url = await uploadChallengeFile(file);
      let poster = "";
      try { const blob = await videoCoverBlob(file); if (blob) poster = await uploadChallengeFile(blob, "reel-cover.jpg"); } catch { /* the video still shows */ }
      setReels((l) => [...l, { url, poster, caption: "" }].slice(0, 3));
      toast.success("Video uploaded. Press Save everywhere to show it.");
    } catch (e) { toast.error(e.message); } finally { setUploading(false); }
  };

  const save = async () => {
    setErr("");
    const names = sponsors.map((x) => x.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) { setErr("Two sponsors have the same name."); return; }
    // v376 (Ravi): scripts may be added with no name / logo — they show on /offer without a brand
    if (sponsors.some((x) => !x.name.trim() && x.logo)) { setErr("A logo needs the sponsor's name too (or remove the logo)."); return; }
    const cAt = closeOf(closeDay), rAt = resultsOf(resultsDay);
    if (!Number.isFinite(cAt) || cAt <= STARTS_AT || cAt > STARTS_AT + MAX_RUN_MS) { setErr("Pick a close date after the start and within 120 days."); return; }
    if (!Number.isFinite(rAt) || rAt < cAt - 86400_000 + 1000) { setErr("Results day must be on or after the close day."); return; }
    setBusy(true);
    try {
      const saved = await saveAdminConfig({
        closes_at: new Date(cAt).toISOString(), results_at: new Date(Math.max(rAt, cAt + 1000)).toISOString(),
        sponsors: sponsors.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), logo: x.logo || "", scripts: x.scripts.map((t) => t.trim()).filter(Boolean) })),
        scripts: sponsors.filter((x) => !x.name.trim()).flatMap((x) => x.scripts.map((t) => t.trim()).filter(Boolean)).slice(0, 10),
        prizes: prizes.filter((p) => p.title?.trim() && p.value?.trim()),
        reels: reels.map((r) => ({ url: r.url, poster: r.poster || "", caption: (r.caption || "").trim() })),
        pool: texts.pool.trim(), winners: texts.winners.trim(), everyone: texts.everyone.trim(),
      });
      toast.success("Saved. /challenge shows it within a minute.");
      const savedBase = saved.sponsors.map((x) => ({ ...x, scripts: x.scripts.length ? x.scripts : [""] }));
      setSponsors(saved.scripts?.length ? [...savedBase, { name: "", logo: "", scripts: saved.scripts }] : (savedBase.length ? savedBase : [blankSponsor()]));
      setPrizes(saved.prizes);
      setReels(saved.reels || []);
      if (saved.closes_at) { const d = datesFrom(saved); setCloseDay(istDay(d.closesAt)); setResultsDay(istDay(d.resultsAt)); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!sponsors) return <CardGridSkeleton count={2} label="Loading sponsors" />;
  const input = "w-full h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#7C3AED]";
  return (
    <div className="space-y-5" data-testid="sponsors-editor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900">Sponsors & prizes</h3>
          <p className="text-xs text-slate-500">One place: name, logo and scripts show on /challenge (Powered by, Brand scripts), the creator Home card and the Tag-the-brand toggle.</p>
        </div>
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">Back to entries</button>
      </div>
      {sponsors.map((sp, i) => (
        <div key={i} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" data-testid="sponsor-row">
          <div className="flex items-start gap-3">
            <label className="w-24 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer shrink-0 bg-slate-50" title="Upload logo">
              {sp.logo ? <img src={sp.logo} alt={`${sp.name} logo`} className="max-w-full max-h-full object-contain" /> : <Upload size={18} className="text-slate-500" />}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={`Logo for sponsor ${i + 1}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickLogo(i, f); }} />
            </label>
            <div className="flex-1 space-y-2">
              <input value={sp.name} onChange={(e) => upd(i, { name: e.target.value.slice(0, 40) })} placeholder="Brand name, e.g. Wefrnd" aria-label={`Sponsor ${i + 1} name`} className={input} />
              <div className="flex gap-3 text-xs font-bold">
                {sp.logo && <button type="button" onClick={() => upd(i, { logo: "" })} className="text-rose-600">Remove logo</button>}
                <button type="button" onClick={() => setSponsors((l) => l.filter((_, j) => j !== i))} className="text-rose-600 inline-flex items-center gap-1"><Trash2 size={12} /> Remove sponsor</button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-black tracking-wider text-slate-500">REEL SCRIPTS (creators see these on /challenge, with a Copy button)</div>
            {sp.scripts.map((t, k) => (
              <div key={k} className="flex gap-2">
                <textarea value={t} rows={2} onChange={(e) => upd(i, { scripts: sp.scripts.map((x, m) => (m === k ? e.target.value.slice(0, 600) : x)) })}
                  placeholder="e.g. Show how you found a real friend on Wefrnd in 15 seconds…" aria-label={`Sponsor ${i + 1} script ${k + 1}`}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
                <button type="button" onClick={() => upd(i, { scripts: sp.scripts.length > 1 ? sp.scripts.filter((_, m) => m !== k) : [""] })} aria-label="Remove script" className="w-9 h-9 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center"><Trash2 size={14} /></button>
              </div>
            ))}
            {sp.scripts.length < 10 && <button type="button" onClick={() => upd(i, { scripts: [...sp.scripts, ""] })} className="text-xs font-bold text-[#7C3AED] inline-flex items-center gap-1"><Plus size={13} /> Add script</button>}
          </div>
        </div>
      ))}
      {sponsors.length < 8 && <button type="button" onClick={() => setSponsors((l) => [...l, blankSponsor()])} className="h-10 px-4 rounded-xl border border-dashed border-[#C4B5FD] text-sm font-bold text-[#7C3AED] inline-flex items-center gap-1.5"><Plus size={15} /> Add sponsor</button>}

      <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2" data-testid="headline-editor">
        <div className="text-[11px] font-black tracking-wider text-slate-500">HEADLINE ON /offer</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={texts.pool} onChange={(e) => setTexts((t) => ({ ...t, pool: e.target.value.slice(0, 40) }))} placeholder="₹1,00,000 prize pool" aria-label="Prize pool headline" className={input} />
          <input value={texts.winners} onChange={(e) => setTexts((t) => ({ ...t, winners: e.target.value.slice(0, 40) }))} placeholder="50 winners" aria-label="Winners line" className={input} />
        </div>
        <textarea value={texts.everyone} rows={2} onChange={(e) => setTexts((t) => ({ ...t, everyone: e.target.value.slice(0, 220) }))} aria-label="Everyone wins line"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
        <p className="text-[11px] text-slate-500">"Everyone who enters wins" box. Only promise what Ybex will really give every valid entry.</p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" data-testid="example-reels-editor">
        <div className="text-[11px] font-black tracking-wider text-slate-500">EXAMPLE REELS ON /offer (up to 3 · MP4 or MOV · under {MAX_REEL_MB} MB each)</div>
        <div className="flex gap-3 flex-wrap">
          {reels.map((r, i) => (
            <div key={r.url} className="w-[150px] space-y-1.5">
              <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-900">
                <video src={r.url} poster={r.poster || undefined} muted loop playsInline controls className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <input value={r.caption || ""} onChange={(e) => setReels((l) => l.map((x, j) => (j === i ? { ...x, caption: e.target.value.slice(0, 80) } : x)))}
                placeholder="Caption (optional)" aria-label={`Reel ${i + 1} caption`} className="w-full h-9 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-[#7C3AED]" />
              <div className="flex justify-between text-[11px] font-bold">
                <button type="button" disabled={i === 0} onClick={() => setReels((l) => { const a = [...l]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })} className="text-slate-500 disabled:opacity-30">← Move</button>
                <button type="button" onClick={() => setReels((l) => l.filter((_, j) => j !== i))} className="text-rose-600">Remove</button>
              </div>
            </div>
          ))}
          {reels.length < 3 && (
            <label className={`w-[150px] aspect-[9/16] rounded-xl border-2 border-dashed border-[#C4B5FD] flex flex-col items-center justify-center gap-1 text-[#7C3AED] text-xs font-bold ${uploading ? "opacity-60" : "cursor-pointer"}`}>
              <Upload size={18} /> {uploading ? "Uploading…" : "Upload reel"}
              <input type="file" accept="video/mp4,video/quicktime" className="hidden" disabled={uploading} aria-label="Upload example reel"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; addReel(f); }} />
            </label>
          )}
        </div>
        <p className="text-[11px] text-slate-500">Best quality that still loads fast on phones: vertical 1080×1920, 30–60 seconds, H.264 MP4, about 8–20 MB. They play muted on a loop; people tap for sound.</p>
      </div>

      <div className="rounded-2xl bg-white border border-amber-200 p-4 space-y-3" data-testid="challenge-dates">
        <div className="text-[11px] font-black tracking-wider text-slate-500">DATES (India time)</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Entries close on (11:59 PM)</span>
            <input type="date" value={closeDay} min={istDay(STARTS_AT + 86400_000)} max={istDay(STARTS_AT + MAX_RUN_MS)} onChange={(e) => {
              const v = e.target.value; setCloseDay(v);
              if (v && (!resultsDay || resultsOf(resultsDay) < resultsOf(v))) setResultsDay(istDay(closeOf(v) + 2 * 86400_000));
            }} aria-label="Entries close on" className={input} />
            {closeDay && Number.isFinite(closeOf(closeDay)) && <span className="text-[11px] text-slate-500">{dayTimeText(closeOf(closeDay))} · {daysFromToday(closeOf(closeDay)) >= 0 ? `${daysFromToday(closeOf(closeDay))} days from today` : "already passed — entries are closed"}</span>}
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Winners shown from</span>
            <input type="date" value={resultsDay} min={closeDay || undefined} onChange={(e) => setResultsDay(e.target.value)} aria-label="Winners shown from" className={input} />
            {resultsDay && Number.isFinite(resultsOf(resultsDay)) && <span className="text-[11px] text-slate-500">{dayText(resultsOf(resultsDay))}, 12:00 AM</span>}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {[7, 10, 14, 21].map((n) => (
            <button key={n} type="button" onClick={() => { const c = istDay(Date.now() + n * 86400_000); setCloseDay(c); setResultsDay(istDay(closeOf(c) + 2 * 86400_000)); }}
              className="h-8 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:border-[#7C3AED]">Close in {n} days</button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">The page, countdown, rules, Home card and the toggle all follow these dates. Making it earlier removes entries made after the new close time.</p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
        <div className="text-[11px] font-black tracking-wider text-slate-500">PRIZES (first one is the big card)</div>
        {prizes.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
            <input value={p.title} onChange={(e) => setPrizes((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value.slice(0, 40) } : x)))} placeholder="1st prize" aria-label={`Prize ${i + 1} title`} className={input} />
            <input value={p.value} onChange={(e) => setPrizes((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value.slice(0, 60) } : x)))} placeholder="₹25,000 + iPhone" aria-label={`Prize ${i + 1} value`} className={input} />
            <input value={p.note || ""} onChange={(e) => setPrizes((l) => l.map((x, j) => (j === i ? { ...x, note: e.target.value.slice(0, 120) } : x)))} placeholder="Note (optional)" aria-label={`Prize ${i + 1} note`} className={input} />
            <button type="button" onClick={() => setPrizes((l) => l.filter((_, j) => j !== i))} aria-label="Remove prize" className="w-10 h-10 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center"><Trash2 size={14} /></button>
          </div>
        ))}
        {prizes.length < 6 && <button type="button" onClick={() => setPrizes((l) => [...l, { title: "", value: "", note: "" }])} className="text-xs font-bold text-[#7C3AED] inline-flex items-center gap-1"><Plus size={13} /> Add prize</button>}
      </div>

      {err && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold p-3">{err}</div>}
      <div className="flex justify-end gap-2">
        <a href={PAGE_PATH} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5">Preview /challenge <ExternalLink size={13} /></a>
        <button type="button" onClick={save} disabled={busy} className="h-10 px-5 rounded-xl bg-[#7C3AED] text-white text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save everywhere"}</button>
      </div>
    </div>
  );
}

export default function AdminChallengeEntries() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [by, setBy] = useState("views");
  const [only, setOnly] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false); // v368: Sponsors & prizes
  const [cfg, setCfg] = useState(null); // v369: for the dates in the header
  useEffect(() => { if (!editing) getAdminConfig().then(setCfg).catch(() => {}); }, [editing]);
  const hdr = datesFrom(cfg);
  const [reminders, setReminders] = useState(null); // v371: "Not yet — remind me"
  useEffect(() => { if (!editing) getAdminReminders().then(setReminders).catch(() => setReminders([])); }, [editing]);
  const exportReminders = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["name,email,phone,instagram,asked_at", ...(reminders || []).map((r) => [r.name, r.email, r.phone, r.handle, r.at].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "challenge-reminders.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const [rechargeLeft, setRechargeLeft] = useState(null); // v377
  const [noReel, setNoReel] = useState(null); // v377: signed up, no reel yet
  const [showNoReel, setShowNoReel] = useState(false);
  useEffect(() => { if (!editing) getNoReelCreators().then(setNoReel).catch(() => setNoReel([])); }, [editing]);
  const load = async (fresh = false) => {
    setError("");
    try { const d = await getAdminEntriesData(fresh); setList(d.entries || []); setRechargeLeft(d.recharge_left ?? null); }
    catch (e) { setError(e?.response?.data?.error || e?.response?.data?.detail || "Could not load entries."); setList([]); }
  };
  const setStatus = async (e, status) => {
    const key = `${e.user_id}:${e.item_id}`;
    setBusy(key);
    try {
      await reviewEntry(e, status);
      setList((l) => (l || []).map((x) => (x.user_id === e.user_id && x.item_id === e.item_id ? { ...x, status } : x)));
      toast.success(`Entry #${e.no} ${status === "pending" ? "back to pending" : status}`);
      load(true); // recharge places move when an entry is rejected
    } catch (err) { toast.error(err.message); } finally { setBusy(""); }
  };
  // v396: "Follows @ybex.in" tick (per creator) — Instagram can't tell us, so the admin checks
  const markFollows = async (e, follows) => {
    setBusy(`f:${e.user_id}`);
    try { await setFollows(e.user_id, follows); await load(true); }
    catch (err) { toast.error(err.message); } finally { setBusy(""); }
  };
  const toggleRecharge = async (e, sent) => {
    setBusy(`r:${e.user_id}`);
    try {
      const r = await setRechargeSent(e.user_id, sent);
      setList((l) => (l || []).map((x) => (x.user_id === e.user_id ? { ...x, recharge_sent_at: r?.recharge_sent_at || null } : x)));
    } catch (err) { toast.error(err.message); } finally { setBusy(""); }
  };
  const exportNoReel = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["name,instagram,whatsapp,email,joined_at,asked_reminder", ...(noReel || []).map((r) => [r.name, r.handle, r.phone, r.email, r.joined_at, r.remind ? "yes" : ""].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "challenge-no-reel-yet.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  useEffect(() => { load(true); }, []);

  // v373: live numbers from Instagram (they were frozen at the day the reel was added), step by step
  const [refreshing, setRefreshing] = useState(null); // { done, total } while running
  const refreshNumbers = async () => {
    if (refreshing) return;
    let offset = 0; let updated = 0; let failed = 0;
    setRefreshing({ done: 0, total: 0 });
    try {
      for (let i = 0; i < 2000; i++) {
        const r = await refreshEntryStats(offset);
        updated += r.updated || 0; failed += (r.errors || []).length;
        setRefreshing({ done: r.next, total: r.total });
        if (r.done || r.next <= offset) break;
        offset = r.next;
      }
      toast.success(`Numbers updated for ${updated} creator${updated === 1 ? "" : "s"}${failed ? ` · ${failed} couldn't be read` : ""}`);
      await load(true);
    } catch (e) { toast.error(e.message); }
    finally { setRefreshing(null); }
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@|^#/, "");
    let a = list || [];
    if (only === "winners") a = a.filter((e) => e.rank);
    else if (only !== "all") a = a.filter((e) => (e.status || "pending") === only); // v377: pending / approved / rejected
    if (t) a = a.filter((e) => String(e.no) === t || (e.name || "").toLowerCase().includes(t) || (e.handle || "").toLowerCase().includes(t));
    return sortEntries(a, by);
  }, [list, by, only, q]);

  const creators = new Set((list || []).map((e) => e.user_id)).size;
  const winners = (list || []).filter((e) => e.rank).length;
  const pendingCount = (list || []).filter((e) => (e.status || "pending") === "pending").length;

  const setRank = async (e, rank) => {
    const key = `${e.user_id}:${e.item_id}`;
    setBusy(key);
    try {
      await markWinner(e, rank);
      setList((l) => (l || []).map((x) => (x.user_id === e.user_id && x.item_id === e.item_id ? { ...x, rank: rank || null } : x)));
      toast.success(rank ? `Entry #${e.no} marked ${RANK_LABEL[rank]}` : `Entry #${e.no} is no longer a winner`);
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not save.");
    } finally { setBusy(""); }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "diwali-challenge-entries.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (editing) return <SponsorsEditor onDone={() => setEditing(false)} />;
  return (
    <div className="space-y-4" data-testid="admin-challenge-entries">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-black tracking-[0.14em] text-[#C2410C]">{CHALLENGE_NAME.toUpperCase()} · ENTRIES CLOSE {dayText(hdr.closesAt).toUpperCase()}</div>
          <h2 className="text-2xl font-black text-slate-900">Challenge entries</h2>
          <a href={PAGE_PATH} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#7C3AED] inline-flex items-center gap-1">Open /challenge <ExternalLink size={12} /></a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} data-testid="open-sponsors" className="h-10 px-4 rounded-xl border border-amber-300 bg-amber-50 text-sm font-bold text-amber-800 inline-flex items-center gap-1.5"><Settings2 size={15} /> Sponsors & prizes</button>
          <button type="button" onClick={() => setShowNoReel((v) => !v)} data-testid="open-no-reel" className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 inline-flex items-center gap-1.5">No reel yet{noReel ? ` · ${noReel.length}` : ""}</button>
          <button type="button" onClick={exportReminders} disabled={!reminders?.length} data-testid="export-reminders" className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-40"><Download size={15} /> Reminder list</button>
          <button type="button" onClick={refreshNumbers} disabled={Boolean(refreshing) || !list?.length} data-testid="refresh-numbers" className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-40"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> {refreshing ? `Updating ${refreshing.done}/${refreshing.total || "…"}` : "Refresh numbers"}</button>
          <button type="button" onClick={exportCsv} disabled={!shown.length} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-40"><Download size={15} /> Export CSV</button>
          <button type="button" onClick={() => { setList(null); load(true); }} className="h-10 px-4 rounded-xl bg-[#7C3AED] text-white text-sm font-bold inline-flex items-center gap-1.5"><RefreshCw size={15} /> Reload list</button>{/* v373: next to "Refresh numbers" — say which is which */}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[["Entries counted", list ? `${list.filter((e) => e.status !== "rejected").length} / ${list.length}` : "…"] /* v396: rejected (incl. auto) don't count */, ["Creators", list ? creators : "…"], ["Pending review", list ? pendingCount : "…"],
          [`${RECHARGE_AMOUNT} UPI left`, rechargeLeft === null ? "…" : `${rechargeLeft} / ${RECHARGE_SLOTS}`], ["Winners marked", list ? winners : "…"], ["Signed up, no reel yet", noReel ? noReel.length : "…"]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-500">{l}</div><div className="text-2xl font-black text-slate-900">{v}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[["views", "Most views"], ["likes", "Most likes"], ["newest", "Newest"], ["oldest", "Oldest"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setBy(k)} aria-pressed={by === k} className={`h-9 px-3.5 rounded-full text-sm font-bold ${by === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`}>{l}</button>
        ))}
        {[["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k} data-testid={`status-filter-${k}`} className={`h-9 px-3.5 rounded-full text-sm font-bold ${only === k ? "bg-[#7C3AED] text-white" : "bg-white border border-slate-200 text-slate-700"}`}>{l}</button>
        ))}
        <button type="button" onClick={() => setOnly(only === "winners" ? "all" : "winners")} aria-pressed={only === "winners"} className={`h-9 px-3.5 rounded-full text-sm font-bold inline-flex items-center gap-1 ${only === "winners" ? "bg-amber-500 text-white" : "bg-white border border-slate-200 text-slate-700"}`}><Trophy size={14} /> Winners only</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, @handle or entry #" className="h-9 flex-1 min-w-[200px] rounded-full border border-slate-200 px-3.5 text-sm outline-none focus:border-[#7C3AED]" />
      </div>

      {showNoReel && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4" data-testid="no-reel-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-black text-slate-900">Signed up, no reel yet</div>
              <div className="text-xs text-slate-500">Creators who joined since the challenge started and haven't entered. Tap WhatsApp to send a nudge.</div>
            </div>
            <button type="button" onClick={exportNoReel} disabled={!noReel?.length} className="h-9 px-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-40"><Download size={14} /> CSV</button>
          </div>
          {!noReel ? <div className="mt-3 text-sm text-slate-500">Loading…</div> : !noReel.length ? <div className="mt-3 text-sm text-slate-500">Everyone who signed up has entered. 🎉</div> : (
            <div className="mt-3 max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {noReel.map((r) => (
                <div key={r.user_id} className="py-2 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{r.name || "—"} {r.handle ? <span className="font-medium text-slate-500">@{r.handle}</span> : null}</div>
                    <div className="text-xs text-slate-500">{[r.phone, r.email, r.joined_at ? `joined ${when(r.joined_at)}` : "", r.remind ? "asked for a reminder" : ""].filter(Boolean).join(" · ")}</div>
                  </div>
                  {waLink(r.phone) ? <a href={waLink(r.phone, NUDGE)} target="_blank" rel="noopener noreferrer" className="h-8 px-3 rounded-lg bg-[#25D366] text-white text-xs font-bold inline-flex items-center">WhatsApp</a> : <span className="text-xs text-slate-500">no number</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold p-3">{error}</div>}
      {list === null ? <CardGridSkeleton count={3} label="Loading entries" /> : !shown.length ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">{list.length ? "No entries match." : "No entries yet. They appear when a creator adds a reel to their Portfolio with \u201cSubmit to Diwali Challenge\u201d on."}</div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[1240px]">
            <thead className="text-[11px] font-black tracking-wider text-slate-500 text-left">
              <tr className="border-b border-slate-100">
                {["ENTRY", "CREATOR", "REEL", "VIEWS", "LIKES", "CHECKS", "ENTERED", "STATUS", `${RECHARGE_AMOUNT} UPI`, "WINNER"].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const key = `${e.user_id}:${e.item_id}`;
                return (
                  <tr key={key} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 font-black text-slate-700">#{e.no}</td>
                    <td className="px-3 py-2">
                      <a href={`/creator/${e.user_id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-900 hover:text-[#7C3AED]">{e.name || "—"}</a>
                      <div className="text-xs text-slate-500">{e.handle ? <a href={`https://instagram.com/${e.handle}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#7C3AED]">@{e.handle}</a> : "no handle"}{e.followers ? ` · ${fmt(e.followers)}` : ""}</div>
                      {e.phone ? <a href={waLink(e.phone)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#128C7E]">WhatsApp {e.phone}</a> : <div className="text-xs text-slate-500">no WhatsApp</div>}
                    </td>
                    <td className="px-3 py-2">
                      <a href={e.content_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                        <span className="w-10 h-12 rounded-lg overflow-hidden bg-violet-50 inline-block">{e.cover && <img src={e.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}</span>
                        <span className="text-xs font-semibold text-[#7C3AED] inline-flex items-center gap-0.5">Open <ExternalLink size={11} /></span>
                      </a>
                    </td>
                    <td className="px-3 py-2 font-bold tabular-nums">{fmt(e.views)}</td>
                    <td className="px-3 py-2 font-bold tabular-nums">{fmt(e.likes)}</td>
                    <td className="px-3 py-2 text-xs font-bold" data-testid="hashtag-cell">
                      {e.caption_ok === true ? <span className="text-emerald-600">✓ All 3 tags</span>
                        : e.caption_ok === false ? <span className="text-rose-600" title="Needs @ybex.in, #Ybex and #YbexDiwaliChallenge">✗ {e.tags ? ["@ybex.in", "#Ybex", "#YbexDiwaliChallenge"].filter((_, i) => ![e.tags.mention, e.tags.ybex, e.tags.challenge][i]).join(" ") + " missing" : "Tags missing"}</span>
                          : e.live_found === false ? <span className="text-amber-600">Reel not found / private</span> : <span className="text-slate-500">Tap Refresh numbers</span>}
                      {e.posted_ok === false && <div className="text-[10.5px] font-bold text-rose-600">Posted before the start</div>}
                      {e.stats_at && <div className="text-[10.5px] font-medium text-slate-500">{when(e.stats_at)}</div>}
                      {/* v396: follow check (admin ticks it; the API can't see followers) */}
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500" data-testid="follow-cell">
                        {e.handle ? <a href={`https://www.instagram.com/${e.handle}/following/`} target="_blank" rel="noopener noreferrer" className="hover:text-[#7C3AED]">Follows @ybex.in?</a> : <span>Follows @ybex.in?</span>}
                        {[[true, "Yes"], [false, "No"]].map(([v, l]) => (
                          <button key={l} type="button" disabled={busy === `f:${e.user_id}`} onClick={() => markFollows(e, e.follows === v ? null : v)} aria-pressed={e.follows === v}
                            className={`h-6 px-1.5 rounded border text-[11px] font-bold disabled:opacity-40 ${e.follows === v ? (v ? "bg-emerald-600 border-emerald-600 text-white" : "bg-rose-600 border-rose-600 text-white") : "border-slate-200 text-slate-600"}`}>{l}</button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{when(e.at)}</td>
                    <td className="px-3 py-2" data-testid="status-cell">
                      <div className={`text-xs font-black ${e.status === "approved" ? "text-emerald-600" : e.status === "rejected" ? "text-rose-600" : "text-amber-600"}`}>{(e.status || "pending").toUpperCase()}</div>
                      {e.auto_rejected && <div className="text-[11px] font-semibold text-rose-500" title="Rejected automatically. Approve to count it anyway.">Auto: {e.auto_reason}</div>}
                      <div className="mt-1 flex gap-1">
                        {/* reject left, approve right (AGENTS.md button rule) */}
                        {e.status !== "rejected" && <button type="button" disabled={busy === key} onClick={() => setStatus(e, "rejected")} className="h-7 px-2 rounded-md border border-red-200 bg-red-50 text-red-600 text-[11px] font-bold disabled:opacity-40">Reject</button>}
                        {e.status && e.status !== "pending" && !e.auto_rejected && <button type="button" disabled={busy === key} onClick={() => setStatus(e, "pending")} className="h-7 px-2 rounded-md border border-slate-200 text-slate-600 text-[11px] font-bold disabled:opacity-40">Undo</button>}
                        {e.status !== "approved" && <button type="button" disabled={busy === key} onClick={() => setStatus(e, "approved")} className="h-7 px-2 rounded-md bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-40">Approve</button>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs" data-testid="recharge-cell">
                      {e.recharge_place ? (() => {
                        // v377 (Ravi): ₹50 only after Approve AND a complete profile
                        const full = Number(e.profile_percent ?? 100) >= 100;
                        const ready = e.status === "approved" && full;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <label className={`inline-flex items-center gap-1.5 font-bold ${ready ? "text-slate-700" : "text-slate-500"}`} title={ready ? "" : e.status !== "approved" ? "Approve the entry before sending the ₹50" : "Profile not complete yet"}>
                              <input type="checkbox" checked={Boolean(e.recharge_sent_at)} disabled={busy === `r:${e.user_id}` || (!ready && !e.recharge_sent_at)} onChange={(ev) => toggleRecharge(e, ev.target.checked)} />
                              #{e.recharge_place} · {e.recharge_sent_at ? "Sent" : "Send"}
                            </label>
                            <span className={`text-[11px] font-semibold ${full ? "text-emerald-700" : "text-amber-700"}`} data-testid="profile-state" title={(e.profile_missing || []).join(", ")}>
                              {full ? "Profile complete" : `Profile ${Number(e.profile_percent || 0)}% · needs ${(e.profile_missing || []).join(", ")}`}
                            </span>
                          </div>
                        );
                      })() : <span className="text-slate-500">Not in first {RECHARGE_SLOTS}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <select value={e.rank || ""} disabled={busy === key} onChange={(ev) => setRank(e, ev.target.value)} aria-label={`Winner for entry ${e.no}`}
                        className={`h-9 rounded-lg border px-2 text-sm font-bold ${e.rank ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}>
                        <option value="">Mark winner…</option>
                        {RANKS.map((r) => <option key={r} value={r}>{RANK_LABEL[r]}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500"><b>Approve</b> only when the reel is the creator's own, public, posted after the challenge started, and the caption has @ybex.in + #Ybex + #YbexDiwaliChallenge (tap “Refresh numbers” to check). The first {RECHARGE_SLOTS} creators (by their first entry that isn't rejected) get {RECHARGE_AMOUNT} by UPI on their WhatsApp number once the entry is approved <b>and their profile is complete</b> (PhonePe / GPay / Paytm → pay to that number) — tick “Sent” once done (one per creator).</p>
      <p className="text-xs text-slate-500">Views and likes are what Instagram showed when the reel was added, until you tap “Refresh numbers” (reads each entrant's last 25 posts live, and checks the hashtag / @ybex.in in the caption). Refresh before you mark winners. Winners show on /challenge from {dayText(hdr.resultsAt)}. Change dates in Sponsors & prizes.</p>
    </div>
  );
}
