import express from "express";
import fs from "fs";
import path from "path";

// v336 (Ravi: "web app mai push karunga to iPhone app mai bhi update jayega?"). The iPhone App Store app carries its
// own copy of the web build. This route lets it pick up a NEW web build without an App Store release ("live update",
// @capgo/capacitor-updater, self-hosted — no paid service): every deploy, scripts/ota-bundle.mjs zips the web build
// into dist/client/ota/ and writes ota/latest.json; the app asks here on open and downloads the zip if it's newer.
// Apple allows this for HTML/JS changes that keep the app's purpose (guideline 2.5.2 / 3.3.1(b) interpreted code).
// Native changes (new plugin, permission, icon) still need an App Store build — see ios-app/README.md.
//
// Settings (optional): IOS_OTA_OFF=true stops updates; IOS_OTA_MIN_BUILD=1.0.3 → only apps whose App Store version is
// at least this get the new bundle (use it when a web change needs a newer native build).

export function cmpVersion(a: string, b: string) {
  const pa = String(a || "0").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** What to answer the app. latest = { version, file } from ota/latest.json. */
export function decideUpdate(body: any, latest: { version?: string; file?: string; checksum?: string } | null, origin: string, env: NodeJS.ProcessEnv = process.env) {
  if (String(env.IOS_OTA_OFF || "").toLowerCase() === "true") return { message: "Updates are paused" };
  if (!latest?.version || !latest?.file) return { message: "No new version available" };
  const current = String(body?.version_name || "");
  if (current === latest.version) return { message: "No new version available" };
  const minBuild = String(env.IOS_OTA_MIN_BUILD || "").trim();
  if (minBuild && cmpVersion(String(body?.version_build || "0"), minBuild) < 0) {
    return { message: "Please update Ybex from the App Store" };
  }
  const out: { version: string; url: string; checksum?: string } = { version: latest.version, url: `${origin}/ota/${encodeURIComponent(latest.file)}` };
  // v367 fix: @capgo/capacitor-updater 7.x downloads only when the SHA-256 of the zip comes with it (scripts/ota-bundle.mjs).
  if (latest.checksum) out.checksum = latest.checksum;
  return out;
}

/** v364 (Android app with the screens inside, android-app/): same answer for Android, with its own switches
 *  ANDROID_OTA_OFF / ANDROID_OTA_MIN_BUILD (so a problem on one platform can be paused without the other). */
export function decideAndroidUpdate(body: any, latest: { version?: string; file?: string; checksum?: string } | null, origin: string, env: NodeJS.ProcessEnv = process.env) {
  const r: any = decideUpdate(body, latest, origin, { IOS_OTA_OFF: env.ANDROID_OTA_OFF, IOS_OTA_MIN_BUILD: env.ANDROID_OTA_MIN_BUILD } as any);
  if (r?.message === "Please update Ybex from the App Store") return { message: "Please update Ybex from the Play Store" };
  return r;
}

export function setupAppUpdateRoutes(router: express.Router, { distDir }: { distDir?: string } = {}) {
  const dir = () => distDir || (fs.existsSync(path.join(process.cwd(), "dist", "client")) ? path.join(process.cwd(), "dist", "client") : path.join(process.cwd(), "dist"));
  let cache: { at: number; latest: any } | null = null;
  const readLatest = () => {
    if (cache && Date.now() - cache.at < 60 * 1000) return cache.latest;
    let latest = null;
    try { latest = JSON.parse(fs.readFileSync(path.join(dir(), "ota", "latest.json"), "utf8")); } catch { latest = null; }
    cache = { at: Date.now(), latest };
    return latest;
  };
  const origin = (req: express.Request) => {
    const fixed = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
    if (fixed) return fixed;
    const host = req.get("host") || "";
    return `${host.includes("localhost") ? "http" : "https"}://${host}`;
  };
  const handler = (req: express.Request, res: express.Response) => {
    res.set("Cache-Control", "no-store");
    return res.json(decideUpdate(req.body || req.query || {}, readLatest(), origin(req)));
  };
  router.post("/app/ios-update", express.json({ limit: "16kb" }), handler);
  router.get("/app/ios-update", handler);
  const androidHandler = (req: express.Request, res: express.Response) => {
    res.set("Cache-Control", "no-store");
    return res.json(decideAndroidUpdate(req.body || req.query || {}, readLatest(), origin(req)));
  };
  router.post("/app/android-update", express.json({ limit: "16kb" }), androidHandler);
  router.get("/app/android-update", androidHandler);
}
