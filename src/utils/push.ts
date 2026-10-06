import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { getToken, type Messaging } from "firebase/messaging";
import { db } from "../firebase";

export async function registerPushToken(
  messaging: Messaging,
  uid: string,
): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
  if (!registration) return false;
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;

  await updateDoc(doc(db, "users", uid), {
    fcmToken: token,
    fcmTokens: arrayUnion(token),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return true;
}
