import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ShieldCheck, X, AtSign } from "lucide-react";
import { api } from "../../lib/api";
import ButtonSpinner from "../common/ButtonSpinner";
import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { cleanIgHandle, fmtFull, igErrorText } from "./igFormat";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v363 (Ravi's design 1b "Connect — username in, 'Is this you?' out"; Ravi: "Social page pe @narendramodi ke numbers
// aa gaye jabki username elite_ravi tha"): typing a username used to SAVE that account's numbers on the creator's
// profile straight away. Now the username only fetches a preview (POST instagram/preview — nothing saved), shows the
// photo, name and numbers, and saves (POST creator/instagram/lookup) only after "Yes, that's me — connect".
// A typo or someone else's account can't land on the profile any more.

export function ConnectInstagramBody({ initialUsername = "", onConnected, onCancel, compact = false }) {
  const [username, setUsername] = useState(initialUsername ? `${String(initialUsername).replace(/^@+/, "")}` : "");
  const [state, setState] = useState("idle"); // idle | fetching | found | error | saving
  const [preview, setPreview] = useState(null); // { stats, media }
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const timer = useRef(null);
  const handle = cleanIgHandle(username);

  const runPreview = async (h) => {
    const my = ++seq.current;
    setState("fetching"); setErr(""); setPreview(null);
    try {
      const { data } = await api.post("instagram/preview", { username: h });
      if (my !== seq.current) return;
      setPreview({ stats: data?.stats || {}, media: Array.isArray(data?.media) ? data.media : null });
      setState("found");
    } catch (e) {
      if (my !== seq.current) return;
      setErr(igErrorText(e, "Couldn't fetch. Try again.", "Couldn't find that account. Check the spelling and that it's public."));
      setState("error");
    }
  };

  // 600 ms after typing stops (design dev note 1) — or right away on Enter / the button.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!handle) { seq.current += 1; setState("idle"); setPreview(null); setErr(""); return undefined; }
    timer.current = setTimeout(() => runPreview(handle), 600);
    return () => clearTimeout(timer.current);
  }, [handle]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    if (!handle || state !== "found") return;
    setState("saving");
    try {
      const { data } = await api.post("creator/instagram/lookup", { username: handle });
      toast.success("Instagram connected ✅ Your numbers now update every day.");
      onConnected?.(data?.status || null);
    } catch (e) {
      setErr(igErrorText(e, "Couldn't connect. Try again."));
      setState("found");
    }
  };

  const tryAnother = () => { seq.current += 1; setUsername(""); setPreview(null); setState("idle"); setErr(""); };

  const s = preview?.stats || {};
  const collabs = Array.isArray(preview?.media) ? preview.media.filter((m) => m?.collab).length : null;
  const inputBorder = state === "found" ? "border-[#7C3AED] ring-4 ring-[#7C3AED]/10" : state === "error" ? "border-rose-300" : "border-slate-200 focus-within:border-[#7C3AED]";

  return (
    <div className="space-y-3" data-testid="ig-connect-body">
      {!compact && (
        <div>
          <h3 className="m-0 text-[22px] leading-[1.15] font-black tracking-[-0.03em] text-slate-900">Just your username.<br />We'll fetch the rest.</h3>
          <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-slate-500 font-medium">No login, no password. We read your public profile and refresh it daily.</p>
        </div>
      )}
      <div className={`h-[52px] rounded-2xl border bg-white flex items-center gap-2 px-3.5 transition ${inputBorder}`}>
        <AtSign size={16} className="text-slate-500 shrink-0" />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && handle) { clearTimeout(timer.current); runPreview(handle); } }}
          placeholder="your_instagram"
          aria-label="Instagram username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          className="flex-1 min-w-0 h-full bg-transparent text-[16px] font-semibold text-slate-900 outline-none"
        />
        {state === "fetching" && <span className="w-5 h-5 rounded-full border-2 border-[#7C3AED]/25 border-t-[#7C3AED] animate-spin shrink-0" aria-label="Fetching" />}
        {state === "found" && <span className="w-8 h-8 rounded-xl bg-[#F3EBFF] text-[#7C3AED] flex items-center justify-center shrink-0"><Check size={16} strokeWidth={3} /></span>}
      </div>
      {state === "fetching" && <div className="text-[12px] font-semibold text-[#7C3AED] flex items-center gap-1.5">Fetching the profile from Meta…</div>}
      {state === "found" && <div className="text-[12px] font-semibold text-emerald-600 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Public account found</div>}
      {err && (
        <div className="text-[12px] font-semibold text-rose-600 flex items-center justify-between gap-2">
          <span>{err}</span>
          {handle && state === "error" && <button type="button" onClick={() => runPreview(handle)} className="shrink-0 min-h-9 px-3 rounded-xl border border-rose-200 text-rose-600 text-[12px] font-bold">Retry</button>}
        </div>
      )}

      {(state === "found" || state === "saving") && (
        <div className="rounded-[20px] border border-slate-200 bg-white p-4 text-center" data-testid="ig-is-this-you">
          <div className="mx-auto w-[76px] h-[76px] rounded-full p-[3px] bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]">
            <div className="w-full h-full rounded-full bg-white p-[2px] overflow-hidden">
              {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center"><SocialLogo platform="instagram" size={30} /></div>}
            </div>
          </div>
          <div className="mt-2.5 text-[16px] font-black text-slate-900">{s.name || `@${s.username || handle}`}</div>
          <div className="text-[12px] text-slate-500 font-medium">@{s.username || handle}</div>
          <div className={`mt-3 pt-3 border-t border-slate-100 grid ${collabs !== null ? "grid-cols-3" : "grid-cols-2"}`}>
            <div><div className="text-[17px] font-black text-slate-900">{fmtFull(s.followers)}</div><div className="text-[11px] text-slate-500 font-medium">Followers</div></div>
            <div className="border-l border-slate-100"><div className="text-[17px] font-black text-slate-900">{fmtFull(s.media_count)}</div><div className="text-[11px] text-slate-500 font-medium">Posts</div></div>
            {collabs !== null && <div className="border-l border-slate-100"><div className="text-[17px] font-black text-slate-900">{collabs}</div><div className="text-[11px] text-slate-500 font-medium">Brand collabs</div></div>}
          </div>
        </div>
      )}

      {(state === "found" || state === "saving") && (
        <>
          <div className="rounded-2xl bg-slate-50 px-3.5 py-3 flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-500 font-medium">
            <ShieldCheck size={16} className="text-[#7C3AED] shrink-0 mt-0.5" />
            <span>To get <b className="text-slate-800">Verified by Ybex</b>, you can prove it's yours with a DM code after connecting. Optional.</span>
          </div>
          <button type="button" onClick={connect} disabled={state === "saving"} className="w-full h-[52px] rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[15px] font-bold shadow-[0_10px_22px_-12px_rgba(124,58,237,1)] disabled:opacity-60" data-testid="ig-connect-confirm">
            {state === "saving" ? <ButtonSpinner label="Connecting…" /> : "Yes, that's me — connect"}
          </button>
          <button type="button" onClick={tryAnother} disabled={state === "saving"} className="w-full min-h-10 text-[13px] font-semibold text-slate-500">Not me, try another username</button>
        </>
      )}
      {onCancel && state !== "found" && state !== "saving" && (
        <button type="button" onClick={onCancel} className="w-full min-h-10 text-[13px] font-semibold text-slate-500">Cancel</button>
      )}
    </div>
  );
}

/** Bottom sheet version (opened by "Update username" on the live card). */
export default function ConnectInstagramSheet({ open, onClose, initialUsername = "", onConnected }) {
  return (
    <Presence>
      {open && (
        <PopupBackdrop key="ig-connect-sheet" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose} data-testid="ig-connect-sheet">
          <PopupPanel kind="auto" below={640} onClose={onClose} role="dialog" aria-modal="true" aria-label="Connect Instagram"
            className="w-full sm:max-w-[420px] bg-white rounded-t-[26px] sm:rounded-[26px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] box-border max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[#E5E5EA]" />
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-black text-slate-900">Connect Instagram</div>
              <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><X size={16} /></button>
            </div>
            <ConnectInstagramBody initialUsername={initialUsername} onConnected={(st) => { onConnected?.(st); onClose?.(); }} />
          </PopupPanel>
        </PopupBackdrop>
      )}
    </Presence>
  );
}
