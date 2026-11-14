package com.ybex.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// v418: registers Ybex's own native plugin (MetaEventsPlugin: Meta app events + Google Play install referrer).
// Copied over the generated MainActivity by android-app/scripts/mac-prepare-android.sh.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MetaEventsPlugin.class);
        registerPlugin(MetaEventsPlugin.YbexBarsPlugin.class); // v430: status bar in the app's colour (Android 15+ too)
        super.onCreate(savedInstanceState);
    }
}
