// v336 — Apple push for Capacitor. In ios/App/App/AppDelegate.swift, inside `class AppDelegate`, add these two
// functions (Capacitor's push plugin needs them to receive the phone's Apple token):

func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}

// Then in Xcode → App target → Signing & Capabilities → "+ Capability":
//   • Push Notifications
//   • Background Modes → tick "Remote notifications"
