// Session 22. OTP codes and contract sign tokens shared by every server instance.
//
// Before: both lived in one instance's memory. On Cloud Run with 2+ instances, /otp/send could
// land on instance A and /otp/verify on instance B → "No active verification request", and a
// sign token issued on A was unknown on B → "SIGN_OTP_REQUIRED" right after a correct code.
// A restart/deploy also threw every pending code away.
//
// Now: they live in the Supabase table `ybex_ephemeral` (SQL in scripts/sql/ybex_ephemeral.sql),
// read and written with the service-role client only. Consuming a sign token is a single
// DELETE ... RETURNING, so a token works exactly once even across instances.
// Without the table or the service key, it falls back to this instance's memory (the old
// behaviour) and says so once in the log.
import crypto from "crypto";

const TABLE = "ybex_ephemeral";
type Row = { key: string; value: any; expires_at: string };

let client: any = null;
let dbOff = false;
const mem = new Map<string, { value: any; expiresAt: number }>();

export function configureEphemeralStore(privilegedClient: any) {
  client = privilegedClient || null;
  dbOff = false;
}

function usable() {
  return !!client && !dbOff;
}

function disableOn(error: any): boolean {
  const msg = String(error?.message || error || "");
  if (/relation .* does not exist|could not find the table|PGRST205|42P01/i.test(msg + String(error?.code || ""))) {
    if (!dbOff) console.warn(`[ephemeral] table '${TABLE}' missing — OTP codes and sign tokens stay in this instance's memory. Run scripts/sql/ybex_ephemeral.sql.`);
    dbOff = true;
    return true;
  }
  return false;
}

function memGet(key: string) {
  const r = mem.get(key);
  if (!r) return null;
  if (r.expiresAt < Date.now()) { mem.delete(key); return null; }
  return r.value;
}

function memPrune() {
  if (mem.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of mem) if (v.expiresAt < now) mem.delete(k);
}

export async function ephemeralSet(key: string, value: any, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  mem.set(key, { value, expiresAt });
  memPrune();
  if (!usable()) return;
  try {
    const { error } = await client.from(TABLE).upsert({ key, value, expires_at: new Date(expiresAt).toISOString() });
    if (error) {
      memOnly.add(key);
      if (!disableOn(error)) warnWriteFailed(error.message);
    } else {
      memOnly.delete(key);
    }
  } catch (e: any) {
    memOnly.add(key);
    disableOn(e) || warnWriteFailed(e?.message || String(e));
  }
}

// Session 23: keys whose shared-store write FAILED (e.g. RLS refused it because the server runs
// without SUPABASE_SERVICE_ROLE_KEY). get() used to treat "no row in the table" as the truth and
// returned null even though this instance had just stored the code in memory — the user typed the
// right OTP and saw "No active verification request found".
const memOnly = new Set<string>();
let warnedWrite = false;
function warnWriteFailed(msg: string) {
  if (warnedWrite) return;
  warnedWrite = true;
  console.error(`[ephemeral] writing to '${TABLE}' failed (${msg}). OTP codes / sign tokens fall back to this instance's memory. Check SUPABASE_SERVICE_ROLE_KEY on the server.`);
}

export async function ephemeralGet(key: string): Promise<any> {
  if (!usable()) return memGet(key);
  try {
    const { data, error } = await client.from(TABLE).select("value, expires_at").eq("key", key).maybeSingle();
    if (error) {
      if (!disableOn(error)) console.warn("[ephemeral] get failed:", error.message);
      return memGet(key);
    }
    // The shared store is the truth (another instance may have used the code) — unless OUR write
    // to it failed, in which case only this instance's memory has it.
    if (!data) return memOnly.has(key) ? memGet(key) : null;
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await ephemeralDelete(key);
      return null;
    }
    return data.value;
  } catch (e: any) {
    disableOn(e);
    return memGet(key);
  }
}

export async function ephemeralDelete(key: string): Promise<void> {
  mem.delete(key);
  memOnly.delete(key);
  if (!usable()) return;
  try {
    const { error } = await client.from(TABLE).delete().eq("key", key);
    if (error && !disableOn(error)) console.warn("[ephemeral] delete failed:", error.message);
  } catch (e: any) {
    disableOn(e);
  }
}

/** Read-and-delete in one step: only one caller, on any instance, gets the value. */
export async function ephemeralTake(key: string): Promise<any> {
  const local = memGet(key);
  mem.delete(key);
  if (!usable()) return local;
  try {
    const { data, error } = await client.from(TABLE).delete().eq("key", key).select("value, expires_at");
    if (error) {
      if (!disableOn(error)) console.warn("[ephemeral] take failed:", error.message);
      return local;
    }
    const row: Row | undefined = (data || [])[0];
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
    return row.value;
  } catch (e: any) {
    disableOn(e);
    return local;
  }
}

/** Codes are stored hashed: a leaked row does not reveal a live OTP. */
export function hashCode(scope: string, code: string): string {
  return crypto.createHash("sha256").update(`${scope}:${String(code).trim()}`).digest("hex");
}

/** Test hook. */
export function _resetEphemeral() {
  mem.clear();
  client = null;
  dbOff = false;
}

/** v399 (email budget): live keys that start with `prefix`, oldest key first (keys carry a time stamp). */
export async function ephemeralList(prefix: string, limit = 100): Promise<Array<{ key: string; value: any }>> {
  const now = Date.now();
  const fromMem = () => Array.from(mem.entries())
    .filter(([k, v]) => k.startsWith(prefix) && v.expiresAt >= now)
    .sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit)
    .map(([key, v]) => ({ key, value: v.value }));
  if (!usable()) return fromMem();
  try {
    const { data, error } = await client.from(TABLE).select("key, value, expires_at")
      .like("key", `${prefix}%`).gt("expires_at", new Date(now).toISOString()).order("key", { ascending: true }).limit(limit);
    if (error) { if (!disableOn(error)) console.warn("[ephemeral] list failed:", error.message); return fromMem(); }
    const rows = (data || []).map((r: Row) => ({ key: r.key, value: r.value }));
    const seen = new Set(rows.map((r: any) => r.key));
    for (const r of fromMem()) if (memOnly.has(r.key) && !seen.has(r.key)) rows.push(r);
    return rows.slice(0, limit);
  } catch (e: any) {
    disableOn(e);
    return fromMem();
  }
}
