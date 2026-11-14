#!/bin/bash
# v372 — Ybex iPhone app over the cable, screens loaded LIVE from this Mac (no web build, no OTA, no deploy).
#
#   Terminal tab 1:  bash scripts/mac-local.sh        (keeps running)
#   Terminal tab 2:  bash scripts/ios-local.sh        (iPhone cable se laga ho, unlocked)
#
# Needs once: ios-app/scripts/mac-prepare.sh done + Xcode → Signing → Team chosen (ios-app/README.md).
# After this the app on the phone opens http://<Mac IP>:3000 — change code on the Mac, then close + reopen the app
# on the phone and the change is there (no Xcode run needed again; run this script again only if the Mac IP changed).
#
# Back to the normal app (screens inside the app, live server):  bash scripts/ios-local.sh --off
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/ios-app"
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

[[ "$(uname)" == "Darwin" ]] || die "Ye Mac pe chalao."
[[ -d ios/App ]] || die "iOS project abhi bana nahi. Pehle: cd ios-app && bash scripts/mac-prepare.sh (aur Xcode mein Team select karo)."
[[ -d node_modules ]] || npm install

NATIVE_CFG="ios/App/App/capacitor.config.json"
PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy

if [[ "${1:-}" == "--off" ]]; then
  npm run sync && ok "App wapas normal (screens app ke andar, live server). Xcode se Run karo ya: npx cap run ios --no-sync"
  exit 0
fi

PORT="${PORT:-3000}"
IP="$(cat "$ROOT/.local-ip" 2>/dev/null || true)"
[[ -n "$IP" ]] || IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[[ -n "$IP" ]] || die "Mac ka Wi-Fi IP nahi mila. Mac aur iPhone ek hi Wi-Fi pe hone chahiye."
curl -s -o /dev/null --max-time 5 "http://$IP:$PORT/" || die "http://$IP:$PORT nahi khul raha — pehle doosre tab mein: bash scripts/mac-local.sh"
ok "Mac server: http://$IP:$PORT"

# 1. copy the normal config into the Xcode project, then point it at the Mac (only the copy inside ios/ changes —
#    ios-app/capacitor.config.json stays as it is, so App Store builds are never affected)
[[ -f "$ROOT/dist/client/index.html" ]] || { mkdir -p "$ROOT/dist/client"; echo '<!doctype html><title>Ybex</title>' > "$ROOT/dist/client/index.html"; }
npx cap copy ios >/dev/null
node - "$NATIVE_CFG" "http://$IP:$PORT" <<'JS'
const fs = require("fs"); const [file, url] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(file, "utf8"));
c.server = { ...(c.server || {}), url, cleartext: true };
c.server.allowNavigation = [...new Set([...(c.server.allowNavigation || []), url.replace(/^https?:\/\//, "").replace(/:\d+$/, "")])];
c.plugins = c.plugins || {};
c.plugins.CapacitorUpdater = { ...(c.plugins.CapacitorUpdater || {}), autoUpdate: false };   // no OTA while testing
fs.writeFileSync(file, JSON.stringify(c, null, 2));
JS
ok "app → http://$IP:$PORT (live update off)"

# 2. iOS lets the app open the Mac's plain-http address on the home Wi-Fi
$PB -c "Add :NSAppTransportSecurity dict" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Delete :NSAppTransportSecurity:NSAllowsLocalNetworking" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$PLIST"
$PB -c "Delete :NSLocalNetworkUsageDescription" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Add :NSLocalNetworkUsageDescription string Ybex connects to your computer on this Wi-Fi while testing." "$PLIST"
ok "Info.plist: local network allowed"

# 3. build + install on the phone (pick the iPhone from the list)
echo
warn "iPhone pe pehli baar: 'Allow Ybex to find devices on your local network' → Allow."
warn "'Untrusted Developer' aaye toh iPhone → Settings → General → VPN & Device Management → apni Apple ID → Trust."
echo
npx cap run ios --no-sync || {
  warn "Command line se nahi chala — Xcode khol raha hu: upar iPhone select karo → ▶ Run."
  npx cap open ios
}
