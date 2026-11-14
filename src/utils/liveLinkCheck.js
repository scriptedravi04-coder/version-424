// Session 40 (Ravi OK: "in pr bhi ok h"): the live link a creator submits must be the posted
// content itself — an Instagram post/reel or a YouTube video — not a profile, a channel or a
// Drive file. Checked in the browser before the (unchanged) submit call.
const IG_POST = /^\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/[\w-]+/i;
const NOT_A_POST_HOSTS = /(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com|wetransfer\.com|we\.tl|onedrive\.live\.com|1drv\.ms)$/i;

export function normaliseLink(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** { ok, platform, url, message } — message is shown under the field when ok is false. */
export function checkLiveLink(raw) {
  const url = normaliseLink(raw);
  if (!url) return { ok: false, platform: null, url, message: "" };
  let u;
  try { u = new URL(url); } catch (e) { return { ok: false, platform: null, url, message: "This doesn't look like a link. Paste the full link to your post." }; }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (!host.includes(".")) return { ok: false, platform: null, url, message: "This doesn't look like a link. Paste the full link to your post." };

  if (host === "instagram.com" || host === "instagr.am") {
    if (IG_POST.test(u.pathname)) return { ok: true, platform: "instagram", url, message: "" };
    return { ok: false, platform: "instagram", url, message: "That's a profile link. Open your post or reel, tap Share → Copy link, and paste it here." };
  }
  if (host === "youtu.be") {
    if (u.pathname.replace(/\//g, "")) return { ok: true, platform: "youtube", url, message: "" };
    return { ok: false, platform: "youtube", url, message: "Paste the link to the video itself." };
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    if ((u.pathname === "/watch" && u.searchParams.get("v")) || /^\/(shorts|live|embed)\/[\w-]+/.test(u.pathname)) {
      return { ok: true, platform: "youtube", url, message: "" };
    }
    return { ok: false, platform: "youtube", url, message: "That's a channel link. Paste the link to the video itself." };
  }
  if (NOT_A_POST_HOSTS.test(host)) {
    return { ok: false, platform: null, url, message: "A live link is the post on your page, not a file link. Post it first, then paste that link." };
  }
  // Other public platforms (Facebook, X, LinkedIn, Moj, Josh, Snapchat…): accepted as they are.
  return { ok: true, platform: "other", url, message: "" };
}
