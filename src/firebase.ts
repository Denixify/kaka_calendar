import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAl3AEJhlyERIMhv_Vu1U-PhfjJRo9UxZY",
  authDomain: "kaka-calendar-5fa7c.firebaseapp.com",
  projectId: "kaka-calendar-5fa7c",
  storageBucket: "kaka-calendar-5fa7c.firebasestorage.app",
  messagingSenderId: "562476631743",
  appId: "1:562476631743:web:5513e89dabdaf57f5d680a",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const DOMAIN_SUFFIX = "@poopstagram.local";

export const messagingReady: Promise<ReturnType<typeof getMessaging> | null> =
  isSupported()
    .then((supported) => {
      if (supported) return getMessaging(app);
      console.warn("Push-уведомления не поддерживаются в этом браузере.");
      return null;
    })
    .catch((err) => {
      console.warn("Ошибка проверки поддержки уведомлений:", err);
      return null;
    });
