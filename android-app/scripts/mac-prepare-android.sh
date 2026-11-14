#!/bin/bash
# v364 (+v367 plain purple launch) — Ybex Android app (Capacitor, screens inside the app). One command on the Mac (or Linux / Windows Git Bash)
# makes the Android Studio project ready; only the signed bundle (AAB) is left for Android Studio.
#
#   cd <project folder>/android-app && bash scripts/mac-prepare-android.sh
#
# Safe to run again: it skips what is already done and re-copies the latest web build.
set -euo pipefail
cd "$(dirname "$0")/.."            # android-app/
ROOT="$(cd .. && pwd)"
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

VERSION_NAME="1.0.13"   # v419b: phone admin + QA fixes. 1.0.12 (code 13): Android push (Firebase ybex-87436). v418: + Meta SDK app events + Play install referrer. 1.0.10 (code 11) was prepared in v396 but never uploaded — bump again for every new upload
VERSION_CODE=14

echo "== 1. Checking this computer"
command -v node >/dev/null || die "Node not found. Install Node 20+ (LTS) from https://nodejs.org and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $NODE_MAJOR is too old — install Node 20+ (LTS)."
ok "Node $(node -v)"
if [[ -z "${JAVA_HOME:-}" && -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # Android Studio's own Java
fi
command -v java >/dev/null || [[ -n "${JAVA_HOME:-}" ]] || die "Java not found. Install Android Studio (it brings Java 17+): https://developer.android.com/studio"
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
JAVA_MAJOR="$("$JAVA_BIN" -version 2>&1 | grep -m1 " version " | sed -E 's/.*version "([0-9]+).*/\1/')"
[[ "${JAVA_MAJOR:-0}" -ge 17 ]] || die "Java $JAVA_MAJOR is too old — Android needs Java 17+ (Android Studio → Settings → Build Tools → Gradle → Gradle JDK = 17 or newer)."
ok "Java $JAVA_MAJOR"
if [[ -z "${ANDROID_HOME:-}" ]]; then
  for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do [[ -d "$d" ]] && export ANDROID_HOME="$d"; done
fi
[[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]] || die "Android SDK not found. Open Android Studio once (it downloads the SDK), then run this again."
ok "Android SDK at $ANDROID_HOME"

echo "== 2. Packages"
(cd "$ROOT" && npm ci) && ok "project packages"
npm install && ok "Android app packages"

echo "== 3. Android project"
if [[ ! -d android/app ]]; then npx cap add android && ok "android/ created"; else ok "android/ already there"; fi
[[ -d assets ]] || { mkdir -p assets && cp "$ROOT/ios-app/assets/"*.png assets/ && ok "icon / splash pictures copied from ios-app/assets"; }
# v367: Android 8+ launcher icon = purple gradient + white "Ybex." (adaptive layers). Without these the phone showed
# Capacitor's default blue icon.
cp icon/icon-foreground.png icon/icon-background.png assets/
npm run assets && ok "app icon + purple launch screen"
npm run sync && ok "web build copied into the app (server: ${VITE_API_ORIGIN:-https://ybexapp.ai.studio})"

echo "== 4. Android settings (version, sign-in link, notifications, splash, white nav bar)"
GRADLE="android/app/build.gradle"
sed -i.bak -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" "$GRADLE" && rm -f "$GRADLE.bak"
ok "version $VERSION_NAME (code $VERSION_CODE)"

python3 - <<'PY'
import re, os
m = "android/app/src/main/AndroidManifest.xml"
s = open(m).read()
if "android.permission.POST_NOTIFICATIONS" not in s:
    s = s.replace("</manifest>", '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>')
if "android.permission.INTERNET" not in s:
    s = s.replace("</manifest>", '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>')
if 'android:scheme="com.ybex.app"' not in s:
    # Google / Apple sign-in come back through com.ybex.app://oauth#token=… (backend/oauth_routes.ts, app=native)
    filt = '''
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.ybex.app" />
            </intent-filter>
'''
    i = s.index("</activity>")
    s = s[:i] + filt + "        " + s[i:]
# v378: the Google sign-in plugin brings Facebook's SDK, which adds the advertising-ID permissions.
# v418 (Ravi: Meta app-install ads): the Advertising ID IS used now (Meta measures installs with it), so AD_ID stays —
# Play Console → App content → Advertising ID must say "Yes" (analytics + advertising). The ad-services ones stay removed.
if 'xmlns:tools=' not in s:
    s = s.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android"', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"', 1)
s = s.replace('    <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />\n', '')  # v418: older runs removed it
if '"com.google.android.gms.permission.AD_ID"' not in s:
    s = s.replace("</manifest>", '    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />\n</manifest>')
# v418: Meta SDK — App ID + client token from strings.xml, automatic install / app-open events, advertiser ID on
if "com.facebook.sdk.ApplicationId" not in s:
    meta = """
        <meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/facebook_app_id" />
        <meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/facebook_client_token" />
        <meta-data android:name="com.facebook.sdk.AutoLogAppEventsEnabled" android:value="true" />
        <meta-data android:name="com.facebook.sdk.AdvertiserIDCollectionEnabled" android:value="true" />
        <meta-data android:name="com.facebook.sdk.AutoInitEnabled" android:value="true" />
"""
    i = s.index("</application>")
    s = s[:i] + meta + "    " + s[i:]
for n in ["android.permission.ACCESS_ADSERVICES_ATTRIBUTION", "android.permission.ACCESS_ADSERVICES_AD_ID", "android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE", "android.permission.ACCESS_ADSERVICES_TOPICS"]:
    if n + '" tools:node="remove"' not in s:
        s = s.replace("</manifest>", '    <uses-permission android:name="%s" tools:node="remove" />\n</manifest>' % n)
open(m, "w").write(s)

# v418: Meta App ID + client token (public values that ship inside every app using the Facebook SDK)
sv = "android/app/src/main/res/values/strings.xml"
x = open(sv).read()
for k, v in [("facebook_app_id", "1192925323395785"), ("facebook_client_token", "64f8accb46551c2c99e3c4a087a2ae8c")]:
    if 'name="%s"' % k not in x:
        x = x.replace("</resources>", '    <string name="%s">%s</string>\n</resources>' % (k, v))
open(sv, "w").write(x)

st = "android/app/src/main/res/values/styles.xml"
x = open(st).read()
def add_items(xml, style, items):
    pat = re.compile(r'(<style name="%s"[^>]*>)(.*?)(</style>)' % re.escape(style), re.S)
    mm = pat.search(xml)
    if not mm: return xml
    body = mm.group(2)
    for k, v in items:
        if k not in body: body += '\n        <item name="%s">%s</item>' % (k, v)
    return xml[:mm.start()] + mm.group(1) + body + "\n    " + mm.group(3) + xml[mm.end():]
# Android 12+ system splash: plain Ybex purple, no logo box (same idea as the v334 TWA override)
x = add_items(x, "AppTheme.NoActionBarLaunch", [("windowSplashScreenBackground", "#7E00DC"), ("windowSplashScreenAnimatedIcon", "@drawable/splash_transparent"), ("android:navigationBarColor", "#FFFFFF")])
# v361: phone's back/home buttons on white, like the app's own bottom bar
x = add_items(x, "AppTheme.NoActionBar", [("android:navigationBarColor", "#FFFFFF"), ("android:windowLightNavigationBar", "true"), ("android:windowBackground", "@android:color/white"), ("android:windowLightStatusBar", "true"), ("android:forceDarkAllowed", "false")])  # v430: never the phone's dark grey behind the clock
open(st, "w").write(x)
d = "android/app/src/main/res/drawable"
os.makedirs(d, exist_ok=True)
open(os.path.join(d, "splash_transparent.xml"), "w").write('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@android:color/transparent" />
    <size android:width="1dp" android:height="1dp" />
</shape>
''')
PY
ok "manifest (com.ybex.app sign-in link, notifications) + plain purple splash + white nav bar"

echo "== 4b. Plain purple launch screen + Android 16 target"
# Play wants new updates to target the newest Android (API 36) and Play protection needs minSdk 24+.
sed -i.bak -E "s/minSdkVersion = [0-9]+/minSdkVersion = 24/; s/compileSdkVersion = [0-9]+/compileSdkVersion = 36/; s/targetSdkVersion = [0-9]+/targetSdkVersion = 36/" android/variables.gradle && rm -f android/variables.gradle.bak
# Plain #7E00DC launch screen (all Android versions), no logo box (Ravi: "ye logo wali screen dikha hi mat").
find android/app/src/main/res -path "*drawable*" -name "splash.png" -delete
cat > android/app/src/main/res/drawable/splash.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#7E00DC" />
</shape>
XML
python3 - <<'PY2'
import re
st = "android/app/src/main/res/values/styles.xml"
x = open(st).read()
pat = re.compile(r'(<style name="AppTheme.NoActionBar"[^>]*>)(.*?)(</style>)', re.S)
m = pat.search(x)
body = m.group(2)
for k, v in [("windowSplashScreenBackground", "#7E00DC"), ("windowSplashScreenAnimatedIcon", "@drawable/splash_transparent")]:
    if k not in body: body += '\n        <item name="%s">%s</item>' % (k, v)
open(st, "w").write(x[:m.start()] + m.group(1) + body + "\n    " + m.group(3) + x[m.end():])
PY2
ok "plain purple launch screen, target API 36"

# v390: Capacitor 7's template uses Android Gradle plugin 8.7.2, but androidx.browser 1.9.0 (pulled in by the browser
# plugin) needs 8.9.1+. Pin the library instead of upgrading the build tools.
if ! grep -q "androidx.browser:browser:1.8.0" android/app/build.gradle; then
cat >> android/app/build.gradle <<'GRADLE'

configurations.all {
    resolutionStrategy.force 'androidx.browser:browser:1.8.0'
}
GRADLE
fi
ok "androidx.browser pinned to 1.8.0 (works with the template's Gradle plugin)"

# v418: Meta SDK (app events) + Google Play Install Referrer, and Ybex's own native plugin (MetaEventsPlugin + MainActivity)
if ! grep -q "com.facebook.android:facebook-core" android/app/build.gradle; then
cat >> android/app/build.gradle <<'GRADLE'

dependencies {
    implementation 'com.facebook.android:facebook-core:18.0.3'
    implementation 'com.android.installreferrer:installreferrer:2.2'
}
GRADLE
fi
mkdir -p android/app/src/main/java/com/ybex/app
cp ../android-overrides/app/src/main/java/com/ybex/app/*.java android/app/src/main/java/com/ybex/app/
ok "Meta SDK + install referrer + MetaEvents plugin (app events for Meta ads)"

if [[ -f google-services.json ]]; then
  cp google-services.json android/app/google-services.json && ok "google-services.json copied (Android notifications on)"
else
  warn "No android-app/google-services.json yet → the app works, but phone notifications stay off."
  warn "Get it: console.firebase.google.com → your project → Add app → Android → package com.ybex.app → download google-services.json → put it in android-app/ → run this script again."
fi
npx cap sync android >/dev/null && ok "final sync"

cat <<'TXT'

== 5. Now in Android Studio (the only manual part)
  1. It opens by itself now (or run: npm run open).
  2. Wait for "Gradle sync" to finish (first time 3–10 min).
  3. Test on your phone: plug it in (USB debugging on) → green ▶ Run. Try airplane mode: the app still opens.
  4. Build → Generate Signed App Bundle / APK → Android App Bundle → Next
       Key store path: your signing.keystore (the SAME one used for the PWABuilder build — Drive / pen drive)
       Key alias: my-key-alias   (passwords from signing-key-info.txt)
       → release → Create. File: android/app/release/app-release.aab
     Same package (com.ybex.app) + same key = Play treats it as an UPDATE of the current Ybex listing.
  5. Play Console → Ybex → Testing → Closed testing → Alpha → Create new release → upload app-release.aab →
     release notes "Ybex now opens offline, faster screens" → Review → Start rollout.
TXT
npx cap open android || true
