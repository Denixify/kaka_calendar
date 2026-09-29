import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function sendNotification(uid: string, title: string, body: string) {
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    const token = userSnap.data()?.fcmToken;

    if (!token) {
      console.log(`Пользователь ${uid} не имеет fcmToken. Пропуск.`);
      return;
    }

    await admin.messaging().send({
      token: token,
      notification: { title, body },
      webpush: {
        fcmOptions: {
          link: "/kaka_calendar/",
        },
      },
    });
    console.log(`Пуш отправлен юзеру ${uid}`);
  } catch (error) {
    console.error(`Ошибка отправки пуша для UID ${uid}:`, error);
  }
}

export const onNewChatMessage = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const msgData = event.data?.data();
    if (!msgData) return;

    const { senderUid, text } = msgData;
    const chatId = event.params.chatId;

    if (!senderUid) return;

    const receiverId = chatId.replace(senderUid, "").replace("_", "");
    if (!receiverId) return;

    const senderSnap = await db.collection("users").doc(senderUid).get();
    const senderName = senderSnap.data()?.nickname || "Собеседник";

    await sendNotification(
      receiverId,
      `Новое сообщение от @${senderName}`,
      text,
    );
  },
);

export const onDuelCreated = onDocumentCreated(
  "duels/{duelId}",
  async (event) => {
    const duelData = event.data?.data();
    if (!duelData) return;

    const { player1, player2 } = duelData;

    const senderSnap = await db.collection("users").doc(player1).get();
    const senderName = senderSnap.data()?.nickname || "Игрок";

    await sendNotification(
      player2,
      "⚔️ Вызов на дуэль!",
      `@${senderName} бросает тебе вызов. Зайди в приложение, чтобы принять!`,
    );
  },
);

export const onGiftReceived = onDocumentCreated(
  "users/{userId}/gifts_received/{giftId}",
  async (event) => {
    const giftData = event.data?.data();
    if (!giftData) return;

    const receiverId = event.params.userId;
    const senderName = giftData.fromNickname || "Тайный поклонник";

    await sendNotification(
      receiverId,
      "🎁 Новый подарок!",
      `@${senderName} отправил(а) тебе подарок. Загляни в профиль!`,
    );
  },
);

export const onFriendRequest = onDocumentCreated(
  "users/{userId}/friend_requests/{reqId}",
  async (event) => {
    const reqData = event.data?.data();
    if (!reqData) return;

    const receiverId = event.params.userId;
    const senderName = reqData.fromNickname || "Кто-то";

    await sendNotification(
      receiverId,
      "👋 Новая заявка в друзья",
      `@${senderName} хочет добавить тебя в друзья.`,
    );
  },
);

export const dailyTrackerReminder = onSchedule(
  {
    schedule: "30 20 * * *",
    timeZone: "Europe/Berlin",
  },
  async () => {
    const now = new Date();

    const berlinFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = berlinFormatter.format(now);

    const usersSnap = await db.collection("users").get();

    const promises = usersSnap.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      if (!userData.fcmToken) return;

      const recordsSnap = await db
        .collection("users")
        .doc(userDoc.id)
        .collection("tracker")
        .doc("records")
        .get();
      const recordsData = recordsSnap.data() || {};

      const hasTodayRecord =
        recordsData[todayStr] &&
        recordsData[todayStr].status &&
        recordsData[todayStr].status !== "cancel";

      if (!hasTodayRecord) {
        await admin
          .messaging()
          .send({
            token: userData.fcmToken,
            notification: {
              title: "💩 Время отметиться!",
              body: "День подходит к концу. Зафиксируй свой поход на трон, чтобы не потерять стрик!",
            },
            webpush: {
              fcmOptions: {
                link: "/kaka_calendar/",
              },
            },
          })
          .catch((e) => console.error("Ошибка cron-пуша:", e));
      }
    });

    await Promise.all(promises);
  },
);
