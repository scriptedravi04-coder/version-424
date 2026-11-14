// Session 41 — push notifications in the service worker (loaded by the generated sw.js through
// workbox importScripts). Shows the notification and opens the right page when it is tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Ybex", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Ybex";
  const options = {
    body: data.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: data.tag || undefined,
    // Session 53: "//other-site.com" also starts with "/" — only real in-app paths are opened.
    data: { url: typeof data.url === "string" && /^\/(?!\/)/.test(data.url) ? data.url : "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        try { await c.navigate(url); } catch (e) { /* page from another origin — just focus */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
