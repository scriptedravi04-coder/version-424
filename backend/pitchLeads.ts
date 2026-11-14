// Session 38 (Ravi: "YE SAB BANAO"). Admin → Pitch Leads read only this server's local file,
// while brand → creator invites (public.brief_requests) are saved in Supabase. On Cloud Run the
// tab (and the dashboard pitch count) was empty or showed one instance's leftovers.
//
// The invites table belongs to the LOCKED invite flow, so admin never writes its `status`.
// Admin's own pipeline status + notes live in public.pitch_lead_admin (session38_part2.sql),
// keyed by the invite id. What admin sees = admin status if set, else the invite's own status.

import { fetchAllRows } from "./adminMoney";

export const PITCH_ADMIN_TABLE = "pitch_lead_admin";
export const PITCH_STATUSES = ["NEW", "IN_NEGOTIATION", "ACCEPTED", "DECLINED"];

/** The invite flow's status → the admin pipeline's words. */
export function pitchStatusFromInvite(status: any): string {
  const s = String(status || "").toLowerCase();
  if (s === "accepted") return "ACCEPTED";
  if (s === "creator_declined" || s === "declined" || s === "rejected") return "DECLINED";
  if (!s || s === "pending_creator_acceptance" || s === "accepting" || s === "new") return "NEW";
  return String(status).toUpperCase();
}

async function byIds(c: any, table: string, column: string, ids: string[], select = "*") {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await c.from(table).select(select).in(column, ids.slice(i, i + 200));
    out.push(...(data || []));
  }
  return out;
}

type Deps = { getClient: () => any; getDb: () => any };

/**
 * Everything the Pitch Leads screen needs, Supabase first, plus local-only rows.
 * Returns plain arrays in the same shape the old code read from the local file.
 */
export async function loadPitchData({ getClient, getDb }: Deps) {
  const db = getDb() || {};
  const c = getClient();
  const byId = new Map<string, any>();
  const adminRows = new Map<string, any>();
  let creatorProfiles: any[] = [], brandProfiles: any[] = [], users: any[] = [], threads: any[] = [], messages: any[] = [];

  if (c) {
    const { data: invites, error } = await fetchAllRows((f, t) => c.from("brief_requests").select("*").order("created_at", { ascending: false }).range(f, t));
    if (error) console.warn("[pitch leads] brief_requests:", error.message || error);
    for (const r of invites || []) byId.set(String(r.id), { ...r, status: pitchStatusFromInvite(r.status), invite_status: r.status });
    try {
      const { data: admin } = await fetchAllRows((f, t) => c.from(PITCH_ADMIN_TABLE).select("*").range(f, t));
      for (const a of admin || []) adminRows.set(String(a.pitch_id), a);
    } catch { /* table not created yet → invite status only */ }
  }
  // Local-only rows (no Supabase, or saved locally before this change).
  for (const r of db.brief_requests || []) {
    if (r?.id && !byId.has(String(r.id))) byId.set(String(r.id), r);
  }
  for (const [id, a] of adminRows) {
    const r = byId.get(id);
    if (!r) continue;
    if (a.admin_status) r.status = a.admin_status;
    if (a.admin_notes != null) r.admin_notes = a.admin_notes;
  }
  const briefRequests = Array.from(byId.values());

  const peopleIds = Array.from(new Set(briefRequests.flatMap((b) => [b.creator_id, b.brand_id]).filter(Boolean).map(String)));
  const threadIds = Array.from(new Set(briefRequests.map((b) => b.thread_id).filter(Boolean).map(String)));
  if (c && peopleIds.length) {
    [creatorProfiles, brandProfiles, users] = await Promise.all([
      byIds(c, "creator_profiles", "user_id", peopleIds),
      byIds(c, "brand_profiles", "user_id", peopleIds),
      byIds(c, "users", "user_id", peopleIds, "user_id, name, email, phone, picture, auth_method, is_claimed, role"),
    ]);
  }
  if (c && threadIds.length) {
    threads = await byIds(c, "chat_threads", "id", threadIds, "id, brand_id, creator_id");
    messages = (await byIds(c, "chat_messages", "thread_id", threadIds))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }
  const addLocal = (arr: any[], local: any[], key: string) => {
    const seen = new Set(arr.map((x) => String(x?.[key])));
    for (const x of local || []) if (x && !seen.has(String(x[key]))) arr.push(x);
    return arr;
  };
  return {
    briefRequests,
    creatorProfiles: addLocal(creatorProfiles, db.creator_profiles, "user_id"),
    brandProfiles: addLocal(brandProfiles, db.brand_profiles, "user_id"),
    users: addLocal(users, db.users, "user_id"),
    chatThreads: addLocal(threads, db.chat_threads, "id"),
    chatMessages: messages.length ? messages : (db.chat_messages || []),
  };
}

/** Dashboard / sidebar count: new pitches to creators who have not claimed their profile. */
export function countNewUnclaimedPitches(briefRequests: any[]): number {
  return (briefRequests || []).filter((b: any) => (b.status || "NEW").toUpperCase() === "NEW" && b.creator_is_claimed !== true).length;
}

/** Saves admin's status / notes without touching the invite row. Returns an error or null. */
export async function saveAdminPitchFields(c: any, pitchId: string, patch: { admin_status?: string; admin_notes?: string }, adminId: string): Promise<string | null> {
  if (!c) return null;
  const row: any = { pitch_id: pitchId, updated_by: adminId, updated_at: new Date().toISOString() };
  if (patch.admin_status !== undefined) row.admin_status = patch.admin_status;
  if (patch.admin_notes !== undefined) row.admin_notes = patch.admin_notes;
  const { error } = await c.from(PITCH_ADMIN_TABLE).upsert(row, { onConflict: "pitch_id" });
  return error ? (error.message || "Could not save") : null;
}

/** Light version for the 30-second sidebar poll: ids + statuses only, no names or messages. */
export async function countNewUnclaimedPitchesQuick({ getClient, getDb }: Deps): Promise<number> {
  const c = getClient();
  const rows = new Map<string, any>();
  if (c) {
    const { data } = await fetchAllRows((f, t) => c.from("brief_requests").select("id, status, creator_is_claimed").range(f, t));
    for (const r of data || []) rows.set(String(r.id), { ...r, status: pitchStatusFromInvite(r.status) });
    try {
      const { data: admin } = await fetchAllRows((f, t) => c.from(PITCH_ADMIN_TABLE).select("pitch_id, admin_status").range(f, t));
      for (const a of admin || []) { const r = rows.get(String(a.pitch_id)); if (r && a.admin_status) r.status = a.admin_status; }
    } catch { /* table not created yet */ }
  }
  for (const r of getDb()?.brief_requests || []) if (r?.id && !rows.has(String(r.id))) rows.set(String(r.id), r);
  return countNewUnclaimedPitches(Array.from(rows.values()));
}
