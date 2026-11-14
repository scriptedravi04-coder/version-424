// v367: the server calls of the Diwali Creator Challenge (backend/challenge_routes.ts). Screens import these, so
// layout-only screen files (src/session49.test.js) stay free of api calls.
import { api } from "./api";

// v373 deep test: opening the app asked /challenge/public three times at once (opening poster, Home "Powered by",
// the offer page) — each answer carries the sponsor logos. One shared answer for 20 s.
let pubCache = null; // { at, promise }
export async function getChallengePublic() {
  if (!pubCache || Date.now() - pubCache.at >= 20_000) {
    const promise = api.get("challenge/public", { bypassCache: true }).then(({ data }) => ({ data: data || {}, got: Date.now() }));
    pubCache = { at: Date.now(), promise };
    promise.catch(() => { if (pubCache?.promise === promise) pubCache = null; });
  }
  // server time moves on while the shared answer waits (the countdown uses it)
  const { data, got } = await pubCache.promise;
  return data && Number(data.now) ? { ...data, now: Number(data.now) + (Date.now() - got) } : data;
}
export const __resetChallengePublic = () => { pubCache = null; }; // tests

/** My entries + whether I can enter. null when logged out / failed. */
export async function getMyChallenge() {
  try {
    const { data } = await api.get("challenge/me", { bypassCache: true });
    return data || null;
  } catch { return null; }
}

/** Signed stamps for items about to be saved with "Submit to Diwali Challenge" ON. Throws with the server's message. */
export async function stampEntries(items, handle = "") {
  try {
    const { data } = await api.post("challenge/stamp", { items: (items || []).map((i) => ({ id: i.id, content_url: i.content_url })), ...(handle ? { handle } : {}) });
    return data?.stamps || {};
  } catch (e) {
    const msg = e?.response?.data?.error || "Could not enter the challenge. Try again.";
    const err = new Error(msg);
    err.code = e?.response?.data?.code;
    throw err;
  }
}

export async function getAdminEntries(fresh = false) {
  const { data } = await api.get(`admin/challenge/entries${fresh ? "?fresh=1" : ""}`, { bypassCache: true });
  return data?.entries || [];
}

export async function markWinner(entry, rank) {
  const { data } = await api.post("admin/challenge/winner", { user_id: entry.user_id, item_id: entry.item_id, rank: rank || null });
  return data;
}

/** v368: sponsors (name, logo, scripts) + prizes the admin edits. */
export async function getAdminConfig() {
  const { data } = await api.get("admin/challenge/config", { bypassCache: true });
  return data?.config || null;
}
export async function saveAdminConfig(config) {
  try {
    const { data } = await api.post("admin/challenge/config", { config });
    pubCache = null; // the offer page shows the new sponsors / dates straight away
    return data?.config || config;
  } catch (e) {
    throw new Error(e?.response?.data?.error || e?.response?.data?.detail || "Could not save.");
  }
}

/** v371: an example reel / its cover → our storage (bucket "banners", same as Admin → Banners). Returns the link. */
export const MAX_REEL_MB = 30; // Cloud Run takes ~32 MB per request — keep under 30 MB
export async function uploadChallengeFile(file, name) {
  const fd = new FormData();
  fd.append("file", file, name || file?.name || "reel.mp4");
  try {
    const { data } = await api.post("upload?bucket=banners", fd, { headers: { "Content-Type": "multipart/form-data" } });
    if (!data?.url) throw new Error("No link back from the upload.");
    return data.url;
  } catch (e) {
    const st = e?.response?.status;
    throw new Error(st === 413 ? `This file is too big. Keep it under ${MAX_REEL_MB} MB.` : e?.response?.data?.detail || e?.message || "Upload failed. Try again.");
  }
}

/** v371: "Not yet — remind me". */
export async function remindMe(handle = "") {
  try { await api.post("challenge/remind", handle ? { handle } : {}); return true; }
  catch (e) { throw new Error(e?.response?.data?.error || "Could not save. Try again."); }
}
/** v371: Admin — creators who asked for a reminder and haven't entered yet. */
export async function getAdminReminders() {
  const { data } = await api.get("admin/challenge/reminders", { bypassCache: true });
  return data?.reminders || [];
}

/** v373: Admin — live views / likes / hashtag check for every entry, 5 creators per call. Throws with the server's message. */
export async function refreshEntryStats(offset = 0) {
  try { const { data } = await api.post("admin/challenge/refresh-stats", { offset }); return data; }
  catch (e) { const err = new Error(e?.response?.data?.error || e?.response?.data?.detail || "Could not refresh."); err.code = e?.response?.data?.code; throw err; }
}

// v377 (Diwali Challenge v2): entry review, ₹50 recharge tick, "signed up, no reel yet" list.
export async function getAdminEntriesData(fresh = false) {
  const { data } = await api.get(`admin/challenge/entries${fresh ? "?fresh=1" : ""}`, { bypassCache: true });
  return data || { entries: [] };
}
export async function reviewEntry(entry, status) {
  try {
    const { data } = await api.post("admin/challenge/review", { user_id: entry.user_id, item_id: entry.item_id, status });
    return data;
  } catch (e) { throw new Error(e?.response?.data?.error || e?.response?.data?.detail || "Could not save."); }
}
/** v396: admin's "Follows @ybex.in" tick — true / false / null (not checked). */
export async function setFollows(userId, follows) {
  try {
    const { data } = await api.post("admin/challenge/follow", { user_id: userId, follows });
    return data;
  } catch (e) { throw new Error(e?.response?.data?.error || e?.response?.data?.detail || "Could not save."); }
}
export async function setRechargeSent(userId, sent) {
  try {
    const { data } = await api.post("admin/challenge/recharge", { user_id: userId, sent: Boolean(sent) });
    return data;
  } catch (e) { throw new Error(e?.response?.data?.error || e?.response?.data?.detail || "Could not save."); }
}
export async function getNoReelCreators() {
  const { data } = await api.get("admin/challenge/no-reel", { bypassCache: true });
  return data?.creators || [];
}
