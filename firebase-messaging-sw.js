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
