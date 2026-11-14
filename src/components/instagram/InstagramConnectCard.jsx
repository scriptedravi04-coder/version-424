import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Copy, MessageCircle, LogIn, CheckCircle2, BadgeCheck, Pencil, Check, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import ButtonSpinner from "../common/ButtonSpinner";
import ConnectInstagramSheet, { ConnectInstagramBody } from "./ConnectInstagramSheet";
import { agoShort, fmtFull, fmtPct, liveNumbers, igErrorText } from "./igFormat";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v349 (Ravi: "Instagram ka real data chahiye — username daalte hi fetch ho jaaye; DM code aur Instagram login dono
// option do"). Creator side of backend/instagramConnect.ts:
//   1. username → live numbers (Meta's official API, public Creator / Business accounts), refreshed every day;
//   2. prove it's yours: send a code by DM to Ybex's Instagram, OR log in on Instagram's own page.
// No password is ever typed into Ybex.
//
// v363 (Ravi's design 1c "Social platforms — Instagram live"; Ravi: "social handles wale page pe do do baar insta aa
// raha hai, ek hi rakho"): this is now the ONE Instagram card — frosted glass on soft purple blooms, photo + @handle,
// the four live numbers in one glass panel, Verified by Ybex, Refresh and Update username. Changing the username goes
// through the "Is this you?" sheet (ConnectInstagramSheet) — nothing is saved before the creator confirms.
// Not connected yet → the same connect flow shows inline. `fallback` is shown when the fetch isn't switched on
// (the manual Instagram card keeps working then); `onStatus` tells the screen what the card is showing.

const IG_RESULT = {
  connected: ["success", "Instagram connected ✅ Your numbers now update by themselves."],
  taken: ["error", "That Instagram is already verified on another Ybex account."],
  expired: ["error", "The Instagram login took too long. Please try again."],
  failed: ["error", "Couldn't connect Instagram. Make sure it's a Creator or Business account and try again."],
};

/** "Disconnect Instagram" (bottom of Social platforms). v366: removes the username, the fetched numbers and the
 *  verification on the server (not only the daily sync). */
export async function disconnectInstagram() {
  await api.post("creator/instagram/disconnect", {});
}

const BLOOMS = "radial-gradient(120% 70% at 0% 0%, rgba(196,165,255,.55) 0%, rgba(196,165,255,0) 60%), radial-gradient(90% 60% at 100% 10%, rgba(255,182,222,.45) 0%, rgba(255,182,222,0) 60%), radial-gradient(100% 80% at 60% 100%, rgba(167,139,250,.35) 0%, rgba(167,139,250,0) 65%), #F7F3FF";

export default function InstagramConnectCard({ initialHandle = "", onUpdated, compact = false, photo = "", fallback = null, onStatus, reloadKey = 0 }) {
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dm, setDm] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const poll = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("creator/instagram", { bypassCache: true });
      setInfo(data); setLoadErr(false);
      return data;
    } catch { setLoadErr(true); return null; }
  };
  useEffect(() => {
    load();
    // back from Instagram Login (?ig=connected | failed | taken | expired)
    try {
      const q = new URLSearchParams(window.location.search);
      const r = q.get("ig");
      if (r) {
        const [kind, msg] = IG_RESULT[r] || ["error", "Instagram login was cancelled."];
        toast[kind](msg);
        q.delete("ig");
        const rest = q.toString();
        window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
      }
    } catch { /* no window */ }
    return () => clearInterval(poll.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (reloadKey) load(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = info?.status || {};
  const cfg = info?.configured || {};
  const anyOn = Boolean(cfg.lookup || cfg.dm || cfg.oauth);
  const available = !loadErr && Boolean(info) && (anyOn || Boolean(st.synced));
  useEffect(() => {
    if (!info && !loadErr) return;
    onStatus?.({ available, synced: Boolean(st.synced), verified: Boolean(st.verified), handle: st.handle || null });
  }, [info, loadErr]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterChange = async (fallbackStatus) => {
    const fresh = await load();
    onUpdated?.(fresh?.status || fallbackStatus || null);
  };

  // Refresh = the same account again (no confirm needed — the username doesn't change).
  const refreshNow = async () => {
    if (!st.handle) return;
    setErr(""); setBusy("fetch");
    try {
      const { data } = await api.post("creator/instagram/lookup", { username: st.handle });
      toast.success("Numbers refreshed from Instagram ✅");
      await afterChange(data?.status);
    } catch (e) {
      setErr(igErrorText(e, "Couldn't refresh. Try again."));
    } finally { setBusy(""); }
  };

  const startDm = async () => {
    setErr(""); setBusy("dm");
    try {
      const { data } = await api.post("creator/instagram/dm-code", { username: st.handle });
      setDm(data);
      clearInterval(poll.current);
      let left = 60; // ~4 minutes
      poll.current = setInterval(async () => {
        left -= 1;
        const d = await load();
        if (d?.status?.verified) { clearInterval(poll.current); setDm(null); toast.success("Instagram verified ✅"); onUpdated?.(d.status); }
        if (left <= 0) clearInterval(poll.current);
      }, 4000);
    } catch (e) { setErr(e?.response?.data?.error || "Couldn't make a code. Try again."); }
    finally { setBusy(""); }
  };

  const startLogin = async () => {
    setErr(""); setBusy("oauth");
    try {
      const { data } = await api.get("creator/instagram/oauth-url", { bypassCache: true });
      if (data?.url) window.location.href = data.url;
    } catch (e) { setErr(e?.response?.data?.error || "Couldn't open Instagram. Try again."); setBusy(""); }
  };

  const copy = (t) => { try { navigator.clipboard.writeText(t); toast.success("Code copied"); } catch { /* no clipboard */ } };

  if (loadErr) return fallback; // older server: the manual platform card still works
  if (!info) return <div className="h-40 rounded-[24px] bg-slate-100 animate-pulse" />;
  if (!anyOn && !st.synced) return fallback; // not switched on yet → manual card

  // ── not connected yet: design 1b inline ──
  if (!st.synced) {
    return (
      <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-white to-[#E9DDFF]" data-testid="ig-connect">
        <div className={`rounded-[23px] ${compact ? "p-4" : "p-5"} space-y-3`} style={{ background: BLOOMS }}>
          <div className="flex items-center gap-2.5">
            <SocialLogo platform="instagram" size={40} variant="tile" />
            <div className="min-w-0">
              <div className="text-[15px] font-black text-slate-900">Connect Instagram</div>
              <div className="text-[11.5px] text-slate-500 font-medium">Brands trust real numbers. They update every day by themselves.</div>
            </div>
          </div>
          {st.last_error === "not_professional" && (
            <p className="m-0 text-[12px] font-semibold text-amber-700">Your Instagram is a personal account, so numbers can't update by themselves. Instagram → Settings → Account type → <b>Switch to Creator</b> (free, 30 seconds), then try again.</p>
          )}
          {cfg.lookup ? (
            <div className="rounded-[20px] bg-white/70 backdrop-blur-md border border-white p-4">
              <ConnectInstagramBody initialUsername={initialHandle || st.handle || ""} onConnected={(s) => afterChange(s)} />
            </div>
          ) : (
            <p className="m-0 text-[12px] text-slate-500 font-medium">Instagram fetch is being switched on. Add your numbers by hand for now.</p>
          )}
        </div>
      </div>
    );
  }

  // ── connected: design 1c ──
  const n = liveNumbers(st.stats);
  const pic = photo || st.stats?.photo_url || st.stats?.profile_picture_url || "";
  const cell = (label, value, accent = false) => (
    <div className="px-4 py-3">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[22px] leading-none font-black tracking-[-0.02em] ${accent ? "text-[#7C3AED]" : "text-slate-900"}`}>{value}</div>
    </div>
  );
  return (
    <div className="rounded-[26px] relative overflow-hidden" style={{ background: BLOOMS }} data-testid="ig-connect">
      <div className={`${compact ? "p-4" : "p-5"} space-y-3.5`}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full p-[2.5px] bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] shrink-0">
            <div className="w-full h-full rounded-full bg-white p-[2px] overflow-hidden">
              {pic ? <img src={pic} alt="" className="w-full h-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center"><SocialLogo platform="instagram" size={22} /></div>}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[17px] font-black text-slate-900 truncate">@{st.handle}</span>
              {st.verified && <BadgeCheck size={17} className="text-[#7C3AED] shrink-0" aria-label="Verified" />}
            </div>
            <div className="text-[12px] text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">Synced {agoShort(st.synced_at) || "recently"} · refreshes daily</span>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-white/65 backdrop-blur-md border border-white shadow-[0_8px_28px_-18px_rgba(76,29,149,.45)] overflow-hidden" data-testid="ig-live-numbers">
          <div className="grid grid-cols-2 divide-x divide-slate-200/70">{cell("Followers", fmtFull(n.followers))}{cell("Avg views", fmtFull(n.avgViews))}</div>
          <div className="grid grid-cols-2 divide-x divide-slate-200/70 border-t border-slate-200/70">{cell("Avg likes", fmtFull(n.avgLikes))}{cell("Engagement", fmtPct(n.engagement), true)}</div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200/70 bg-white/40">
            {st.verified
              ? <span className="text-[10.5px] font-black uppercase tracking-wide text-emerald-700 flex items-center gap-1"><Check size={12} strokeWidth={3} /> Verified by Ybex</span>
              : (cfg.dm || cfg.oauth)
                ? <span className="text-[10.5px] font-black uppercase tracking-wide text-amber-700">Not verified yet</span>
                /* v372: no way to verify is switched on → don't show a warning the creator can't fix */
                : <span className="text-[10.5px] font-black uppercase tracking-wide text-emerald-700 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live from Instagram</span>}
            <span className="text-[11px] text-slate-500 font-medium">Brands see these numbers</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={refreshNow} disabled={!!busy} className="h-12 rounded-2xl bg-white/70 backdrop-blur-md border border-white text-[14px] font-bold text-slate-800 flex items-center justify-center gap-1.5 disabled:opacity-50" data-testid="ig-refresh">
            {busy === "fetch" ? <ButtonSpinner label="Refreshing…" /> : <><RefreshCw size={15} /> Refresh</>}
          </button>
          <button type="button" onClick={() => setSheet(true)} disabled={!!busy} className="h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[14px] font-bold flex items-center justify-center gap-1.5 shadow-[0_10px_22px_-12px_rgba(124,58,237,1)] disabled:opacity-50" data-testid="ig-update-username">
            <Pencil size={14} /> Update username
          </button>
        </div>

        {!st.verified && (cfg.dm || cfg.oauth) && (
          <div className="rounded-2xl bg-white/55 border border-white">
            <button type="button" onClick={() => setVerifyOpen((v) => !v)} className="w-full min-h-11 px-3.5 flex items-center justify-between text-left text-[13px] font-bold text-slate-800" aria-expanded={verifyOpen}>
              Get the Verified by Ybex tick <ChevronDown size={16} className={`transition ${verifyOpen ? "rotate-180" : ""}`} />
            </button>
            {verifyOpen && (
              <div className="px-3.5 pb-3.5 grid grid-cols-1 gap-2">
                {cfg.dm && (
                  <button type="button" onClick={startDm} disabled={!!busy} className="min-h-11 px-3 py-2 rounded-xl border border-slate-200 bg-white text-left disabled:opacity-50">
                    <div className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5"><MessageCircle size={14} /> {busy === "dm" ? "Making code…" : "Send a code by DM"}</div>
                    <div className="text-[11px] text-slate-500">No login. Send one message to Ybex on Instagram.</div>
                  </button>
                )}
                {cfg.oauth && (
                  <button type="button" onClick={startLogin} disabled={!!busy} className="min-h-11 px-3 py-2 rounded-xl border border-slate-200 bg-white text-left disabled:opacity-50">
                    <div className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5"><LogIn size={14} /> {busy === "oauth" ? "Opening Instagram…" : "Log in with Instagram"}</div>
                    <div className="text-[11px] text-slate-500">On Instagram's own page — Ybex never sees your password. Adds reach & views.</div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {dm && (
          <div className="rounded-xl bg-white border border-dashed border-[#DD2A7B] p-3 space-y-2" data-testid="ig-dm-code">
            <div className="text-[12px] text-slate-600">Send this code as a DM to <b>@{dm.dm_to}</b> from @{st.handle}:</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-black tracking-widest text-slate-900">{dm.code}</span>
              <button type="button" onClick={() => copy(dm.code)} className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1"><Copy size={12} /> Copy</button>
            </div>
            <a href={dm.dm_link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 px-4 rounded-xl bg-gradient-to-r from-[#DD2A7B] to-[#8134AF] text-white text-sm font-bold items-center gap-1.5"><MessageCircle size={14} /> Open Instagram DM</a>
            <div className="text-[11px] text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> We'll tick it here by itself once your message arrives (code works for {dm.expires_in_min} min).</div>
          </div>
        )}

        {err && <p className="m-0 text-[12px] font-semibold text-rose-600">{err}</p>}
      </div>
      <ConnectInstagramSheet open={sheet} onClose={() => setSheet(false)} initialUsername="" onConnected={(s) => afterChange(s)} />{/* empty on purpose: "Update username" = type the new one */}
    </div>
  );
}
