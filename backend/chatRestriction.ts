// Session 58 (Ravi: chat violations "Warn" / "Restrict" should really do something). No new table: the admin's action
// is written to user_violations (Warning / CHAT_RESTRICTED / CHAT_UNRESTRICTED) and the chat send route checks the
// latest restrict / unrestrict row. A restriction lasts CHAT_BLOCK_DAYS days unless an admin lifts it earlier.
export const CHAT_BLOCK_DAYS = 7;
export const CHAT_BLOCK_TYPES = ["CHAT_RESTRICTED", "CHAT_UNRESTRICTED"];

/** rows = this user's violations → the time the chat block ends, or null when they may chat. */
export function chatBlockedUntil(rows: any[], now = Date.now()): string | null {
  const last = (rows || [])
    .filter((r) => CHAT_BLOCK_TYPES.includes(String(r?.violation_type || "").toUpperCase()))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  if (!last || String(last.violation_type).toUpperCase() !== "CHAT_RESTRICTED") return null;
  const end = Date.parse(last.created_at || "") + CHAT_BLOCK_DAYS * 864e5;
  return Number.isFinite(end) && end > now ? new Date(end).toISOString() : null;
}

const cache = new Map<string, { at: number; until: string | null }>();
export const forgetChatBlock = (userId: string) => cache.delete(String(userId));

/** Looks the user up (60 s cache). Fails open: a database hiccup never blocks a normal chat. */
export async function chatBlockFor(client: any, localRows: any[], userId: string): Promise<string | null> {
  const key = String(userId || "");
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60e3) return hit.until;
  let rows: any[] = (localRows || []).filter((r) => String(r?.user_id) === key);
  if (client) {
    try {
      const { data, error } = await client.from("user_violations").select("violation_type, created_at").eq("user_id", key)
        .in("violation_type", CHAT_BLOCK_TYPES).order("created_at", { ascending: false }).limit(5);
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    } catch { /* fail open */ }
  }
  const until = chatBlockedUntil(rows);
  cache.set(key, { at: Date.now(), until });
  return until;
}

/** The note the user gets for each admin action. */
export function chatActionNotice(action: string, note: string, until: string | null) {
  const extra = note ? ` Note from the team: "${note}".` : "";
  if (action === "issue_warning") return { title: "Warning from Ybex", message: `Please follow the chat rules — be respectful and keep payments and contact details on Ybex.${extra}` };
  if (action === "restrict_user") {
    const d = until ? new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : `${CHAT_BLOCK_DAYS} days`;
    return { title: "Your chat is paused", message: `You can't send chat messages until ${d} because of a chat-rule violation.${extra}` };
  }
  return { title: "Your chat is back on", message: "A Ybex admin lifted your chat pause — you can send messages again." };
}
