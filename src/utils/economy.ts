import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { dateToKey } from "./dates";

export type DailyRewardKind = "lastRecordReward" | "lastGameReward";

export async function claimDailyReward(
  uid: string,
  kind: DailyRewardKind,
  amount: number,
): Promise<boolean> {
  const today = dateToKey(new Date());
  const userRef = doc(db, "users", uid);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (snap.data()?.[kind] === today) return false;
      tx.update(userRef, { [kind]: today, balance: increment(amount) });
      return true;
    });
  } catch (e) {
    console.error("Ошибка начисления награды:", e);
    return false;
  }
}

export class InsufficientFundsError extends Error {
  constructor() {
    super("INSUFFICIENT_FUNDS");
  }
}

interface SendGiftParams {
  fromUid: string;
  fromNickname: string;
  toUid: string;
  giftId: string;
  price: number;
}

export async function sendGift({
  fromUid,
  fromNickname,
  toUid,
  giftId,
  price,
}: SendGiftParams): Promise<void> {
  const chatId = [fromUid, toUid].sort().join("_");
  const userRef = doc(db, "users", fromUid);
  const messageRef = doc(collection(db, "chats", chatId, "messages"));
  const giftRef = doc(collection(db, "users", toUid, "gifts_received"));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const balance: number = snap.data()?.balance ?? 0;
    if (balance < price) throw new InsufficientFundsError();

    tx.update(userRef, { balance: balance - price });
    tx.set(messageRef, {
      senderUid: fromUid,
      text: "Отправил(а) подарок!",
      type: "gift",
      giftId,
      createdAt: serverTimestamp(),
      read: false,
    });
    tx.set(giftRef, {
      fromUid,
      fromNickname,
      giftId,
      createdAt: serverTimestamp(),
    });
  });
}
