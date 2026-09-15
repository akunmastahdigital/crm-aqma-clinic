// Service Worker — handle browser push notification
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "CRM Aqma", {
      body: data.body || "Pesan baru masuk",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.conversationId || "inbox",
      renotify: true,
      data: { url: data.url || "/inbox" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/inbox";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Kalau sudah ada tab CRM terbuka, fokus ke sana
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      // Tidak ada tab terbuka, buka tab baru
      return clients.openWindow(url);
    })
  );
});
