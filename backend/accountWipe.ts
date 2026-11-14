// Session 27. Admin "Complete wipe out" of one account (rule 56).
//
// Two ways to delete a user from the admin panel:
//   - Normal delete  (POST /admin/users/:id/delete) — soft delete, "sent to bin", can be restored.
//   - Complete wipe  (POST /admin/users/:id/wipe)   — this file. Needs the admin's own password.
//     Removes the user and everything tied to them (profile, campaigns, applications, deals,
//     chats + messages, invites, UGC briefs/orders, notifications, KYC, sessions, waitlist) from
//     Supabase and the local store, and deletes the Supabase Auth user — so the same email can
//     sign up fresh afterwards.
//
// Guards: WHO = a full admin (not a sub-admin), with their password, never themselves or another
// admin. Money in flight (escrow held / paid order not finished) does NOT block it — Ravi uses the
// wipe for testing — but the admin must confirm once (`force: true`, WIPE_HAS_ACTIVE_MONEY).
// `transactions` rows are KEPT (accounting), only the local copies' names/emails are blanked.

export const WIPE_KEEP_TABLES = new Set(["transactions", "admin_activity_logs", "admin_logs", "audit_logs", "deleted_user_ids", "deleted_user_emails"]);

/** Fields that tie a row to a user. */
export const USER_LINK_FIELDS = [
  "user_id", "creator_id", "brand_id", "brand_user_id", "creator_user_id", "sender_user_id",
  "receiver_user_id", "sender_id", "receiver_id", "referrer_id", "referred_id", "linked_user_id",
  "reviewer_id", "target_id", "accepted_by", "signer_user_id",
];

/** v399 (Ravi 4 Nov: "do baar wipe kiya, done bola, admin abhi bhi list me hai"): rows that only REMEMBER which admin did
 *  something (logs, who made a banner / coupon / app version …). They are kept, but the link to the wiped person is
 *  cleared — otherwise the database refuses to delete the users row (foreign key, no cascade) and the wipe half-fails. */
export const WIPE_UNLINK_COLUMNS: { table: string; column: string }[] = [
  { table: "admin_activity_logs", column: "admin_id" },
  { table: "admin_activity_logs", column: "user_id" },
  { table: "admin_auth_logs", column: "user_id" },
  { table: "notifications", column: "sent_by_admin_id" },
  { table: "transactions", column: "admin_action_by" },
  { table: "deals", column: "escrow_hold_by_admin_id" },
  { table: "banners", column: "created_by" },
  { table: "maintenance_mode", column: "enabled_by" },
  { table: "notification_templates", column: "created_by" },
  { table: "app_versions", column: "created_by" },
  { table: "manual_overrides", column: "admin_id" },
  { table: "coupons", column: "created_by" },
  { table: "blocked_message_attempts", column: "assigned_admin_id" },
  { table: "reports", column: "resolved_by" },
  { table: "reports", column: "reported_by" },
  { table: "blog_posts", column: "author_id" },
];

/** Supabase deletes, children first. Each entry is tried; a missing table/column is only reported. */
export function wipePlan(ids: { userIds: string[]; threadIds: string[]; dealIds: string[]; campaignIds: string[]; orderIds: string[]; email: string }) {
  const u = ids.userIds;
  const steps: { table: string; column: string; values: string[] }[] = [];
  const add = (table: string, column: string, values: string[]) => { if (values.length) steps.push({ table, column, values }); };
  add("chat_messages", "thread_id", ids.threadIds);
  add("chat_messages", "sender_user_id", u);
  add("chat_messages", "receiver_user_id", u);
  add("chat_threads", "id", ids.threadIds);
  add("content_submissions", "deal_id", [...ids.dealIds, ...ids.orderIds]);
  add("campaign_applications", "campaign_id", ids.campaignIds);
  add("campaign_applications", "creator_id", u);
  add("deals", "id", ids.dealIds);
  add("brief_requests", "creator_id", u);
  add("brief_requests", "brand_id", u);
  add("ugc_orders", "id", ids.orderIds);
  add("ugc_briefs", "brand_id", u);
  add("campaigns", "campaign_id", ids.campaignIds);
  add("notifications", "user_id", u);
  add("verifications", "user_id", u);
  add("creator_portfolio_items", "creator_id", u);
  add("reviews", "target_id", u);
  add("referrals", "referrer_id", u);
  add("user_sessions", "user_id", u);
  add("admin_permissions", "user_id", u); // v288: wiping an admin / sub-admin removes their permissions too
  add("user_violations", "user_id", u);
  add("chat_violations", "sender_id", u);
  add("chat_moderation_events", "sender_id", u); // session 38
  add("waitlist", "linked_user_id", u);
  if (ids.email) add("waitlist", "email", [ids.email]);
  add("creator_profiles", "user_id", u);
  add("brand_profiles", "user_id", u);
  add("users", "user_id", u);
  return steps;
}

const UPPER = (v: any) => String(v || "").toUpperCase();
const DEAL_DONE = new Set(["RELEASED", "COMPLETED", "REFUNDED", "CANCELLED", "CANCELED", "DECLINED", "REJECTED", "EXPIRED", "CLOSED"]);
const ORDER_PAID = new Set(["ESCROW_HELD", "PAID", "CAPTURED"]);
const ORDER_DONE = new Set(["COMPLETED", "EXPIRED", "CANCELLED", "CANCELED", "REFUNDED", "RELEASED", "CLOSED"]);

/** Deals / UGC orders that still hold money. Empty = safe to wipe. */
export function activeMoney(deals: any[], orders: any[]): string[] {
  const out: string[] = [];
  for (const d of deals || []) {
    const held = Boolean(d?.escrow_hold || d?.escrow_hold_at) || ["ESCROW_HELD", "PAID"].includes(UPPER(d?.payment_status));
    const done = DEAL_DONE.has(UPPER(d?.status)) || DEAL_DONE.has(UPPER(d?.payment_status)) || DEAL_DONE.has(UPPER(d?.flow_state));
    if (held && !done) out.push(`deal ${d.id}`);
  }
  for (const o of orders || []) {
    const paid = ORDER_PAID.has(UPPER(o?.payment_status)) || Boolean(o?.escrow_hold || o?.escrow_held_at);
    const done = ORDER_DONE.has(UPPER(o?.status)) || ORDER_DONE.has(UPPER(o?.payment_status));
    if (paid && !done) out.push(`UGC order ${o.id}`);
  }
  return out;
}

/** Session 58: which of these deals still have the brand's money in hold (read-only; deals has no payment column —
 *  the payment lives on its transaction row). Returns null when it couldn't be read. */
export async function heldDealIds(client: any, dealIds: string[]): Promise<Set<string> | null> {
  const out = new Set<string>();
  if (!dealIds.length) return out;
  const { data, error } = await client.from("transactions").select("deal_id, status, payout_status, refund_status").in("deal_id", dealIds);
  if (error) return null;
  for (const t of data || []) {
    const paid = ["SUCCESS", "PAID", "CAPTURED", "ESCROW_HELD"].includes(UPPER(t.status));
    const settled = ["PAID", "COMPLETED"].includes(UPPER(t.payout_status)) || UPPER(t.refund_status) === "PROCESSED";
    if (paid && !settled) out.add(String(t.deal_id));
  }
  return out;
}

/** Removes the user's rows from the local store (in place). Returns counts per collection. */
export function wipeLocal(db: any, ids: { userIds: string[]; threadIds: string[]; dealIds: string[]; campaignIds: string[]; orderIds: string[]; email: string }) {
  const u = new Set(ids.userIds.map(String));
  const threads = new Set(ids.threadIds.map(String));
  const deals = new Set([...ids.dealIds, ...ids.orderIds].map(String));
  const camps = new Set(ids.campaignIds.map(String));
  const email = String(ids.email || "").toLowerCase();
  const counts: Record<string, number> = {};
  for (const [key, val] of Object.entries(db || {})) {
    if (!Array.isArray(val)) continue;
    if (key === "transactions") {
      // Kept for accounting; names/emails of the wiped user blanked.
      for (const t of val as any[]) {
        if (t && USER_LINK_FIELDS.some((f) => u.has(String(t[f])))) {
          for (const f of ["name", "email", "creator_name", "brand_name", "user_email"]) if (f in t) t[f] = "";
        }
      }
      continue;
    }
    if (WIPE_KEEP_TABLES.has(key)) continue;
    const before = val.length;
    db[key] = (val as any[]).filter((row: any) => {
      if (!row || typeof row !== "object") return true;
      if (USER_LINK_FIELDS.some((f) => row[f] != null && u.has(String(row[f])))) return false;
      if (row.thread_id && threads.has(String(row.thread_id))) return false;
      if (key === "chat_threads" && row.id && threads.has(String(row.id))) return false;
      if (row.deal_id && deals.has(String(row.deal_id))) return false;
      if ((key === "deals" || key === "ugc_orders") && row.id && deals.has(String(row.id))) return false;
      if (row.campaign_id && camps.has(String(row.campaign_id))) return false;
      if (email && key !== "transactions" && String(row.email || "").toLowerCase() === email && (key === "users" || key === "creator_profiles" || key === "brand_profiles" || key === "waitlist")) return false;
      return true;
    });
    const removed = before - db[key].length;
    if (removed) counts[key] = removed;
  }
  // The same email may sign up again.
  if (Array.isArray(db.deleted_user_ids)) db.deleted_user_ids = db.deleted_user_ids.filter((x: any) => !u.has(String(x)));
  if (Array.isArray(db.deleted_user_emails) && email) db.deleted_user_emails = db.deleted_user_emails.filter((e: any) => String(e).toLowerCase() !== email);
  return counts;
}
