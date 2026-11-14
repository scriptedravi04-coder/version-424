# Ybex iPhone app (App Store) — v335

The iPhone app is a **Capacitor** shell. It carries the whole Ybex web build (`dist/client`) **inside the app**,
so it opens instantly and looks loaded even with no internet (Apple guideline 4.2). It talks to the live server
(`https://ybexapp.ai.studio` by default since v337 — ybexmedia.in later) for data, like the website does.

What already works in the code (v335):
- `src/lib/native.js` — knows it's inside the app; every API call, file link, socket and `fetch` goes to the live
  server with the login token.
- Google / Apple sign-in open in the phone's browser sheet (Google blocks sign-in inside apps) and come back through
  `com.ybex.app://oauth#token=…` (server: `backend/oauth_routes.ts`, `app=native`).
- App starts on the app screens (`/app`), never the website landing. Our purple opening animation plays.
- Launch screen = plain purple (no logo box), then straight into the animation.
- Terms / Privacy / Help links open inside the app; outside websites open in the browser sheet.
- No service worker inside the app (not needed — files are inside the app).
- Server CORS already allows the app (`capacitor://localhost`).

- **Phone notifications (v336):** Apple push (APNs). The app asks with Ybex's own "Never miss a brand deal" screen,
  then Apple's popup; the token is saved on the server (`POST /api/push/native-register`) and every notification that
  goes to web push also goes to the iPhone app (`backend/apns.ts`). Tapping it opens the right screen.
- **Live update (v336):** every website deploy also packs the web build (`scripts/ota-bundle.mjs` → `/ota/…zip`).
  The app checks `POST /api/app/ios-update` when it opens, downloads a newer build in the background and shows it on
  the next open — no App Store release for UI / feature changes. A broken update rolls back by itself.
  Still needs an App Store build: new plugin, new permission, app icon / name, or anything in `ios-app/`.
  To pause updates: server setting `IOS_OTA_OFF=true`. If a web change needs a newer native build: `IOS_OTA_MIN_BUILD=1.0.x`.

## What you need
- A **Mac** with **Xcode** (free, App Store) and an **Apple Developer account** (₹8,700/year).
- Node 20+ on the Mac.

## Quick way (v337)
One command does steps 1–4 below (checks Xcode / Node / CocoaPods, installs, creates the Xcode project, icon,
web build, Info.plist keys, push code) and opens Xcode:
```bash
cd ios-app && bash scripts/mac-prepare.sh
```
Then only Signing & Capabilities + Run / Archive are left in Xcode (the script prints them).

## Build steps (on the Mac)
```bash
# 1. In the project root: install the app's packages once
npm ci

# 2. In this folder
cd ios-app
npm install
npx cap add ios                 # first time only — creates ios-app/ios (the Xcode project)
npm run assets                  # app icon + plain purple launch screen from ios-app/assets
npm run sync                    # builds the web app (VITE_API_ORIGIN=https://ybexapp.ai.studio) and copies it in
npm run open                    # opens Xcode
```
3. In Xcode → App → **Info**: add the keys from `ios-overrides/Info.plist.additions.xml`
   (sign-in return link `com.ybex.app`, photo/camera reasons, UPI apps, encryption = NO).
4. Xcode → App → **Signing & Capabilities**: pick your Team, Bundle ID `com.ybex.app`, add **Sign in with Apple**,
   **Push Notifications** and **Background Modes → Remote notifications**.
   Paste the two functions from `ios-overrides/AppDelegate.push-snippet.swift` into `ios/App/App/AppDelegate.swift`.
5. Apple push key (once): developer.apple.com → Certificates, IDs & Profiles → **Keys** → "+" → tick
   **Apple Push Notifications service (APNs)** → download the `.p8` (only downloadable once — keep it safe).
   Put on the server: `APNS_KEY` (the .p8 text), `APNS_KEY_ID`, `APNS_TEAM_ID` (Membership page),
   `APNS_BUNDLE_ID=com.ybex.app`, `APNS_PRODUCTION=true` (use `false` only while running from Xcode).
6. Run on your iPhone (cable) → test: login with email, Google, Apple; a payment; Eva; airplane mode open.
7. Product → **Archive** → Distribute → App Store Connect. Then fill App Store Connect using
   `docs/setup/SETUP_GUIDES.md` (privacy labels, demo accounts, screenshots, support / privacy / delete URLs).

Website updates reach the iPhone app by themselves (live update). Run `npm run sync` + Archive only for a new
App Store version (native changes, or every few months so new installs start on a recent build).
Server address (v337): the app talks to `https://ybexapp.ai.studio`. When ybexmedia.in serves the same app later:
1. set `VITE_API_ORIGIN=https://ybexmedia.in` (or change DEFAULT_ORIGIN in `src/lib/native.js`) and deploy — the
   live update carries it to every iPhone, and the app moves its update check there by itself (allowModifyUrl);
2. keep ybexapp.ai.studio working for a few weeks (old phones that haven't opened the app yet still use it);
3. no App Store release needed. Change `updateUrl` in `capacitor.config.json` only in the next App Store build.

## Server settings needed
- `APPLE_CLIENT_ID` (Apple Services ID) for Sign in with Apple, `GOOGLE_CLIENT_ID/SECRET` — see `docs/setup/ENV_KEYS.md`.
- Other server address? Build with `VITE_API_ORIGIN=https://your-domain npm run sync`.
