importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyAl3AEJhlyERIMhv_Vu1U-PhfjJRo9UxZY",
  authDomain: "kaka-calendar-5fa7c.firebaseapp.com",
  projectId: "kaka-calendar-5fa7c",
  storageBucket: "kaka-calendar-5fa7c.firebasestorage.app",
  messagingSenderId: "562476631743",
  appId: "1:562476631743:web:5513e89dabdaf57f5d680a",
});

const messaging = firebase.messaging();

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;

  const data = payload.data || {};
  const title = data.title || "Дневник 💩";

  self.registration.showNotification(title, {
    body: data.body || "",
    icon: scopeUrl("pwa-192x192.png"),
    badge: scopeUrl("pwa-64x64.png"),
    data: { link: data.link || self.registration.scope },
    vibrate: [200, 100, 200],
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = event.notification.data?.link || self.registration.scope;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      }),
  );
});
