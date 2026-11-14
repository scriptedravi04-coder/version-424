package com.ybex.app;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.facebook.FacebookSdk;
import com.facebook.appevents.AppEventsLogger;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Iterator;

/**
 * v418 (Ravi: app-install ads) — Meta app events from the Ybex Android app.
 *  - The Facebook SDK (App ID + client token in res/values/strings.xml, set up by mac-prepare-android.sh) logs installs and
 *    app opens by itself.
 *  - logEvent({ name, params, value }) sends Ybex's funnel events (sign-up, QualifiedCreator, QualifiedCreator10K).
 *    params.event_id = the same id the server's Conversions API copy uses, so Meta counts each event once.
 *  - getInstallReferrer() returns the Google Play install referrer ("utm_source=meta&utm_campaign=…") on the FIRST call
 *    after install, "" afterwards.
 */
@CapacitorPlugin(name = "MetaEvents")
public class MetaEventsPlugin extends Plugin {
    private AppEventsLogger logger;

    @Override
    public void load() {
        try {
            if (!FacebookSdk.isInitialized()) {
                FacebookSdk.sdkInitialize(getContext().getApplicationContext());
            }
            FacebookSdk.setAutoLogAppEventsEnabled(true);
            FacebookSdk.setAdvertiserIDCollectionEnabled(true);
            AppEventsLogger.activateApp(getActivity().getApplication());
            logger = AppEventsLogger.newLogger(getContext());
        } catch (Exception e) {
            logger = null; // the app keeps working without Meta events
        }
    }

    @PluginMethod
    public void logEvent(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.isEmpty() || logger == null) {
            call.resolve();
            return;
        }
        Bundle bundle = new Bundle();
        JSObject params = call.getObject("params", new JSObject());
        Iterator<String> keys = params.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            Object v = params.opt(k);
            if (v instanceof Number) bundle.putDouble(k, ((Number) v).doubleValue());
            else if (v != null) bundle.putString(k, String.valueOf(v));
        }
        try {
            Double value = call.getDouble("value");
            if (value != null) logger.logEvent(name, value, bundle);
            else logger.logEvent(name, bundle);
        } catch (Exception e) {
            // never break the app for an analytics call
        }
        call.resolve();
    }

    /**
     * v419 — is Firebase set up in THIS build (google-services.json was present, so the google-services plugin made the
     * "google_app_id" string)? The web code turns Android push on only when this says yes: older builds without Firebase
     * crash on PushNotifications.register(), and they still get new web code through live updates.
     */
    @PluginMethod
    public void hasFirebase(PluginCall call) {
        boolean ready = false;
        try {
            int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
            ready = id != 0 && !getContext().getString(id).isEmpty();
        } catch (Exception ignored) { }
        JSObject r = new JSObject();
        r.put("ready", ready);
        call.resolve(r);
    }

    @PluginMethod
    public void getInstallReferrer(final PluginCall call) {
        final SharedPreferences sp = getContext().getSharedPreferences("yb_meta", 0);
        if (sp.getBoolean("referrer_read", false)) {
            JSObject r = new JSObject();
            r.put("referrer", "");
            call.resolve(r);
            return;
        }
        try {
            final InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    String ref = "";
                    try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            ReferrerDetails d = client.getInstallReferrer();
                            ref = d.getInstallReferrer();
                        }
                    } catch (Exception ignored) { }
                    try { client.endConnection(); } catch (Exception ignored) { }
                    sp.edit().putBoolean("referrer_read", true).apply();
                    JSObject r = new JSObject();
                    r.put("referrer", ref == null ? "" : ref);
                    call.resolve(r);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    JSObject r = new JSObject();
                    r.put("referrer", "");
                    try { call.resolve(r); } catch (Exception ignored) { }
                }
            });
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("referrer", "");
            call.resolve(r);
        }
    }

    // v430: kept in this file (the source zip is at its 999-file limit) — registered as MetaEventsPlugin.YbexBarsPlugin.
    /**
     * v430 (Ravi: "status bar apni theme ki nahi, phone ki theme ki hai"). The app targets Android 16, which always draws
     * apps edge-to-edge: the StatusBar plugin's setBackgroundColor is ignored there, and the strip behind the clock showed
     * the window's own colour (dark grey when the phone is in dark mode). This paints that strip with the page's top
     * colour (window + root view background) and picks dark / light clock icons. Works on old Android too.
     *   setColor({ color: "#F3ECFF", light: true })  — light = dark icons on a light bar
     */
    @CapacitorPlugin(name = "YbexBars")
    public static class YbexBarsPlugin extends Plugin {
        @PluginMethod
        public void setColor(PluginCall call) {
            final String hex = call.getString("color", "#FFFFFF");
            final boolean light = Boolean.TRUE.equals(call.getBoolean("light", true));
            getActivity().runOnUiThread(() -> {
                try {
                    int c = Color.parseColor(hex);
                    Window w = getActivity().getWindow();
                    View decor = w.getDecorView();
                    decor.setBackgroundColor(c);
                    if (Build.VERSION.SDK_INT < 35) w.setStatusBarColor(c);
                    WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(w, decor);
                    ctl.setAppearanceLightStatusBars(light);
                    call.resolve();
                } catch (Exception e) {
                    call.reject("bad colour: " + hex);
                }
            });
        }
    }
}
