# Ybex Android app (Play Store) — v364

Ravi: "offline app dena hoga — app abhi sirf 146 KB ka hai, sari screens app mai honi chahiye taki offline bhi chale".

## Why this replaces the PWABuilder app
The current Play build (1.0.2, PWABuilder / TWA) is only a window that opens the website in Chrome. That's why it is
146 KB, and why it showed Chrome and errors when the website was down for a deploy.

This app is a **Capacitor** shell, same as the iPhone app (`ios-app/`):
- **Screens inside the app:** the whole web build (`dist/client`) is packed into the APK (several MB). The app opens
  instantly, even in airplane mode or while the server is down. Data still comes from the live server
  (`https://ybexapp.ai.studio`).
- **No Chrome bar, no "open in Chrome":** it doesn't depend on `assetlinks.json` any more. Keep the file anyway,
  for phones still on the old build.
- **Live updates without a Play release:** every website deploy also packs the web build (`scripts/ota-bundle.mjs`).
  The app asks `POST /api/app/android-update` on open, downloads a newer build in the background and shows it on the
  next open. A broken update rolls back by itself.
  - Still needs a Play release: a new plugin, a permission, the icon / name, or anything in `android-app/`.
  - To pause updates: server setting `ANDROID_OTA_OFF=true`.
  - If a web change needs a newer app: `ANDROID_OTA_MIN_BUILD=1.0.x`.
- **Phone Back button:** goes one screen back. On Home / Login it puts the app in the background. It never gets stuck
  (`src/lib/native.js`).
- **Google / Apple sign-in:** opens in the phone's browser sheet and comes back through `com.ybex.app://oauth`.
- **Phone notifications:** Firebase Cloud Messaging (free). This needs the one-time setup below; until then the app
  works without notifications.
  - Note: the old Chrome-based app used web push. Inside this app web push isn't available, so FCM replaces it.

## One-time: Firebase (for notifications, ~10 min)
1. Go to https://console.firebase.google.com → **Add project** → name "Ybex" (Google Analytics: off is fine).
2. In the project → **Add app** → Android icon → package name **`com.ybex.app`** → Register.
   **Download `google-services.json`** → put it in this folder (`android-app/google-services.json`). It is not
   committed (gitignored).
3. Project settings (⚙) → **Service accounts** → **Generate new private key** → a `.json` file downloads.
   Open it, copy everything, and paste it into the AI Studio secret **`FCM_SERVICE_ACCOUNT_JSON`**. Then deploy.
   Never share this file.
4. Optional: Project settings → Cloud Messaging → make sure "Firebase Cloud Messaging API (V1)" is **Enabled**.

## Build (on the Mac — Android Studio, free)
Needs: **Android Studio** (https://developer.android.com/studio — open it once so it downloads the SDK) and Node 20+.
```bash
cd android-app && bash scripts/mac-prepare-android.sh
```
The script:
1. checks Node / Java 17+ / the Android SDK;
2. installs packages and creates `android-app/android` (the Android Studio project, first time only);
3. makes the icon and plain-purple launch screen, builds the web app and copies it in;
4. sets version **1.0.4 (code 5)** — Play needs it higher than 1.0.3 / 4;
5. adds the sign-in link, the notification permission, the white navigation bar and the purple Android 12 splash;
6. copies `google-services.json` if it's there, then opens Android Studio.

Then in Android Studio:
1. Wait for Gradle sync to finish. The first time takes 3–10 min.
2. Optional: test on your phone. Turn on USB debugging, then press ▶ Run.
3. **Build → Generate Signed App Bundle / APK → Android App Bundle**, then:
   - key store = the **same `signing.keystore`** used for the PWABuilder build (Drive / pen drive);
   - alias **`my-key-alias`**, passwords from `signing-key-info.txt`;
   - choose **release**.
   - Output: `android/app/release/app-release.aab`.
   - Same package + same key = Play takes it as an **update** of the existing Ybex app. Testers keep their install.
4. Play Console → Ybex → **Testing → Closed testing → Alpha** → Create new release → upload the `.aab` →
   Review → Start rollout. After testers check it, promote to Production (from 31 Oct, 14-day rule).

Next time (new native version): bump `VERSION_NAME` / `VERSION_CODE` at the top of the script, run it again, and
build. Web-only changes don't need any of this — they arrive by live update.

## Test checklist
- **Opens offline:** open the app once online and sign in. Close it, turn on airplane mode, open it again. Home shows
  your saved data with "You're offline". Actions show a calm "you're offline" message.
- **Server down** (e.g. during a deploy): the app still opens with saved screens. It should not show a Chrome error
  page.
- **Back button:** go into a screen and press Back → previous screen. On Home, press Back → the app goes to the
  background.
- **Sign in with Google:** the browser sheet opens and returns into the app, signed in.
- **Notifications** (after Firebase): allow them on the "Never miss a brand deal" screen. Send a test from Admin →
  Push notifications. The phone shows it, and tapping it opens the right screen.
- **Live update:** deploy a small web change, then open the app twice. The change shows on the second open.

## Files
- `capacitor.config.json` — app id `com.ybex.app`, web build `../dist/client`, origin `https://localhost` (allowed
  by the server's CORS), plain purple splash, live update via `/api/app/android-update`.
- `package.json` — Capacitor 7 packages; `npm run sync` = web build + copy.
- `scripts/mac-prepare-android.sh` — the one command above.
- Server: `backend/appUpdate.ts` (`/api/app/android-update`), `backend/fcm.ts` + `backend/push_routes.ts`
  (Android tokens are saved as `fcm:<token>`), `src/lib/nativePush.js` (sends the platform), `src/lib/native.js`
  (Back button, update route).
