import crypto from "crypto";

// v364 (Ravi: Android app with the screens inside — android-app/). Inside the Capacitor app there is no web push, so
// Android phones get notifications through Firebase Cloud Messaging (FCM HTTP v1, free). Setup = one service-account
// JSON from the Firebase console in the server secret FCM_SERVICE_ACCOUNT_JSON (android-app/README.md). Without it
// everything here stays quiet and the other push kinds (web push, iPhone APNs) work as before.

export const FCM_PREFIX = "fcm:";
type Fetch = typeof fetch;

/** FCM registration tokens: long, letters / digits / : _ - (case matters — never lower-case them). Pure. */
export const isFcmToken = (t: any) => typeof t === "string" && /^[A-Za-z0-9:_-]{100,4096}$/.test(t);

export type FcmAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

/** The service account from FCM_SERVICE_ACCOUNT_JSON (raw JSON or base64 of it), or null. Pure. */
export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmAccount | null {
  let raw = String(env.FCM_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    // v433: "= { … }" or a quoted / pasted block with extra text around it → just the { … } part
    if (!raw.startsWith("{") && raw.includes("{") && raw.includes("}")) raw = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(raw);
    const key = String(j.private_key || "").replace(/\\n/g, "\n");
    if (!j.project_id || !j.client_email || !key.includes("PRIVATE KEY")) return null;
    return { project_id: String(j.project_id), client_email: String(j.client_email), private_key: key, token_uri: j.token_uri };
  } catch { return null; }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Signed JWT (RS256) that Google exchanges for an access token. Pure apart from the signature. */
export function buildFcmJwt(acc: FcmAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: acc.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: acc.token_uri || "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(acc.private_key);
  return `${unsigned}.${b64url(sig)}`;
}

/** The FCM v1 message for one phone. data values must be strings. Pure. */
export function buildFcmMessage(token: string, payload: any) {
  const url = typeof payload?.url === "string" && payload.url.startsWith("/") ? payload.url : "/notifications";
  const data: Record<string, string> = { url };
  if (payload?.type) data.type = String(payload.type);
  if (payload?.tag) data.tag = String(payload.tag);
  return {
    message: {
      token,
      notification: { title: String(payload?.title || "Ybex").slice(0, 80), body: String(payload?.body || "").slice(0, 240) },
      data,
      android: { priority: "HIGH", ttl: "86400s", notification: { color: "#7E00DC", ...(payload?.tag ? { tag: String(payload.tag) } : {}) } },
    },
  };
}

let cached: { token: string; until: number; email: string } | null = null;
export const __resetFcmCache = () => { cached = null; };

async function accessToken(acc: FcmAccount, f: Fetch): Promise<string> {
  if (cached && cached.email === acc.client_email && Date.now() < cached.until) return cached.token;
  const r = await f(acc.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: buildFcmJwt(acc) }).toString(),
  } as any);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`FCM token exchange failed (${r.status}): ${j.error_description || j.error || ""}`);
  cached = { token: j.access_token, until: Date.now() + 50 * 60 * 1000, email: acc.client_email }; // Google gives 60 min
  return cached.token;
}

/** Sends one notification. gone = the token is dead (app removed / reinstalled) → the caller deletes the row. */
export async function sendFcm(token: string, payload: any, opts: { env?: NodeJS.ProcessEnv; fetchImpl?: Fetch } = {}): Promise<{ ok: boolean; status: number; reason?: string; gone?: boolean }> {
  const acc = fcmConfig(opts.env || process.env);
  if (!acc) return { ok: false, status: 0, reason: "FCM not configured" };
  if (!isFcmToken(token)) return { ok: false, status: 400, reason: "Bad token", gone: true };
  const f = opts.fetchImpl || fetch;
  try {
    const at = await accessToken(acc, f);
    const r = await f(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(acc.project_id)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
      body: JSON.stringify(buildFcmMessage(token, payload)),
    } as any);
    if (r.ok) return { ok: true, status: r.status };
    const j: any = await r.json().catch(() => ({}));
    const code = String(j?.error?.details?.find?.((d: any) => d?.errorCode)?.errorCode || j?.error?.status || "");
    if (r.status === 401) cached = null; // token went stale — next send gets a new one
    const gone = r.status === 404 || code === "UNREGISTERED" || (r.status === 400 && code === "INVALID_ARGUMENT" && /registration token/i.test(String(j?.error?.message || "")));
    return { ok: false, status: r.status, reason: code || String(j?.error?.message || ""), gone };
  } catch (e: any) {
    return { ok: false, status: 0, reason: e?.message || String(e) };
  }
}
