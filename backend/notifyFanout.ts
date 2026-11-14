// Session 58: "send to everyone" notifications. notifications.user_id is a foreign key to users, so a single row with
// user_id "all" (or "creator") was refused by the database — version notices and admin "send to all" messages were never
// saved, and the local copy could never be marked read. Now: one row per user, so each person reads / clears their own.
import { fetchAllRows } from "./adminMoney";

export async function fanOutNotification(client: any, payload: any, audience: string): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!client) return { ok: false, count: 0, error: "no database" };
  const aud = String(audience || "all").toLowerCase();
  const { data: users, error } = await fetchAllRows((a, b) => {
    let q = client.from("users").select("user_id, role, banned, is_deleted");
    q = aud === "creator" || aud === "brand" ? q.eq("role", aud) : q.in("role", ["creator", "brand"]);
    return q.range(a, b);
  });
  if (error) return { ok: false, count: 0, error: String(error.message || error) };
  const ids = (users || []).filter((u: any) => !u.banned && !u.is_deleted).map((u: any) => String(u.user_id));
  const base = String(payload.notif_id || `notif_${Date.now()}`);
  const target = aud === "creator" || aud === "brand" ? aud : "all";
  let count = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const rows = ids.slice(i, i + 500).map((uid) => ({ ...payload, notif_id: `${base}_${uid.slice(-8)}`, user_id: uid, target_type: target }));
    const { error: insErr } = await client.from("notifications").insert(rows);
    if (insErr) return { ok: false, count, error: String(insErr.message || insErr) };
    count += rows.length;
  }
  return { ok: true, count };
}
