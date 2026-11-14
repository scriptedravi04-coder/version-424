// Session 52 (Ravi: "supabase connect kr diya hu tum khud dekhlo or kaam krlo"): the 3 database pieces of
// Ybex Assist (scripts/sql/session52_assist.sql, applied on the live project):
//   1. assist_messages        — chat history, so the brand's chat comes back on any phone
//   2. assist_usage           — the 30-a-day AI count, shared by every server copy, survives restarts
//   3. assist_saved_searches  — "naye creators aaye to batana": a job checks every 30 min and sends a
//                               bell + phone push (a normal `notifications` row → the existing push loop)
// All three tables are server-only (RLS on, no policies). Every function here fails soft: no database
// → the caller falls back to what Session 51 did (memory / the phone).
import { refineCreators, parseCreatorQuery, nameOf, nichesIn } from "../src/components/assist/brand/brandLogic";
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { categoryMatches } from "../src/components/assist/creator/creatorLogic";
import { isShowableCreator } from "./creatorHomePicks";

export const HISTORY_KEEP = 100;         // v418: was 40 — a long chat reopened with its start missing          // messages sent back to the phone
export const SAVED_MAX = 5;              // saved searches per brand
export const SEEN_MAX = 3000;
export const FRESH_MAX = 20;

const clip = (v: any, n: number) => String(v ?? "").replace(/\u0000/g, "").slice(0, n);

/** The brand account a user acts for (team members share the parent brand). */
export const brandKey = (u: any) => String(u?.parent_brand_id || u?.user_id || u?.id || "");

/** Only small, non-secret bits of a card are kept: its type and a short label. */
export function slimCard(card: any) {
  if (!card || typeof card !== "object" || !card.type) return null;
  return { type: clip(card.type, 30) };
}

/** Messages saved before chats had ids (v302) show as one "Earlier chat". */
export const LEGACY_CHAT = "earlier";
/** A chat id from the phone: short, letters / digits / - _ only. */
export function cleanChatId(v: any): string | null {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null;
}
/** Group message rows (oldest first) into chats, newest chat first. */
export function chatsFromRows(rows: any[]) {
  const map = new Map<string, any>();
  for (const r of rows) {
    const id = r.chat_id || LEGACY_CHAT;
    let ch = map.get(id);
    if (!ch) { ch = { chat_id: id, title: "", preview: "", first_at: r.created_at, last_at: r.created_at, count: 0 }; map.set(id, ch); }
    if (!ch.title && r.role === "user" && r.text) ch.title = clip(r.text, 70);
    if (r.text) ch.preview = clip(r.text, 90); // Session 58 (Eva history search): the last line of the chat
    ch.last_at = r.created_at;
    ch.count += 1;
  }
  return Array.from(map.values())
    .map((ch) => ({ ...ch, title: ch.title || (ch.chat_id === LEGACY_CHAT ? "Earlier chat" : "Chat") }))
    .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))
    .slice(0, 50);
}

/** Session 58: Eva settings as stored — unknown values fall back to the defaults (everything on, English). */
export function cleanEvaSettings(s: any) {
  return {
    deals: s?.deals !== false,
    money: s?.money !== false,
    lang: ["en", "hinglish", "hi"].includes(s?.lang) ? String(s.lang) : "en",
  };
}
/** v329: what a PUT may change — only real booleans and a known language. Anything else is left as stored (was:
 *  "false" / 0 / a missing field / lang "fr" silently turned the switch back ON and the language back to English). */
export function cleanEvaSettingsPatch(s: any): { patch: { deals?: boolean; money?: boolean; lang?: string }; bad: string[] } {
  const patch: any = {}, bad: string[] = [];
  const body = s && typeof s === "object" && !Array.isArray(s) ? s : {};
  for (const k of ["deals", "money"]) {
    if (body[k] === undefined) continue;
    if (typeof body[k] === "boolean") patch[k] = body[k]; else bad.push(k);
  }
  if (body.lang !== undefined) { if (["en", "hinglish", "hi"].includes(body.lang)) patch.lang = body.lang; else bad.push("lang"); }
  return { patch, bad };
}
/** v329: saved-search ids are uuids — anything else never reaches Postgres (it answered 22P02 → "DB error" 502). */
export const isSavedId = (v: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));

/** Clean the messages the phone wants saved. */
export function cleanHistoryRows(body: any, brandId: string, userId: string) {
  const list = Array.isArray(body?.messages) ? body.messages.slice(0, 4) : [];
  const chatId = cleanChatId(body?.chat_id);
  // v419 (Eva review M1): one save = question + answer in one insert → same now() → random order on reopen.
  // Each row gets its own millisecond so the order is kept.
  const base = Date.now();
  return list
    .map((m: any, i: number) => ({
      created_at: new Date(base + i).toISOString(),
      brand_id: brandId,
      chat_id: chatId && chatId !== LEGACY_CHAT ? chatId : null,
      user_id: userId || null,
      role: m && m.user ? "user" : "bot",
      text: clip(m && m.text, 2000).trim(),
      card: slimCard(m && m.card),
    }))
    .filter((m: any) => m.text);
}

/** Only the filter fields the assistant understands, as numbers / short strings. */
export function cleanFilters(f: any) {
  const base = parseCreatorQuery("");
  const n = (v: any) => Math.max(0, Math.min(1e9, Math.round(Number(v) || 0)));
  const s = (v: any, len = 40) => clip(v, len).trim();
  return {
    ...base,
    city: s(f?.city),
    niches: Array.isArray(f?.niches) ? f.niches.slice(0, 8).map((x: any) => s(x, 30)).filter(Boolean) : [],
    followersMin: n(f?.followersMin), followersMax: n(f?.followersMax),
    maxRate: n(f?.maxRate), minReach: n(f?.minReach),
    gender: ["female", "male"].includes(f?.gender) ? f.gender : "",
    language: s(f?.language, 20).toLowerCase(),
    count: 0, sort: "",
    // Session 54: a creator's "new campaigns" alert keeps its kind and the creator's own niche words.
    // Session 58 (Eva settings → "Notify me from Eva" off): one "mute" row stops Eva's phone alerts.
    kind: f?.kind === "campaigns" ? "campaigns" : f?.kind === "mute" ? "mute" : "",
  };
}

/** v329: the rates a BRAND sees on Explore (creators/explore): rate_card + rate_reel / rate_story / rate_yt_video with
 *  the brand markup (same rounding as helpers.applyPct). The job compared the brand's "budget up to ₹X" with the RAW
 *  rate, so a creator just under X got a push the phone (marked-up Explore list) then didn't show. */
const markPct = (v: number, pct: number) => (!v || !pct ? v : Math.round(v * (1 + pct / 100)));
export function withBrandRates(row: any, pct: number) {
  if (!row || !(pct > 0)) return row;
  const out: any = { ...row };
  if (row.rate_card && typeof row.rate_card === "object") {
    const rc: any = {};
    for (const k of Object.keys(row.rate_card)) rc[k] = typeof row.rate_card[k] === "number" ? markPct(row.rate_card[k], pct) : row.rate_card[k];
    out.rate_card = rc;
  }
  for (const k of ["rate_reel", "rate_story", "rate_yt_video"]) {
    if (row[k] != null && row[k] !== "" && !Number.isNaN(Number(row[k]))) out[k] = markPct(Number(row[k]), pct);
  }
  return out;
}

/** Creators (creator_profiles rows) that match a saved search — same rules as the chat's creator search. */
export function matchSaved(rows: any[], filters: any, markupPct = 0) {
  const f = cleanFilters(filters);
  const city = f.city.toLowerCase();
  const list = (rows || []).filter((r) => isShowableCreator(r) && (!city || `${r.city || ""} ${r.state || ""}`.toLowerCase().includes(city)));
  // v329: a budget filter compares the rate the brand sees (with markup), not the raw one.
  return refineCreators(f.maxRate && markupPct > 0 ? list.map((r) => withBrandRates(r, markupPct)) : list, f);
}

/** New creators in a saved search since the last check. First check → just remember who is there. */
export function freshFor(search: any, rows: any[], markupPct = 0) {
  const ids = matchSaved(rows, search.filters, markupPct).map((c: any) => String(c.user_id || c.id)).filter(Boolean);
  const seen = new Set((search.seen_ids || []).map(String));
  const first = !search.last_checked_at && seen.size === 0;
  const fresh = first ? [] : ids.filter((id) => !seen.has(id));
  const seenNext = Array.from(new Set([...(search.seen_ids || []).map(String), ...ids])).slice(-SEEN_MAX);
  return { fresh, seenNext };
}

export function alertText(label: string, creators: any[]) {
  const names = creators.slice(0, 3).map((c) => nameOf(c)).join(", ");
  const more = creators.length > 3 ? ` +${creators.length - 3}` : "";
  return {
    title: creators.length === 1 ? "1 new creator for your search" : `${creators.length} new creators for your search`,
    message: `"${clip(label, 80)}": ${names}${more}. Open Ybex Eva to see them.`,
  };
}

// ── Session 54: creators' "new matching campaigns / UGC briefs" alert + market insight ────────────────
const DAY_MS2 = 864e5;
const campCats = (c: any) => (Array.isArray(c?.categories) ? c.categories : c?.category ? [c.category] : []).map(String);
/** Live work that fits a creator's niche words → ids "c:<campaign>" / "u:<brief>". */
export function matchWork(campaigns: any[], briefs: any[], filters: any, now = Date.now()): string[] {
  const niches: string[] = (Array.isArray(filters?.niches) ? filters.niches : []).map((x: any) => String(x).toLowerCase());
  const groups = nichesIn(niches.join(" "));
  const out: string[] = [];
  for (const c of campaigns || []) {
    const st = String(c?.status || "").toLowerCase();
    if (st && st !== "live" && st !== "approved") continue;
    const dl = Date.parse(c?.deadline || "") || 0;
    if (dl && dl + DAY_MS2 < now) continue;
    // v329: a campaign with applications paused / closed isn't "new work" (Eva hides it, the alert announced it).
    if (c?.applications_paused === true || c?.closed_at) continue;
    if (!categoryMatches(campCats(c), niches)) continue;
    out.push(`c:${c.campaign_id || c.id}`);
  }
  for (const b of briefs || []) {
    if (b?.status && String(b.status).toUpperCase() !== "OPEN") continue;
    const g = nichesIn(`${b.title || ""} ${b.product_name || ""} ${b.product_description || ""}`);
    if (g.length && groups.length && !g.some((x: string) => groups.includes(x))) continue;
    out.push(`u:${b.id}`);
  }
  return out;
}
export function workAlertText(fresh: string[], campaigns: any[], briefs: any[]) {
  const nC = fresh.filter((x) => x.startsWith("c:")).length, nU = fresh.length - nC;
  const first = fresh[0] || "";
  const t = first.startsWith("c:") ? campaigns.find((c) => `c:${c.campaign_id || c.id}` === first) : briefs.find((b) => `u:${b.id}` === first);
  const parts = [nC ? `${nC} campaign${nC > 1 ? "s" : ""}` : "", nU ? `${nU} UGC brief${nU > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
  return {
    title: `New work for you: ${parts}`,
    message: `${t ? `"${clip(t.title || t.product_name || "New work", 60)}"${t.brand_name ? ` by ${clip(t.brand_name, 40)}` : ""}` : "New work"} matches your niche. Open Eva to apply.`,
  };
}
const median = (xs: number[]) => { const a = xs.filter((x) => x > 0).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
/** What brands want right now — counts and typical pay per niche. No brand names, no private data. */
export function buildInsights(campaigns: any[], briefs: any[], now = Date.now()) {
  const live = (campaigns || []).filter((c) => { const st = String(c?.status || "").toLowerCase(); const dl = Date.parse(c?.deadline || "") || 0; return (!st || st === "live" || st === "approved") && !(dl && dl + DAY_MS2 < now); });
  const open = (briefs || []).filter((b) => !b?.status || String(b.status).toUpperCase() === "OPEN");
  const per = new Map<string, { niche: string; count: number; budgets: number[] }>();
  for (const c of live) {
    const groups = nichesIn(campCats(c).join(" ").toLowerCase());
    for (const g of groups.length ? groups : ["Other"]) {
      const e = per.get(g) || { niche: g, count: 0, budgets: [] };
      e.count += 1; e.budgets.push(Number(c.budget_max || c.budget_min || 0) || 0); per.set(g, e);
    }
  }
  for (const b of open) {
    for (const g of nichesIn(`${b.title || ""} ${b.product_name || ""} ${b.product_description || ""}`)) {
      const e = per.get(g) || { niche: g, count: 0, budgets: [] };
      e.count += 1; e.budgets.push(Number(b.budget) || 0); per.set(g, e);
    }
  }
  const niches = Array.from(per.values()).map((e) => ({ niche: e.niche, count: e.count, median_budget: median(e.budgets) })).sort((a, b) => b.count - a.count);
  const fmtName: Record<string, string> = { collaboration_reel: "collab reels", ugc_video_edited: "edited UGC videos", ugc_video_raw: "raw clips" };
  const fmtCount = new Map<string, number>();
  for (const b of open) { const k = fmtName[String(b.deliverable_type || "")] || ""; if (k) fmtCount.set(k, (fmtCount.get(k) || 0) + 1); }
  for (const c of live) for (const d of (Array.isArray(c.deliverables) ? c.deliverables : [])) { const k = String(d).toLowerCase().includes("story") ? "stories" : String(d).toLowerCase().includes("youtube") ? "YouTube videos" : String(d).toLowerCase().includes("reel") ? "reels" : ""; if (k) fmtCount.set(k, (fmtCount.get(k) || 0) + 1); }
  const formats = Array.from(fmtCount.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const ugcFormats = Array.from(fmtCount.entries()).filter(([k]) => Object.values(fmtName).includes(k)).sort((a, b) => b[1] - a[1]);
  return {
    live_campaigns: live.length,
    top_niches: niches.filter((n) => n.niche !== "Other").slice(0, 5).map((n) => ({ niche: n.niche, count: n.count })),
    niches: niches.filter((n) => n.niche !== "Other"),
    ugc: { count: open.length, median_budget: median(open.map((b) => Number(b.budget) || 0)), top_format: ugcFormats[0]?.[0] || "" },
    formats,
  };
}

// v328: page size + upper bounds for the saved-search job's full-table reads.
const PAGE = 1000, SEARCH_SCAN_MAX = 50000, CREATOR_SCAN_MAX = 50000;
const EXPORT_MAX = 5000; // v329: ≤ 5,000 messages × 2,000 chars ≈ 10 MB attachment at most (Resend allows 40 MB)
const IST = (now = Date.now()) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export function createAssistStore(getClient: () => any) {
  const db = () => { try { return getClient() || null; } catch { return null; } };

  return {
    hasDb: () => Boolean(db()),

    /** Shared daily count. → true/false, or null when the database can't answer (caller uses memory). */
    async takeUsage(brandId: string, limit: number, now = Date.now()): Promise<boolean | null> {
      const r = await this.takeUsageCount(brandId, limit, now);
      return r ? r.allowed : null;
    },
    // v328: same as takeUsage but also returns the day's count ("used"), so the caller can say how many are left.
    async takeUsageCount(brandId: string, limit: number, now = Date.now()): Promise<{ allowed: boolean; used: number } | null> {
      const c = db();
      if (!c) return null;
      try {
        const { data, error } = await c.rpc("assist_usage_take", { p_brand: brandId, p_day: IST(now), p_limit: limit });
        if (error) return null;
        const row = Array.isArray(data) ? data[0] : data;
        return row ? { allowed: Boolean(row.allowed), used: Math.max(0, Number(row.used) || 0) } : null;
      } catch { return null; }
    },
    // v328: give one message back (the AI call failed). assist_usage_take can only add, so this is a
    // compare-and-set on the existing assist_usage row (count = n → n - 1), tried twice. Fails soft.
    async giveBackUsage(brandId: string, now = Date.now()): Promise<boolean> {
      const c = db();
      if (!c) return false;
      const day = IST(now);
      try {
        for (let i = 0; i < 2; i++) {
          const { data, error } = await c.from("assist_usage").select("count").eq("brand_id", brandId).eq("day", day).maybeSingle();
          const n = Number(data?.count) || 0;
          if (error || n <= 0) return false;
          const { data: won, error: e2 } = await c.from("assist_usage").update({ count: n - 1, updated_at: new Date().toISOString() })
            .eq("brand_id", brandId).eq("day", day).eq("count", n).select("brand_id");
          if (e2) return false;
          if (won && won.length) return true;
        }
      } catch { /* soft */ }
      return false;
    },

    /** Messages of one chat (Session 53: Eva keeps several chats). No chat id → the latest chat. */
    async history(brandId: string, chatId?: string | null) {
      const c = db();
      if (!c) return null;
      let id = chatId ? cleanChatId(chatId) : null;
      // v329: a chat id that isn't valid returned the LATEST chat (another chat's messages) — now an empty chat.
      if (chatId && !id) return { chat_id: null, messages: [] };
      if (!id) {
        const { data: last, error: e1 } = await c.from("assist_messages").select("chat_id")
          .eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1);
        if (e1) return null;
        id = last && last[0] ? (last[0].chat_id || LEGACY_CHAT) : null;
      }
      if (!id) return { chat_id: null, messages: [] };
      let q = c.from("assist_messages").select("role, text, card, created_at").eq("brand_id", brandId);
      q = id === LEGACY_CHAT ? q.is("chat_id", null) : q.eq("chat_id", id);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(HISTORY_KEEP);
      if (error) return null;
      return {
        chat_id: id,
        messages: (data || []).reverse().map((m: any) => ({ user: m.role === "user", text: m.text, card_type: m.card?.type || "", at: m.created_at })),
      };
    },
    /** The brand's chats, newest first: title = first question, with the last time. */
    async listChats(brandId: string) {
      const c = db();
      if (!c) return null;
      const { data, error } = await c.from("assist_messages").select("chat_id, role, text, created_at")
        .eq("brand_id", brandId).order("created_at", { ascending: false }).limit(2000); // v328: newest 2,000, not oldest
      if (error) return null;
      return chatsFromRows((data || []).reverse()); // v328: back to oldest-first for chatsFromRows
    },
    /** v329: every message of the brand for the export (newest EXPORT_MAX, paged), grouped by chat, newest chat
     *  first. The export used history() per chat = only the last 40 messages of each, and 30 separate reads. */
    async exportChats(brandId: string) {
      const c = db();
      if (!c) return null;
      const rows: any[] = [];
      for (let from = 0; from < EXPORT_MAX; from += PAGE) {
        const { data, error } = await c.from("assist_messages").select("chat_id, role, text, created_at")
          .eq("brand_id", brandId).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
        if (error) return null;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      rows.reverse();
      const byChat = new Map<string, any[]>();
      for (const r of rows) {
        const id = r.chat_id || LEGACY_CHAT;
        if (!byChat.has(id)) byChat.set(id, []);
        byChat.get(id)!.push({ user: r.role === "user", text: r.text, at: r.created_at });
      }
      const list = chatsFromRows(rows); // titles, newest chat first (max 50)
      const all = Array.from(byChat.keys());
      const order = [...list.map((ch) => ch.chat_id), ...all.filter((id) => !list.some((ch) => ch.chat_id === id)).reverse()];
      return order.map((id) => {
        const msgs = byChat.get(id) || [];
        const firstQ = msgs.find((m) => m.user && m.text);
        return { chat_id: id, title: list.find((ch) => ch.chat_id === id)?.title || (firstQ ? clip(firstQ.text, 70) : id === LEGACY_CHAT ? "Earlier chat" : "Chat"), messages: msgs };
      });
    },
    async addHistory(rows: any[]) {
      const c = db();
      if (!c || !rows.length) return false;
      const { error } = await c.from("assist_messages").insert(rows);
      return !error;
    },
    /** Delete one chat, or (no id) every chat of the brand. */
    async clearHistory(brandId: string, chatId?: string | null) {
      const c = db();
      if (!c) return false;
      const id = chatId ? cleanChatId(chatId) : null;
      // v329: a bad chat id (e.g. ?chat=a&chat=b, or > 64 chars) used to fall through to "delete EVERY chat".
      if (chatId && !id) return false;
      let q = c.from("assist_messages").delete().eq("brand_id", brandId);
      if (id) q = id === LEGACY_CHAT ? q.is("chat_id", null) : q.eq("chat_id", id);
      const { error } = await q;
      return !error;
    },
    /** Session 58 (Ravi approved eva_feedback): 👍 / 👎 under Eva's replies. */
    async addFeedback(row: { user_id: string; role: string; vote: string; card: string | null; text: string }) {
      const c = db();
      if (!c) return false;
      const { error } = await c.from("eva_feedback").insert(row);
      return !error;
    },
    /** Latest votes for the admin Chatbot screen → { items, up, down } (counts over the last 30 days). */
    async listFeedback(limit = 100, opts: { vote?: string; before?: string } = {}) {
      const c = db();
      if (!c) return null;
      // v329: optional ?vote=up|down and ?before=<created_at> (older page). Without them: same as before. "Disliked"
      // only filtered the newest 100 on the phone, so older 👎 were never reachable once 100 👍 came in.
      let q = c.from("eva_feedback").select("id, user_id, role, vote, card, text, created_at");
      if (opts.vote === "up" || opts.vote === "down") q = q.eq("vote", opts.vote);
      if (opts.before && !Number.isNaN(Date.parse(opts.before))) q = q.lt("created_at", new Date(Date.parse(opts.before)).toISOString());
      const n = Math.max(1, Math.min(300, Math.round(Number(limit) || 100)));
      const { data, error } = await q.order("created_at", { ascending: false }).limit(n);
      if (error) return null;
      const since = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
      const [r1, r2] = await Promise.all([
        c.from("eva_feedback").select("id", { count: "exact", head: true }).eq("vote", "up").gte("created_at", since),
        c.from("eva_feedback").select("id", { count: "exact", head: true }).eq("vote", "down").gte("created_at", since),
      ]);
      // v329: a failed count showed "0 👍 / 0 👎" as if nobody voted → the screen gets an error instead.
      if (r1?.error || r2?.error) return null;
      const items = data || [];
      return { items, up: r1?.count || 0, down: r2?.count || 0, more: items.length === n, next_before: items.length === n ? items[items.length - 1]?.created_at || null : null };
    },
    /** Session 58: Eva settings (table eva_settings, one row per login). null = no database / error. */
    async getSettings(userId: string) {
      const c = db();
      if (!c || !userId) return null;
      const { data, error } = await c.from("eva_settings").select("deals, money, lang").eq("user_id", userId).maybeSingle();
      if (error) return null;
      return cleanEvaSettings(data || {});
    },
    async putSettings(userId: string, s: any) {
      const c = db();
      if (!c || !userId) return false;
      const { error } = await c.from("eva_settings").upsert({ user_id: userId, ...cleanEvaSettings(s), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return !error;
    },
    /** Old chats are not kept for ever: 90 days. */
    async pruneHistory(now = Date.now()) {
      const c = db();
      if (!c) return;
      await c.from("assist_messages").delete().lt("created_at", new Date(now - 90 * 24 * 3600e3).toISOString());
    },

    async listSaved(brandId: string) {
      const c = db();
      if (!c) return null;
      const { data, error } = await c.from("assist_saved_searches").select("id, label, filters, fresh_ids, seen_ids, created_at")
        .eq("brand_id", brandId).order("created_at", { ascending: true });
      if (error) return null;
      return data || [];
    },
    /** Live campaigns + open UGC briefs (for creators' alerts and the market insight). */
    async liveWork() {
      const c = db();
      if (!c) return null;
      const [{ data: campaigns, error: e1 }, { data: briefs, error: e2 }] = await Promise.all([
        c.from("campaigns").select("campaign_id, title, brand_name, categories, budget_min, budget_max, deliverables, status, deadline, created_at, applications_paused, closed_at") /* v329: + paused / closed */.in("status", ["live", "approved"]).limit(1000),
        c.from("ugc_briefs").select("id, title, product_name, product_description, brand_name, budget, deliverable_type, status, created_at").eq("status", "OPEN").limit(1000),
      ]);
      if (e1 || e2) return null;
      return { campaigns: campaigns || [], briefs: briefs || [] };
    },
    async saveSearch(brandId: string, userId: string, label: string, filters: any, seenIds: string[]) {
      const c = db();
      if (!c) return { ok: false, code: "NO_DB" };
      // Session 54: a creator's work alert starts from what is live now — only NEW work is announced.
      // v329: if the live list can't be read now, last_checked_at stays empty → the job's first round only
      // remembers what is live (was: seen = [] → the first round announced ALL matching work as "new").
      let workFirstPending = false;
      if (filters?.kind === "campaigns") {
        const w = await this.liveWork().catch(() => null);
        seenIds = w ? matchWork(w.campaigns, w.briefs, filters) : [];
        workFirstPending = !w;
      }
      const existing = (await this.listSaved(brandId)) || [];
      const same = existing.find((s: any) => s.label === label);
      // Session 58: only real creator searches count toward SAVED_MAX — the "alerts off" switch and a creator's
      // work alert are rows too, and used to push out (delete) a brand's 5th saved search.
      const isSearch = (s: any) => s?.label !== "eva_mute" && s?.filters?.kind !== "mute" && s?.filters?.kind !== "campaigns";
      const droppable = existing.filter(isSearch);
      if (!same && isSearch({ label, filters }) && droppable.length >= SAVED_MAX) {
        // keep the newest SAVED_MAX: drop the oldest one
        await c.from("assist_saved_searches").delete().eq("id", droppable[0].id).eq("brand_id", brandId);
      }
      // v328: "mute" and "campaigns" rows are capped too — at most ONE of each kind per brand (so a brand has at most
      // 5 searches + 1 work alert + 1 mute = 7 rows). Saving another label of the same kind replaces the old one.
      const kind = filters?.kind === "mute" || filters?.kind === "campaigns" ? filters.kind : "";
      if (!same && kind) {
        for (const s of existing.filter((x: any) => x?.filters?.kind === kind)) {
          await c.from("assist_saved_searches").delete().eq("id", s.id).eq("brand_id", brandId);
        }
      }
      const row = {
        brand_id: brandId, user_id: userId || null, label: clip(label, 120) || "creators",
        filters: cleanFilters(filters),
        // v328: slice before map — a huge seen_ids array is never walked whole.
        seen_ids: (Array.isArray(seenIds) ? seenIds : []).slice(0, SEEN_MAX).map(String),
        fresh_ids: [], last_checked_at: workFirstPending ? null : new Date().toISOString(), // v329
      };
      const { data, error } = await c.from("assist_saved_searches").upsert(row, { onConflict: "brand_id,label" }).select("id, label").maybeSingle();
      return error ? { ok: false, code: "DB" } : { ok: true, search: data };
    },
    async deleteSaved(brandId: string, id: string) {
      const c = db();
      if (!c) return false;
      const { error } = await c.from("assist_saved_searches").delete().eq("id", id).eq("brand_id", brandId);
      return !error;
    },
    /** The phone showed these creators: add them to "seen" and clear "fresh". */
    async markSeen(brandId: string, id: string, ids: string[]) {
      const c = db();
      if (!c) return false;
      // v328: markSeen also bumps last_checked_at and only writes if the job hasn't changed the row since we read it
      // (same compare-and-set the job uses) → the job's own conditional update then notices and skips this row
      // for one round, instead of the two writes overwriting each other. Tried twice.
      for (let i = 0; i < 2; i++) {
        const { data } = await c.from("assist_saved_searches").select("seen_ids, last_checked_at").eq("id", id).eq("brand_id", brandId).maybeSingle();
        if (!data) return false;
        const seen = Array.from(new Set([...(data.seen_ids || []), ...(ids || []).map(String)])).slice(-SEEN_MAX);
        let q = c.from("assist_saved_searches").update({ seen_ids: seen, fresh_ids: [], last_checked_at: new Date().toISOString() }).eq("id", id).eq("brand_id", brandId);
        q = data.last_checked_at ? q.eq("last_checked_at", data.last_checked_at) : q.is("last_checked_at", null);
        const { data: won, error } = await q.select("id");
        if (error) return false;
        if (won && won.length) return true;
      }
      return false;
    },

    /** The job: every saved search vs. today's approved creators → bell + push for new matches. */
    async checkSavedSearches({ notify, brandMarkupPct }: { notify: (brandId: string, title: string, message: string, link: string) => Promise<void>; brandMarkupPct?: () => number }) {
      const c = db();
      if (!c) return { searches: 0, notified: 0 };
      // v328: read EVERY saved search (incl. the "mute" rows), page by page in id order — was one unordered
      // read capped at 1,000, so searches / mute switches past that were silently skipped.
      const searches: any[] = [];
      for (let from = 0; from < SEARCH_SCAN_MAX; from += PAGE) {
        const { data, error } = await c.from("assist_saved_searches")
          .select("id, brand_id, label, filters, seen_ids, fresh_ids, last_checked_at").order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) return { searches: 0, notified: 0 };
        searches.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      if (!searches.length) return { searches: 0, notified: 0 };
      let notified = 0;
      // v329: users.banned / is_deleted / suspended_until for the few ids that would get (or be named in) an alert,
      // asked only when an alert is about to go out, cached for this round. A failed read blocks nobody (as before).
      const blockCache = new Map<string, boolean>();
      const blockedIds = async (ids: any[]) => {
        const want = Array.from(new Set(ids.map(String).filter((x) => x && !blockCache.has(x))));
        for (let i = 0; i < want.length; i += 200) {
          const part = want.slice(i, i + 200);
          try {
            const { data, error } = await c.from("users").select("user_id, banned, is_deleted, suspended_until").in("user_id", part);
            if (error) continue;
            for (const id of part) blockCache.set(id, false);
            for (const u of data || []) {
              const susp = u?.suspended_until && Date.parse(u.suspended_until) > Date.now();
              blockCache.set(String(u.user_id), u?.banned === true || u?.is_deleted === true || Boolean(susp));
            }
          } catch { /* soft */ }
        }
        return new Set(ids.map(String).filter((x) => blockCache.get(x) === true));
      };
      // Session 58: users who switched "Notify me from Eva" off — lists still update, no bell / push.
      const muted = new Set(searches.filter((s: any) => s.filters?.kind === "mute").map((s: any) => String(s.brand_id)));
      // Session 54: creators' "new work" alerts.
      const workAlerts = searches.filter((s: any) => s.filters?.kind === "campaigns");
      if (workAlerts.length) {
        const w = await this.liveWork().catch(() => null);
        if (w) {
          for (const s of workAlerts) {
            const ids = matchWork(w.campaigns, w.briefs, s.filters);
            const seen = new Set((s.seen_ids || []).map(String));
            const firstWork = !s.last_checked_at && seen.size === 0; // v329: first round only remembers
            const fresh = firstWork ? [] : ids.filter((id) => !seen.has(id));
            const seenNext = Array.from(new Set([...(s.seen_ids || []).map(String), ...ids])).slice(-SEEN_MAX);
            const now = new Date().toISOString();
            let q = c.from("assist_saved_searches").update({ seen_ids: seenNext, last_checked_at: now, ...(fresh.length ? { last_notified_at: now } : {}) }).eq("id", s.id);
            q = s.last_checked_at ? q.eq("last_checked_at", s.last_checked_at) : q.is("last_checked_at", null);
            const { data: won } = await q.select("id");
            if (!won || !won.length || !fresh.length) continue;
            if (muted.has(String(s.brand_id))) continue;
            if ((await blockedIds([s.brand_id])).has(String(s.brand_id))) continue; // v329
            const { title, message } = workAlertText(fresh, w.campaigns, w.briefs);
            try { await notify(s.brand_id, title, message, "/dashboard?assist=new"); notified += 1; } catch { /* next time */ }
          }
        }
      }
      const brandSearches = searches.filter((s: any) => s.filters?.kind !== "campaigns" && s.filters?.kind !== "mute");
      if (!brandSearches.length) return { searches: searches.length, notified };
      const rows: any[] = [];
      // v328: stable order (user_id) so pages don't overlap / skip, and up to 50,000 creators instead of 5,000.
      for (let from = 0; from < CREATOR_SCAN_MAX; from += PAGE) {
        const { data, error: e2 } = await readCreatorsLean(c, (q: any) => q.order("user_id", { ascending: true }).range(from, from + PAGE - 1));
        if (e2) return { searches: searches.length, notified: 0 };
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      const byId = new Map(rows.map((r) => [String(r.user_id || r.id), r]));
      // v329: the brand markup (platform settings) so "budget up to ₹X" matches what Explore / Eva show the brand.
      let pct = 0;
      try { pct = Math.max(0, Number(brandMarkupPct?.()) || 0); } catch { pct = 0; }
      for (const s of brandSearches) {
        const { fresh, seenNext } = freshFor(s, rows, pct);
        const freshNext = Array.from(new Set([...(s.fresh_ids || []), ...fresh])).slice(-FRESH_MAX);
        const now = new Date().toISOString();
        // Only the server that wins this update sends the alert (safe with more than one server copy).
        let q = c.from("assist_saved_searches").update({ seen_ids: seenNext, fresh_ids: freshNext, last_checked_at: now, ...(fresh.length ? { last_notified_at: now } : {}) }).eq("id", s.id);
        q = s.last_checked_at ? q.eq("last_checked_at", s.last_checked_at) : q.is("last_checked_at", null);
        const { data: won, error: e3 } = await q.select("id");
        if (e3 || !won || !won.length || !fresh.length || muted.has(String(s.brand_id))) continue;
        // v329: no bell / push to a banned, deleted or suspended account, and banned / deleted creators aren't announced.
        const blocked = await blockedIds([s.brand_id, ...fresh]);
        if (blocked.has(String(s.brand_id))) continue;
        const okCreators = fresh.filter((id) => !blocked.has(String(id))).map((id) => byId.get(id)).filter(Boolean);
        if (!okCreators.length) continue;
        const { title, message } = alertText(s.label, okCreators);
        try { await notify(s.brand_id, title, message, "/brand/dashboard?assist=new"); notified += 1; } catch { /* next time */ }
      }
      return { searches: searches.length, notified };
    },
  };
}
