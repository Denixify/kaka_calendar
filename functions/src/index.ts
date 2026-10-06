import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const APP_URL = "https://denixify.github.io/kaka_calendar/";
const DEFAULT_TIME_ZONE = "Europe/Berlin";
const USERS_PAGE_SIZE = 200;

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

type UserData = FirebaseFirestore.DocumentData;

function collectTokens(userData: UserData): string[] {
  const tokens: string[] = Array.isArray(userData.fcmTokens)
    ? userData.fcmTokens
    : [];
  if (userData.fcmToken) tokens.push(userData.fcmToken);
  return Array.from(new Set(tokens.filter(Boolean)));
}

async function pushToUser(
  uid: string,
  userData: UserData,
  title: string,
  body: string,
): Promise<void> {
  const tokens = collectTokens(userData);
  if (tokens.length === 0) return;

  try {
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title, body, link: APP_URL },
      webpush: { headers: { Urgency: "high" } },
    });

    const invalid = tokens.filter((_, i) => {
      const code = res.responses[i].error?.code;
      return code !== undefined && INVALID_TOKEN_CODES.has(code);
    });

    if (invalid.length > 0) {
      const update: Record<string, unknown> = {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
      };
      if (invalid.includes(userData.fcmToken)) {
        update.fcmToken = admin.firestore.FieldValue.delete();
      }
      await db.collection("users").doc(uid).update(update);
    }
  } catch (error) {
    console.error(`Ошибка отправки пуша для UID ${uid}:`, error);
  }
}

async function sendNotification(uid: string, title: string, body: string) {
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data();
  if (!userData) return;
  await pushToUser(uid, userData, title, body);
}

function getReceiverId(chatId: string, senderUid: string): string | null {
  if (chatId.startsWith(`${senderUid}_`)) {
    return chatId.slice(senderUid.length + 1) || null;
  }
  if (chatId.endsWith(`_${senderUid}`)) {
    return chatId.slice(0, -(senderUid.length + 1)) || null;
  }
  return null;
}

const MESSAGE_FALLBACK_TEXT: Record<string, string> = {
  game_challenge: "Тебе бросили вызов в мини-игре!",
};

export const onNewChatMessage = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const msgData = event.data?.data();
    if (!msgData) return;

    const { senderUid, text, type } = msgData;
    if (!senderUid) return;

    if (type === "gift" || type === "duel_invite") return;

    const receiverId = getReceiverId(event.params.chatId, senderUid);
    if (!receiverId) return;

    const body = String(
      text || MESSAGE_FALLBACK_TEXT[type as string] || "Новое сообщение",
    ).slice(0, 140);

    const senderSnap = await db.collection("users").doc(senderUid).get();
    const senderName = senderSnap.data()?.nickname || "Собеседник";

    await sendNotification(
      receiverId,
      `Новое сообщение от @${senderName}`,
      body,
    );
  },
);

export const onDuelCreated = onDocumentCreated(
  "duels/{duelId}",
  async (event) => {
    const duelData = event.data?.data();
    if (!duelData) return;

    const { player1, player2 } = duelData;
    if (!player1 || !player2) return;

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

    const senderName = giftData.fromNickname || "Тайный поклонник";

    await sendNotification(
      event.params.userId,
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

    const senderName = reqData.fromNickname || "Кто-то";

    await sendNotification(
      event.params.userId,
      "👋 Новая заявка в друзья",
      `@${senderName} хочет добавить тебя в друзья.`,
    );
  },
);

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function todayInZone(timeZone: string, now: Date): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return todayInZone(DEFAULT_TIME_ZONE, now);
    }
    dateFormatters.set(timeZone, formatter);
  }
  return formatter.format(now);
}

export const dailyTrackerReminder = onSchedule(
  {
    schedule: "30 20 * * *",
    timeZone: DEFAULT_TIME_ZONE,
  },
  async () => {
    const now = new Date();

    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let q = db
        .collection("users")
        .orderBy("fcmToken")
        .limit(USERS_PAGE_SIZE);
      if (last) q = q.startAfter(last);

      const page = await q.get();
      if (page.empty) break;

      await Promise.all(
        page.docs.map(async (userDoc) => {
          const userData = userDoc.data();
          const todayStr = todayInZone(
            userData.timeZone || DEFAULT_TIME_ZONE,
            now,
          );

          const recordsSnap = await userDoc.ref
            .collection("tracker")
            .doc("records")
            .get();
          const record = (recordsSnap.data() || {})[todayStr];
          const hasTodayRecord = record?.status && record.status !== "cancel";
          if (hasTodayRecord) return;

          await pushToUser(
            userDoc.id,
            userData,
            "💩 Время отметиться!",
            "День подходит к концу. Зафиксируй свой поход на трон, чтобы не потерять стрик!",
          );
        }),
      );

      last = page.docs[page.docs.length - 1];
      if (page.size < USERS_PAGE_SIZE) break;
    }
  },
);
