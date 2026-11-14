#!/bin/bash
# v337 — Ybex iPhone app: one command on the Mac does steps 1–4 of ios-app/README.md (everything except signing,
# capabilities and Archive, which need your Apple account in Xcode).
#
#   cd <project folder>/ios-app && bash scripts/mac-prepare.sh
#
# Safe to run again: it skips what is already done.
set -euo pipefail
cd "$(dirname "$0")/.."            # ios-app/
ROOT="$(cd .. && pwd)"
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

echo "== 1. Checking the Mac"
[[ "$(uname)" == "Darwin" ]] || die "Run this on the Mac."
xcode-select -p >/dev/null 2>&1 || die "Xcode not found. Install Xcode from the App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"
xcodebuild -version | head -1 && ok "Xcode"
command -v node >/dev/null || die "Node not found. Install Node 20+ from https://nodejs.org (LTS) and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $NODE_MAJOR is too old — install Node 20+ (LTS) from https://nodejs.org"
ok "Node $(node -v)"
# v378: no CocoaPods needed — the Xcode project uses Swift Package Manager (built into Xcode).
ok "Swift Package Manager (built into Xcode)"

echo "== 2. Packages"
(cd "$ROOT" && npm ci) && ok "project packages"
npm install && ok "iPhone app packages"

echo "== 3. Xcode project"
if [[ ! -d ios/App ]]; then npx cap add ios --packagemanager SPM && ok "ios/ created"; else ok "ios/ already there"; fi
npm run assets && ok "icon + purple launch screen"
npm run sync && ok "web build copied into the app (server: ${VITE_API_ORIGIN:-https://ybexapp.ai.studio})"

echo "== 4. Info.plist + push code"
PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
setp() { $PB -c "Delete :$1" "$PLIST" >/dev/null 2>&1 || true; $PB -c "Add :$1 $2 $3" "$PLIST"; }
# Sign-in return link com.ybex.app://
$PB -c "Delete :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Add :CFBundleURLTypes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.ybex.app" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string com.ybex.app" "$PLIST"
# v378: the phone's own Google account picker needs the iOS client id's reversed form as a link scheme.
#   GOOGLE_IOS_CLIENT_ID=1234-abc.apps.googleusercontent.com bash scripts/mac-prepare.sh
if [[ -n "${GOOGLE_IOS_CLIENT_ID:-}" ]]; then
  REV="com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID%.apps.googleusercontent.com}"
  $PB -c "Add :CFBundleURLTypes:1 dict" "$PLIST"
  $PB -c "Add :CFBundleURLTypes:1:CFBundleURLSchemes array" "$PLIST"
  $PB -c "Add :CFBundleURLTypes:1:CFBundleURLSchemes:0 string $REV" "$PLIST"
  setp GIDClientID string "$GOOGLE_IOS_CLIENT_ID"
fi
setp NSPhotoLibraryUsageDescription string "Ybex uses your photos so you can add a profile photo, portfolio pictures and content drafts for brands."
setp NSPhotoLibraryAddUsageDescription string "Ybex saves your receipts, media kit and delivered content to your photos when you choose to."
setp NSCameraUsageDescription string "Ybex uses the camera so you can take a profile photo or record content for a brand."
setp NSMicrophoneUsageDescription string "Ybex uses the microphone when you record a video for a brand."
$PB -c "Delete :LSApplicationQueriesSchemes" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Add :LSApplicationQueriesSchemes array" "$PLIST"
i=0; for s in tez phonepe paytmmp bhim upi credpay; do $PB -c "Add :LSApplicationQueriesSchemes:$i string $s" "$PLIST"; i=$((i+1)); done
setp ITSAppUsesNonExemptEncryption bool false
$PB -c "Delete :UIBackgroundModes" "$PLIST" >/dev/null 2>&1 || true
$PB -c "Add :UIBackgroundModes array" "$PLIST"
$PB -c "Add :UIBackgroundModes:0 string remote-notification" "$PLIST"
plutil -lint "$PLIST" >/dev/null && ok "Info.plist keys added"

AD="ios/App/App/AppDelegate.swift"
if grep -q "capacitorDidRegisterForRemoteNotifications" "$AD"; then ok "push code already in AppDelegate.swift"
else
  python3 - "$AD" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p).read()
add='''
    // v336/v337: Apple push token → Capacitor push plugin (ios-overrides/AppDelegate.push-snippet.swift)
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
'''
i=s.rindex('}')   # end of class AppDelegate (last brace in the file)
s=s[:i]+add+s[i:]
open(p,'w').write(s)
PY
  ok "push code added to AppDelegate.swift"
fi

echo
ok "Done. Now in Xcode (it opens next):"
echo "   1. Left side: click 'App' (blue icon) → target 'App' → Signing & Capabilities"
echo "   2. Team = your Apple Developer team · Bundle Identifier = com.ybex.app"
echo "   3. '+ Capability' → Push Notifications, Sign in with Apple, Background Modes (tick Remote notifications)"
echo "   4. Plug in the iPhone → pick it at the top → ▶ Run  (first time: iPhone Settings → General → VPN & Device Management → trust)"
echo "   5. Store upload: top menu Product → Archive → Distribute App → App Store Connect"
npx cap open ios
