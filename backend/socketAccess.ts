// Session 20. Who may listen to what on the socket.
//
// Before:
//   - No login check on the socket at all.
//   - `register_user(id)` joined the `user_<id>` room for ANY id the client named, so anyone
//     could receive anyone's notifications.
//   - `join_room(id)` joined any room, so anyone could read any deal's chat live.
//   - `thread_updated`, `payment_funded`, `payout_released`, `ugc_order_updated` and the admin
//     payout alerts went to EVERY connected user (io.emit).
//
// Now:
//   - A socket is tied to the logged-in user (auth token or session cookie) and joins its own
//     user room — and its brand's, for a team member — plus `admins` for staff.
//   - join_room is allowed only for a party of that thread (or staff).
//   - Deal events go to the thread room, the two parties' user rooms and the admins.
//   - Admin alerts go to admins only.

type Deps = {
  parseAuthUser: (req: any) => Promise<any>;
  getDb: () => any;
  getClient: () => any;
};

export const ADMIN_ROOM = "admins";
const PARTY_CACHE_MS = 60_000;

let access: ReturnType<typeof createSocketAccess> | null = null;

export function isStaffUser(user: any): boolean {
  const r = String(user?.role || "").toLowerCase();
  const t = String(user?.team_role || "").toLowerCase();
  return r === "admin" || r === "sub_admin" || t === "sub_admin";
}

/** The ids a user acts as: their own, and their brand's when they are a team member. */
export function actingIds(user: any): string[] {
  return [user?.user_id, user?.parent_brand_id].filter(Boolean).map(String);
}

export function stripRoomPrefix(roomId: string): string {
  return String(roomId || "").replace(/^thread_/, "");
}

export function sessionTokenFromHandshake(handshake: any): string {
  const fromAuth = handshake?.auth?.token;
  if (fromAuth && typeof fromAuth === "string") return fromAuth;
  const cookie = String(handshake?.headers?.cookie || "");
  const m = cookie.match(/session_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function createSocketAccess(deps: Deps) {
  const partyCache = new Map<string, { at: number; ids: string[] }>();

  async function threadParties(threadId: string): Promise<string[]> {
    const id = stripRoomPrefix(threadId);
    if (!id) return [];
    const hit = partyCache.get(id);
    if (hit && Date.now() - hit.at < PARTY_CACHE_MS) return hit.ids;

    const ids = new Set<string>();
    const add = (row: any) => {
      if (!row) return;
      for (const k of ["brand_id", "creator_id", "brand_user_id", "creator_user_id"]) if (row[k]) ids.add(String(row[k]));
    };

    // Thread ids are `thread_ugc_<orderId>` / `thread_camp_<dealId>` / `thread_<x>`, and rooms
    // may be named by the thread id or the deal/order id — try every form.
    const raw = String(threadId || "");
    const forms = Array.from(new Set([raw, id, raw.replace(/^thread_ugc_/, ""), raw.replace(/^thread_camp_/, "")].filter(Boolean)));

    const db = deps.getDb();
    add((db.chat_threads || []).find((t: any) => forms.includes(t.id) || forms.includes(t.deal_id)));
    add((db.ugc_orders || []).find((o: any) => forms.includes(o.id)));
    add((db.deals || []).find((d: any) => forms.includes(d.id)));

    const client = deps.getClient();
    if (ids.size === 0 && client) {
      try {
        const safe = forms.map((f) => f.replace(/[^A-Za-z0-9_\-]/g, "")).filter(Boolean);
        const { data: t } = await client.from("chat_threads").select("brand_id, creator_id").or(safe.map((f) => `id.eq.${f},deal_id.eq.${f}`).join(",")).limit(1);
        (t || []).forEach(add);
        if (ids.size === 0) {
          const { data: o } = await client.from("ugc_orders").select("brand_id, creator_id").in("id", safe).limit(1);
          (o || []).forEach(add);
        }
      } catch (e: any) {
        console.warn("[socket] thread party lookup failed:", e?.message || e);
      }
    }

    const out = Array.from(ids);
    if (out.length) partyCache.set(id, { at: Date.now(), ids: out }); // a brand-new thread must not stay "no parties" for a minute
    return out;
  }

  async function userForSocket(socket: any) {
    if (socket.data?.authChecked) return socket.data.user || null;
    const token = sessionTokenFromHandshake(socket.handshake);
    let user: any = null;
    if (token) {
      try {
        user = await deps.parseAuthUser({ headers: { authorization: `Bearer ${token}` } });
      } catch (e) {
        user = null;
      }
    }
    socket.data.authChecked = true;
    socket.data.user = user;
    return user;
  }

  async function canJoinThread(user: any, roomId: string): Promise<boolean> {
    if (!user) return false;
    if (isStaffUser(user)) return true;
    const parties = await threadParties(roomId);
    const mine = actingIds(user);
    return parties.some((p) => mine.includes(p));
  }

  /** Emit a deal event to its room, both parties and the admins — never to everyone. */
  async function emitToThread(io: any, event: string, payload: any, explicitThreadId?: string) {
    if (!io) return;
    const threadId = String(
      explicitThreadId || payload?.threadId || payload?.thread_id || payload?.orderId || payload?.order_id || payload?.id || payload?.deal_id || ""
    );
    let target = io.to(ADMIN_ROOM);
    if (threadId) {
      target = target.to(threadId).to(`thread_${threadId}`);
      for (const p of await threadParties(threadId)) target = target.to(`user_${p}`);
    } else {
      console.warn(`[socket] ${event} had no thread id — sent to admins only.`);
    }
    target.emit(event, payload);
  }

  function emitToAdmins(io: any, event: string, payload: any) {
    if (io) io.to(ADMIN_ROOM).emit(event, payload);
  }

  // Who may see a user's online/offline status: the people they have a deal, order or chat with.
  const contactCache = new Map<string, { at: number; ids: string[] }>();
  async function contactsOf(user: any): Promise<string[]> {
    const mine = actingIds(user);
    if (!mine.length) return [];
    const key = mine.join("|");
    const hit = contactCache.get(key);
    if (hit && Date.now() - hit.at < PARTY_CACHE_MS) return hit.ids;
    const out = new Set<string>();
    const take = (row: any) => {
      if (!row) return;
      const ids = ["brand_id", "creator_id", "brand_user_id", "creator_user_id"].map((k) => row[k]).filter(Boolean).map(String);
      if (ids.some((i) => mine.includes(i))) ids.forEach((i) => { if (!mine.includes(i)) out.add(i); });
    };
    const db = deps.getDb();
    for (const t of ["chat_threads", "ugc_orders", "deals"]) (db[t] || []).forEach(take);
    const client = deps.getClient();
    if (client) {
      const safe = mine.map((m) => m.replace(/[^A-Za-z0-9_\-]/g, "")).filter(Boolean);
      for (const table of ["chat_threads", "ugc_orders"]) {
        try {
          const { data } = await client.from(table).select("brand_id, creator_id").or(`brand_id.in.(${safe.join(",")}),creator_id.in.(${safe.join(",")})`).limit(500);
          (data || []).forEach(take);
        } catch (e: any) {
          console.warn(`[socket] contact lookup (${table}) failed:`, e?.message || e);
        }
      }
    }
    const ids = Array.from(out);
    contactCache.set(key, { at: Date.now(), ids });
    return ids;
  }

  /** Online/offline goes to the user's contacts and the admins — it used to go to everyone. */
  async function emitStatus(io: any, user: any, status: "online" | "offline") {
    if (!io || !user) return;
    let target = io.to(ADMIN_ROOM);
    for (const c of await contactsOf(user)) target = target.to(`user_${c}`);
    target.emit("user_status_change", { userId: String(user.user_id), status });
  }

  /** The online list a user may see: only their contacts (staff see everyone). */
  async function visibleOnline(user: any, online: string[]): Promise<string[]> {
    if (!user) return [];
    if (isStaffUser(user)) return online;
    const allowed = new Set([...(await contactsOf(user)), ...actingIds(user)]);
    return online.filter((id) => allowed.has(String(id)));
  }

  return { userForSocket, canJoinThread, emitToThread, emitToAdmins, threadParties, contactsOf, emitStatus, visibleOnline };
}

/** Called once by server.ts; route files use the helpers below. */
export function registerSocketAccess(a: ReturnType<typeof createSocketAccess>) {
  access = a;
}

/** Drop-in for `io.emit("thread_updated", payload)` and the other per-deal events. */
export function emitThreadEvent(io: any, event: string, payload: any, threadId?: string) {
  if (!access) {
    console.warn(`[socket] access not registered; ${event} not sent.`);
    return;
  }
  access.emitToThread(io, event, payload, threadId).catch((e: any) => console.warn(`[socket] ${event} emit failed:`, e?.message || e));
}

/** Drop-in for admin-only broadcasts. */
export function emitAdminEvent(io: any, event: string, payload: any) {
  if (!access) return;
  access.emitToAdmins(io, event, payload);
}

/** Same party check as join_room, for HTTP routes (e.g. /api/media). */
export async function canAccessThread(user: any, threadId: string): Promise<boolean> {
  if (!access) return false;
  return access.canJoinThread(user, threadId);
}
