# Android build v1.0.3 (code 4) — no logo box + white bottom bar (v361)

Ravi (20 Oct): "Android mein khulte hi ye box kyu aa raha hai" + "neeche buttons pe purple line kyu".
Both come from the Android app itself (APK/AAB), not the website — a website deploy can't change them.
- Box: Android 12+ system splash draws the launcher icon in a box. Fix = the two override files below
  (plain purple splash, no icon). The current Play build (1.0.2, PWABuilder website) could not include them.
- Purple bottom bar: `twa-manifest.json` navigationColor was #7E00DC → now #FFFFFF (+ light grey divider), so the
  phone's back/home buttons sit on white like the app's own bottom bar.
- `twa-manifest.json` is already set to version 1.0.3 / code 4 (Play needs a higher code than 3).

# Android build — no logo box on opening (v334)

Problem: on Android 12 and newer, the phone itself shows a splash with the app icon in a rounded box for a moment,
then our purple opening animation starts.

Fix: make that system splash plain purple with no icon. This is inside the Android app (APK/AAB), not the website,
so it only works in a NEW Android build.

Build with Google's **Bubblewrap CLI** (PWABuilder's website does not let you edit these files):
1. `npm i -g @bubblewrap/cli`
2. In an empty folder: `bubblewrap init --manifest https://<your-app-domain>/manifest.webmanifest`
   (or copy `twa-manifest.json` from the repo there and run `bubblewrap update`).
3. Copy everything inside this `android-overrides/` folder over the generated project (same paths):
   - `app/src/main/res/drawable/splash_transparent.xml`
   - `app/src/main/res/values-v31/styles.xml`
   Check the theme name in `app/src/main/AndroidManifest.xml` (activity `LauncherActivity` → `android:theme`).
   If it is not `Theme.LauncherActivity`, rename the style in styles.xml to match.
4. `bubblewrap build` with the SAME signing keystore as before (see `docs/setup/SETUP_GUIDES.md` — keystore / assetlinks).
5. Install on an Android 12+ phone: opening shows plain purple → Ybex animation. The animation itself is untouched.

Note: `twa-manifest.json` `host` is `ybexapp.ai.studio`. If the live app is on `ybexmedia.in`, change `host` before
building and serve `/.well-known/assetlinks.json` on that domain (it's in `public/.well-known/`).
