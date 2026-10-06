import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Records } from "../components/PoopTracker";
import { calculateDuelScore } from "./duelScoring";

export const DUEL_WIN_REWARD = 10;

function pickWinner(
  player1: string,
  player2: string,
  scores?: Record<string, number>,
): string | null {
  const s1 = scores?.[player1] || 0;
  const s2 = scores?.[player2] || 0;
  if (s1 > s2) return player1;
  if (s2 > s1) return player2;
  return null;
}

export async function finishExpiredDuel(duelId: string): Promise<void> {
  const duelRef = doc(db, "duels", duelId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(duelRef);
      const duel = snap.data();
      if (!duel || duel.status !== "active" || Date.now() < duel.endDate) {
        return;
      }
      tx.update(duelRef, {
        status: "finished",
        winnerId: pickWinner(duel.player1, duel.player2, duel.scores),
        rewarded: false,
      });
    });
  } catch (e) {
    console.error("Ошибка завершения дуэли:", e);
  }
}

export async function surrenderDuel(
  duelId: string,
  uid: string,
): Promise<void> {
  const duelRef = doc(db, "duels", duelId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(duelRef);
    const duel = snap.data();
    if (!duel || duel.status !== "active") return;
    const winner = duel.player1 === uid ? duel.player2 : duel.player1;
    tx.update(duelRef, {
      status: "finished",
      winnerId: winner,
      surrenderedBy: uid,
      rewarded: false,
    });
  });
}

export async function claimDuelReward(
  duelId: string,
  uid: string,
): Promise<void> {
  const duelRef = doc(db, "duels", duelId);
  const userRef = doc(db, "users", uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(duelRef);
      const duel = snap.data();
      if (
        !duel ||
        duel.status !== "finished" ||
        duel.winnerId !== uid ||
        duel.rewarded !== false
      ) {
        return;
      }
      tx.update(duelRef, { rewarded: true });
      tx.update(userRef, {
        duelWins: increment(1),
        balance: increment(DUEL_WIN_REWARD),
      });
    });
  } catch (e) {
    console.error("Ошибка начисления награды за дуэль:", e);
  }
}

export async function syncMyDuelScores(
  userId: string,
  records: Records,
): Promise<void> {
  try {
    const [s1, s2] = await Promise.all(
      (["player1", "player2"] as const).map((field) =>
        getDocs(
          query(
            collection(db, "duels"),
            where(field, "==", userId),
            where("status", "==", "active"),
          ),
        ),
      ),
    );
    for (const d of [...s1.docs, ...s2.docs]) {
      const data = d.data();
      const myScore = calculateDuelScore(records, data.startDate, data.endDate);
      if (data.scores?.[userId] === myScore) continue;
      await updateDoc(doc(db, "duels", d.id), {
        [`scores.${userId}`]: myScore,
      });
    }
  } catch (err) {
    console.error("Ошибка синхронизации баллов дуэли:", err);
  }
}
