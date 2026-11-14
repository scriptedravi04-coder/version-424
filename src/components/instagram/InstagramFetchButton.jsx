import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v352 (Ravi: "jaha jaha username daalte hain — creator form, onboarding, profile settings, admin — sab jagah
// Fetch lagao"). One small row that sits under any Instagram username box.
// v354 (Ravi: "username ek baar daala, bas — sab apne aap aa jaaye, 'Fetching your data' popup dikha do"):
//   • auto: once the person stops typing a valid username (~1 s), it fetches by itself and shows a small
//     "Fetching your Instagram data…" popup; the boxes fill in. The button stays for a manual refresh.
//     A username that was already there when the screen opened is NOT fetched again (no wasted calls).
//   • onFetched also gets photo_url (our copy of the Instagram picture), bio_email and media (last posts).
//   save={false} (default) → POST /instagram/preview: nothing saved, the form saves as usual (apply form, onboarding, admin).
//   save={true}            → POST /creator/instagram/lookup: logged-in creator, saved + marked "synced" (settings).
// Hidden until Ravi switches the fetch on (IG_GRAPH_TOKEN + IG_BUSINESS_ID secrets), so nothing changes before that.

let configPromise = null;
export function loadIgFetchConfig() {
  if (!configPromise) {
    configPromise = api.get("instagram/config", { bypassCache: true })
      .then(({ data }) => Boolean(data?.lookup))
      .catch(() => { configPromise = null; return false; });
  }
  return configPromise;
}

const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN"));

/** "@Name", "instagram.com/name/?igsh=…" → "name" (same rule as the server), or "" when not a username. */
export function igUsername(v) {
  let s = String(v ?? "").trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9._]{2,30}$/.test(s) && !/^\.|\.\.|\.$/.test(s) ? s : "";
}

/** stats from either route → the same small shape every form uses. */
export function igFormNumbers(stats, extra = {}) {
  const s = stats || {};
  const n = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
  return {
    username: s.username || null,
    name: s.name || null,
    followers: n(s.followers),
    avg_views: n(s.avg_views || s.reach_28d),
    avg_likes: n(s.avg_likes),
    avg_comments: n(s.avg_comments),
    engagement_rate: s.engagement_rate ?? null,
    photo_url: extra.photo_url || s.photo_url || null, // v354: our stored copy, never Instagram's expiring link
    bio_email: s.bio_email || null,                     // v354: an e-mail written in the bio (if any)
    bio: s.bio || null,                                 // v363: Instagram bio (brand step 1 fills the description)
    website: s.website || null,                         // v366: website on the Instagram profile (brand step 1)
    media: Array.isArray(extra.media) ? extra.media : Array.isArray(s.media) ? s.media : [], // v354: last posts
  };
}

/** A photo that may be replaced by the Instagram one (none, our Instagram copy, or a login / placeholder picture). */
export function photoIsReplaceable(url) {
  const u = String(url || "").trim();
  return !u || /\/avatars\/ig\//.test(u) || /googleusercontent\.com|ui-avatars\.com|dicebear\.com|gravatar\.com/i.test(u);
}

/** Onboarding (desktop + mobile share one store): numbers, the photo (unless they uploaded one) and the name
 *  (if empty) go in; Instagram counts as linked so the Instagram-numbers step isn't asked again. */
export function fillOnboardingFromIg(updateField, n, store = null) {
  if (n.followers !== null) updateField("followerCount", n.followers);
  if (n.avg_views !== null) updateField("instagramAvgReach", n.avg_views);
  if (n.avg_likes !== null) updateField("instagramAvgLikes", n.avg_likes);
  if (n.avg_comments !== null) updateField("instagramAvgComments", n.avg_comments);
  if (!store) return;
  if (n.photo_url && photoIsReplaceable(store.photoUrl)) updateField("photoUrl", n.photo_url);
  if (n.name && !String(store.fullName || "").trim()) updateField("fullName", n.name);
  if (n.followers !== null && store.instagramConnectedVia !== "oauth") updateField("instagramConnectedVia", "instagram_fetch");
}

function FetchingPopup({ username }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 px-6" data-testid="ig-fetching">
      <div className="w-full max-w-[300px] rounded-3xl bg-white shadow-2xl p-5 text-center">
        <div className="mx-auto w-14 h-14 flex items-center justify-center animate-pulse">
          <SocialLogo platform="instagram" size={56} />
        </div>
        <div className="mt-3 text-[15px] font-black text-slate-900">Fetching your Instagram data…</div>
        <div className="mt-1 text-[12px] text-slate-500 font-medium">@{username} · followers, reach, engagement & photo</div>
        <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#DD2A7B] to-[#8134AF] animate-[igbar_1.1s_ease-in-out_infinite]" /></div>
        <style>{"@keyframes igbar{0%{transform:translateX(-100%)}100%{transform:translateX(220%)}}"}</style>
      </div>
    </div>,
    document.body,
  );
}

export default function InstagramFetchButton({ username, onFetched, save = false, auto = true, className = "" }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const first = useRef(igUsername(username)); // already there when the screen opened → not auto-fetched
  const done = useRef(new Set());             // usernames fetched on this screen (auto never repeats one)
  const cb = useRef(onFetched);
  cb.current = onFetched;

  useEffect(() => { let live = true; loadIgFetchConfig().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  useEffect(() => { setMsg(null); }, [username]);

  const clean = igUsername(username);
  const ready = Boolean(clean);

  const go = async (isAuto = false) => {
    if (!clean || busy) return;
    done.current.add(clean);
    setBusy(true); setMsg(null);
    try {
      const { data } = save
        ? await api.post("creator/instagram/lookup", { username: clean })
        : await api.post("instagram/preview", { username: clean });
      const nums = save
        ? igFormNumbers(data?.status?.stats, { photo_url: data?.photo_url, media: data?.media })
        : igFormNumbers(data?.stats, { media: data?.media });
      cb.current?.(nums);
      const bits = [`${fmt(nums.followers)} followers`];
      if (nums.photo_url) bits.push("photo");
      setMsg({ ok: true, text: `${bits.join(" + ")} fetched${save ? " · updates by itself" : ""}` });
    } catch (e) {
      const text = e?.response?.data?.error || "Couldn't fetch. Type the numbers by hand.";
      setMsg({ ok: false, text: isAuto ? `${text}` : text });
    } finally { setBusy(false); }
  };

  // v354: auto-fetch ~1 s after a new, valid username is typed.
  useEffect(() => {
    if (!on || !auto || !clean || clean === first.current || done.current.has(clean)) return undefined;
    const t = setTimeout(() => go(true), 1000);
    return () => clearTimeout(t);
  }, [on, auto, clean]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 ${className}`} data-testid="ig-fetch">
      {busy && <FetchingPopup username={clean} />}
      <button type="button" onClick={() => go(false)} disabled={!ready || busy}
        className="h-9 px-3 rounded-xl bg-gradient-to-r from-[#DD2A7B] to-[#8134AF] text-white text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0">
        <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> {busy ? "Fetching…" : msg?.ok ? "Refresh" : "Fetch from Instagram"}
      </button>
      {msg ? (
        <span className={`text-[12px] font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-600"} inline-flex items-center gap-1`}>
          {msg.ok && <CheckCircle2 size={12} />} {msg.text}
        </span>
      ) : (
        <span className="text-[11px] text-slate-500 font-medium">{auto ? "Type your username — we fill the rest" : "Fills the numbers for you"} (Creator / Business accounts)</span>
      )}
    </div>
  );
}
