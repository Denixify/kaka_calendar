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

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Получено фоновое сообщение:", payload);

  const title = payload.notification?.title || "Дневник 💩";
  const body = payload.notification?.body || "";
  const icon = "/kaka_calendar/pwa-192x192.png";
  const badge = "/kaka_calendar/pwa-64x64.png";
  const link =
    payload.fcmOptions?.link ||
    "https://kaka-calendar-5fa7c.web.app/kaka_calendar/";

  self.registration.showNotification(title, {
    body,
    icon,
    badge,
    data: { link },
    vibrate: [200, 100, 200],
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link =
    event.notification.data?.link ||
    "https://kaka-calendar-5fa7c.web.app/kaka_calendar/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/kaka_calendar/") && "focus" in client) {
            return client.focus();
          }
        }
        // Иначе открываем новую вкладку
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      }),
  );
});
