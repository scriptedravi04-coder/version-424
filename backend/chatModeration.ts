// Session 38 (Ravi: "YE SAB BANAO" — chat moderation must survive deploys).
//
// Before: every blocked chat message (phone number / email / abuse) was written only to this
// server instance's db_mock.json. On Cloud Run each instance had its own list and a deploy wiped
// it, so Admin → Chat → "Chat Guard Blocks" and Reports → chat violations showed nothing real
// (only old seed rows). The "violations" list itself was never written by any code at all.
//
// Now each block / flag is one row in public.chat_moderation_events (scripts/sql/
// session38_part2.sql, server-only). The admin lists read it with the sender's name filled in,
// and "Mark safe" updates the row. The local file is only used when Supabase is not set up.

import crypto from "crypto";
import { fetchAllRows } from "./adminMoney";

export const MODERATION_TABLE = "chat_moderation_events";

export type ModerationEvent = {
  id: string;
  thread_id: string | null;
  sender_id: string | null;
  sender_role: string | null;
  code: string;
  reason: string | null;
  matched: string | null;
  content: string;
  blocked: boolean;
  status: string; // OPEN | RESOLVED_SAFE | ACTION_TAKEN ...
  created_at: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
};

/** A blocked message is a "hard" violation; a logged-only one (profanity) is "soft". */
export function violationType(ev: { code?: string; blocked?: boolean }) {
  if (ev.blocked === false || String(ev.code || "").toUpperCase() === "PROFANITY_FLAGGED") return "soft_keyword";
  return "hard_number";
}

export function newModerationEvent(input: {
  threadId: string; senderId: string; senderRole?: string | null; code: string; reason?: string | null;
  matched?: string | null; content: string; blocked: boolean;
}): ModerationEvent {
  return {
    id: crypto.randomUUID(),
    thread_id: input.threadId || null,
    sender_id: input.senderId || null,
    sender_role: input.senderRole || null,
    code: String(input.code || "BLOCKED").slice(0, 60),
    reason: input.reason ? String(input.reason).slice(0, 120) : null,
    matched: input.matched ? String(input.matched).slice(0, 200) : null,
    content: String(input.content || "").slice(0, 500),
    blocked: Boolean(input.blocked),
    status: "OPEN",
    created_at: new Date().toISOString(),
  };
}

/** The shape Admin → Chat and Reports already render (violations list). */
export function toAdminViolation(ev: any, sender?: any) {
  return {
    id: ev.id,
    conversation_id: ev.thread_id,
    thread_id: ev.thread_id,
    sender_id: ev.sender_id,
    sender_role: ev.sender_role || sender?.role || "unknown",
    sender_name: sender?.name || sender?.email || null,
    sender_email: sender?.email || null,
    sender_picture: sender?.picture || null,
    message_content_attempted: ev.content,
    content: ev.content,
    violation_type: violationType(ev),
    type: ev.code,
    code: ev.code,
    reason: ev.reason,
    matched: ev.matched,
    status: ev.status === "OPEN" ? "FLAGGED" : ev.status,
    detected_at: ev.created_at,
    created_at: ev.created_at,
  };
}

type Deps = { getClient: () => any; getDb: () => any; saveDb: (db: any) => void };

export function chatModeration({ getClient, getDb, saveDb }: Deps) {
  const local = () => {
    const db = getDb();
    if (!Array.isArray(db.blocked_message_attempts)) db.blocked_message_attempts = [];
    return { db, rows: db.blocked_message_attempts as any[] };
  };

  async function record(ev: ModerationEvent): Promise<void> {
    const c = getClient();
    if (c) {
      const { error } = await c.from(MODERATION_TABLE).insert([ev]);
      if (!error) return;
      console.warn("[chat moderation] could not save to Supabase, keeping it locally:", error.message);
    }
    const { db, rows } = local();
    rows.push(ev);
    saveDb(db);
  }

  async function list(limit = 2000): Promise<any[]> {
    const c = getClient();
    let rows: any[] = [];
    if (c) {
      const { data, error } = await fetchAllRows((f, t) => c.from(MODERATION_TABLE).select("*").order("created_at", { ascending: false }).range(f, t), 1000, limit);
      if (error) console.warn("[chat moderation] list:", error.message || error);
      rows = data || [];
    }
    // Rows saved locally while Supabase was unreachable (or with no Supabase at all).
    for (const r of local().rows) {
      if (r && r.code && !rows.some((x) => x.id === r.id)) rows.push({ blocked: r.code !== "PROFANITY_FLAGGED", status: "OPEN", ...r });
    }
    rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const senderIds = Array.from(new Set(rows.map((r) => r.sender_id).filter(Boolean).map(String)));
    const people = new Map<string, any>();
    for (let i = 0; c && i < senderIds.length; i += 200) {
      const { data } = await c.from("users").select("user_id, name, email, role, picture").in("user_id", senderIds.slice(i, i + 200));
      for (const u of data || []) people.set(String(u.user_id), u);
    }
    for (const u of getDb().users || []) if (u?.user_id && !people.has(String(u.user_id))) people.set(String(u.user_id), u);
    return rows.map((r) => toAdminViolation(r, people.get(String(r.sender_id))));
  }

  /** "Mark safe" etc. Returns false when the row does not exist. */
  async function resolve(id: string, action: string, adminId: string): Promise<boolean> {
    const status = action === "mark_safe" || action === "unrestrict" ? "RESOLVED_SAFE" : String(action || "RESOLVED").toUpperCase().slice(0, 40);
    const patch = { status, resolved_by: adminId, resolved_at: new Date().toISOString() };
    let found = false;
    const c = getClient();
    if (c) {
      const { data, error } = await c.from(MODERATION_TABLE).update(patch).eq("id", id).select("id");
      if (error) throw new Error(error.message || "Could not update");
      found = Array.isArray(data) && data.length > 0;
    }
    const { db, rows } = local();
    const r = rows.find((x) => x.id === id);
    if (r) { Object.assign(r, patch); saveDb(db); found = true; }
    return found;
  }

  return { record, list, resolve };
}
