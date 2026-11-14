// v336: the web build carried inside the App Store app gets the same version name as ../dist/client/ota/latest.json,
// so the live updater doesn't download the very same build again on first open.
import fs from "fs";
import path from "path";
const here = path.dirname(new URL(import.meta.url).pathname);
const cfgPath = path.join(here, "..", "capacitor.config.json");
try {
  const latest = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "dist", "client", "ota", "latest.json"), "utf8"));
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.plugins = cfg.plugins || {};
  cfg.plugins.CapacitorUpdater = { ...(cfg.plugins.CapacitorUpdater || {}), version: latest.version };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  console.log("[ios] built-in web version:", latest.version);
} catch (e) {
  console.warn("[ios] could not set the built-in version (the app will download the current build once):", e?.message || e);
}
