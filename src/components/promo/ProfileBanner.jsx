import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { safeStorage } from "../../utils/storage";
import { FESTIVE_UNTIL } from "../../lib/diwaliChallenge";

// v290 (Ravi, Swish-style): admin-uploaded strip under the photo on My Profile (creator + brand).
// 1080 × 200 poster, whole strip tappable. No banner live → nothing, not even empty space.
//
// Session 48 (Ravi: "the invite banner pops in a few ms after the profile opens — it should already be
// there"): the banner is fetched and its picture downloaded in the background as soon as the person is
// logged in (prefetchProfileBanner, called from the app shell), and the last answer is remembered on
// the phone. The profile page then draws it on the very first frame and only refreshes it quietly.
const KEY = "ybex_profile_banner";
let mem; // undefined = not asked yet · null = none live · object = banner
let inflight = null;
// v344: the banner is per role, so the cache is keyed by role + user id — another account on the same
// phone must not see the previous account's banner. A new key resets the in-memory cache.
let memKey = null;
const whoKey = () => {
  try { const u = JSON.parse(safeStorage.getItem("ybex_user") || "null"); return u ? `${u.role || ""}:${u.user_id || u.id || ""}` : "anon"; } catch { return "anon"; }
};
const storeKey = () => {
  const k = whoKey();
  if (k !== memKey) { memKey = k; mem = undefined; inflight = null; }
  return `${KEY}:${k}`;
};
const readStore = () => { try { const v = localStorage.getItem(storeKey()); return v ? JSON.parse(v) : undefined; } catch { return undefined; } };
const writeStore = (v) => { try { const k = storeKey(); if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* private mode */ } };
const warm = (url) => { try { if (url) { const im = new Image(); im.src = url; } } catch { /* no window */ } };

// v415: festive (Diwali / challenge) banners must not outlive the event, even from the phone's cache or when
// the server can't be reached. Entries close 8 Nov 2026 (FESTIVE_UNTIL, 23:59 IST) — entry banners and every
// brand banner go then; the event runs till 15 Nov 2026 23:59 IST — every Diwali banner is gone after that.
export const DIWALI_EVENT_END = Date.parse("2026-11-15T18:29:59Z");
const roleNow = () => { try { return String(JSON.parse(safeStorage.getItem("ybex_user") || "null")?.role || "").toLowerCase(); } catch { return ""; } };
export function bannerExpired(b, now = Date.now(), role = roleNow()) {
  if (!b) return false;
  const end = Date.parse(b.ends_at || b.end_at || "");
  if (Number.isFinite(end) && end <= now) return true;
  const text = `${b.link_url || ""} ${b.image_url || ""} ${b.title || ""} ${b.name || ""}`;
  if (!/diwali|deepavali|challenge/i.test(text)) return false;
  if (now > DIWALI_EVENT_END) return true;
  const entryLink = /diwali=1|add=1|enter|entry/i.test(String(b.link_url || ""));
  return now > FESTIVE_UNTIL && (entryLink || role === "brand");
}
const live = (b) => (b && !bannerExpired(b) ? b : null);

/** Current best guess, available synchronously (memory first, then what the phone remembered). */
export function cachedProfileBanner() {
  storeKey(); // v344: drop the other account's in-memory banner
  if (mem === undefined) { const s = readStore(); if (s !== undefined) { mem = s; warm(s?.image_url); } }
  return live(mem); // v415: an ended Diwali banner is never drawn from the cache
}

/** Ask the server for the live banner and download its picture. Safe to call many times. */
export function prefetchProfileBanner() {
  const askedFor = storeKey(); // v344: resets mem/inflight when the account changed
  if (inflight) return inflight;
  inflight = api.get("promos/banner", { bypassCache: true })
    .then((r) => {
      const x = r.data?.banner || null;
      if (storeKey() !== askedFor) return null; // v344: account switched mid-request
      if (!x) { mem = null; writeStore(null); return null; }
      return new Promise((res) => {
        const im = new Image();
        im.onload = () => { mem = x; writeStore(x); res(x); };
        im.onerror = () => res(mem || null);
        im.src = x.image_url;
      });
    })
    .catch(() => mem || null)
    .finally(() => { setTimeout(() => { inflight = null; }, 15000); });
  return inflight;
}

export default function ProfileBanner({ style }) {
  const navigate = useNavigate();
  const [b, setB] = useState(() => cachedProfileBanner());
  // v415: a banner arriving after the page drew would push the page down (layout shift). If none was drawn,
  // the answer is only remembered for the next visit; a drawn banner is swapped in place (same size) or removed.
  useEffect(() => {
    let off = false;
    prefetchProfileBanner().then((raw) => {
      if (off) return;
      const x = live(raw);
      setB((cur) => {
        if (!cur) return cur; // v415: don't pop in late
        return cur?.id === x?.id && cur?.image_url === x?.image_url ? cur : x;
      });
    });
    return () => { off = true; };
  }, []);
  useEffect(() => { if (b?.id) api.post(`promos/${b.id}/event`, { type: "view" }).catch(() => {}); }, [b?.id]);
  if (!b) return null;
  const tap = () => {
    api.post(`promos/${b.id}/event`, { type: "click" }).catch(() => {});
    const l = String(b.link_url || "");
    if (!l) return;
    if (l.startsWith("/")) navigate(l); else window.open(l, "_blank", "noopener");
  };
  return (
    <button type="button" onClick={tap} data-testid="profile-banner" aria-label={b.title || b.name || "Open offer"} /* v332: says what it is */
      style={{ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", cursor: b.link_url ? "pointer" : "default", ...style }}>
      <img src={b.image_url} alt="" onError={() => setB(null) /* v415: a dead picture leaves no empty box */} decoding="sync" loading="eager" style={{ display: "block", width: "100%", aspectRatio: "1080 / 200", objectFit: "cover", borderRadius: 16 }} />
    </button>
  );
}
