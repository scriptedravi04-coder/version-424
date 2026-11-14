// v337 (Ravi): ybexmedia.in runs through a Cloudflare Worker that forwards every request to ybexapp.ai.studio
// (docs/setup/DOMAIN_CLOUDFLARE.md). Google's front end then sees the WORKER's IP, so every ybexmedia.in visitor would share
// one IP and the "too many wrong passwords" lock would hit everyone at once.
// The Worker sends the visitor's real IP + a shared secret. Only when the secret matches PROXY_SHARED_SECRET, the real
// IP is appended to X-Forwarded-For (the server already trusts the LAST entry — authSecurity.clientIp), so every
// existing rate limit keeps working unchanged. Without the secret (someone calling directly) the headers are ignored.
import { timingSafeEqual } from "crypto";

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]{2,45})$/;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function applyDomainProxyIp(req: any, secret = process.env.PROXY_SHARED_SECRET || ""): void {
  const h = req?.headers || {};
  const key = String(h["x-ybex-proxy-key"] || "");
  const ip = String(h["x-ybex-client-ip"] || "").trim();
  delete h["x-ybex-proxy-key"];
  delete h["x-ybex-client-ip"];
  if (!secret || secret.length < 20 || !key || !sameSecret(key, secret)) return;
  if (!IP_RE.test(ip)) return;
  const xff = String(h["x-forwarded-for"] || "").trim();
  h["x-forwarded-for"] = xff ? `${xff}, ${ip}` : ip;
}

export function domainProxyMiddleware(req: any, _res: any, next: any) {
  try { applyDomainProxyIp(req); } catch { /* never block a request */ }
  next();
}
