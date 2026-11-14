import http2 from "http2";
import crypto from "crypto";

// v336 (Ravi: iPhone App Store app needs phone notifications). The App Store app can't use web push — Apple only
// delivers through APNs (Apple Push Notification service). This file sends one notification to one iPhone.
// No extra package: Node's own http2 + an ES256 token signed with the .p8 key from Apple Developer.
//
// Server settings (docs/setup/ENV_KEYS.md):
//   APNS_KEY        the .p8 file's text (paste as-is; "\n" written as \n also works)
//   APNS_KEY_ID     the Key ID shown next to the key
//   APNS_TEAM_ID    your Apple Team ID (Membership page)
//   APNS_BUNDLE_ID  com.ybex.app (default)
//   APNS_PRODUCTION "true" for App Store / TestFlight builds (default), "false" for builds run from Xcode

export type ApnsResult = { ok: boolean; status: number; reason?: string; gone?: boolean };

export function apnsConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = String(env.APNS_KEY || "").replace(/\\n/g, "\n").trim();
  const keyId = String(env.APNS_KEY_ID || "").trim();
  const teamId = String(env.APNS_TEAM_ID || "").trim();
  if (!key || !keyId || !teamId) return null;
  return {
    key, keyId, teamId,
    topic: String(env.APNS_BUNDLE_ID || "com.ybex.app").trim(),
    host: String(env.APNS_PRODUCTION || "true").toLowerCase() === "false" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
  };
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Apple's provider token (valid 1 hour; Apple asks to reuse it for 20–60 minutes). */
export function apnsJwt(cfg: { key: string; keyId: string; teamId: string }, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const body = b64u(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

/** The JSON Apple wants, from the same payload web push gets ({ title, body, url, tag }). */
export function apnsBody(p: { title?: string; body?: string; url?: string; tag?: string }) {
  return {
    aps: { alert: { title: String(p.title || "Ybex").slice(0, 80), body: String(p.body || "").slice(0, 240) }, sound: "default" },
    url: typeof p.url === "string" && p.url.startsWith("/") ? p.url : "/notifications",
  };
}

/** A token is 64+ hex characters. Stored in push_subscriptions as endpoint "apns:<token>". */
export const APNS_PREFIX = "apns:";
export const isApnsToken = (t: any) => typeof t === "string" && /^[0-9a-fA-F]{64,200}$/.test(t);

let cachedJwt: { token: string; at: number } | null = null;
let session: http2.ClientHttp2Session | null = null;
let sessionHost = "";

function getSession(host: string) {
  if (session && !session.closed && !session.destroyed && sessionHost === host) return session;
  try { session?.close(); } catch { /* old one */ }
  session = http2.connect(host);
  sessionHost = host;
  session.on("error", () => { try { session?.destroy(); } catch { /* ignore */ } session = null; });
  session.on("goaway", () => { try { session?.close(); } catch { /* ignore */ } session = null; });
  session.unref?.();
  return session;
}

export async function sendApns(token: string, payload: any, cfg = apnsConfig()): Promise<ApnsResult> {
  if (!cfg) return { ok: false, status: 0, reason: "not_configured" };
  if (!isApnsToken(token)) return { ok: false, status: 400, reason: "BadDeviceToken", gone: true };
  const now = Date.now();
  if (!cachedJwt || now - cachedJwt.at > 40 * 60 * 1000) cachedJwt = { token: apnsJwt(cfg), at: now };
  const data = JSON.stringify(apnsBody(payload || {}));
  return new Promise<ApnsResult>((resolve) => {
    let done = false;
    const finish = (r: ApnsResult) => { if (!done) { done = true; resolve(r); } };
    try {
      const s = getSession(cfg.host);
      const headers: Record<string, string> = {
        ":method": "POST", ":path": `/3/device/${token}`,
        authorization: `bearer ${cachedJwt!.token}`, "apns-topic": cfg.topic, "apns-push-type": "alert", "apns-priority": "10",
        "apns-expiration": String(Math.floor(now / 1000) + 24 * 3600), "content-type": "application/json",
      };
      if (payload?.tag) headers["apns-collapse-id"] = String(payload.tag).slice(0, 64);
      const req = s.request(headers);
      let status = 0;
      let buf = "";
      req.setTimeout(10000, () => { try { req.close(); } catch { /* ignore */ } finish({ ok: false, status: 0, reason: "timeout" }); });
      req.on("response", (h) => { status = Number(h[":status"] || 0); });
      req.on("data", (c) => { buf += c; });
      req.on("end", () => {
        if (status === 200) return finish({ ok: true, status });
        let reason = "";
        try { reason = JSON.parse(buf || "{}").reason || ""; } catch { /* not json */ }
        if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") cachedJwt = null;
        // 410 Unregistered / BadDeviceToken / wrong environment → this phone token is dead, remove it.
        const gone = status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
        finish({ ok: false, status, reason, gone });
      });
      req.on("error", (e: any) => finish({ ok: false, status: 0, reason: String(e?.message || e) }));
      req.end(data);
    } catch (e: any) {
      finish({ ok: false, status: 0, reason: String(e?.message || e) });
    }
  });
}
