import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { finishExpiredDuel, surrenderDuel } from "../utils/duels";
import { askConfirm } from "../utils/dialogs";
import { DAY_FORMS, pluralRu } from "../utils/format";

interface DuelCardProps {
  duelId: string;
  currentUserId: string;
  partnerNickname: string;
}

interface DuelData {
  player1: string;
  player2: string;
  status: "pending" | "active" | "declined" | "finished";
  startDate: number;
  endDate: number;
  scores?: Record<string, number>;
  winnerId?: string | null;
  surrenderedBy?: string;
}

export function DuelCard({
  duelId,
  currentUserId,
  partnerNickname,
}: DuelCardProps) {
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);

    const unsub = onSnapshot(doc(db, "duels", duelId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as DuelData;
      setDuel(data);
      if (data.status === "active" && Date.now() >= data.endDate) {
        finishExpiredDuel(duelId);
      }
    });

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [duelId]);

  const handleSurrender = async () => {
    if (!duel || duel.status !== "active") return;
    const ok = await askConfirm(
      `Точно хочешь сдаться? Победа автоматически достанется @${partnerNickname}!`,
    );
    if (!ok) return;

    try {
      await surrenderDuel(duelId, currentUserId);
    } catch (e) {
      console.error("Ошибка при сдаче:", e);
    }
  };

  if (!duel) {
    return <div className="pt-duel-waiting">Загрузка данных дуэли...</div>;
  }

  const myScore = duel.scores?.[currentUserId] || 0;
  const partnerUid =
    duel.player1 === currentUserId ? duel.player2 : duel.player1;
  const partnerScore = duel.scores?.[partnerUid] || 0;

  const msLeft = Math.max(0, duel.endDate - now);
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  if (duel.status === "finished") {
    const isWinner = duel.winnerId === currentUserId;
    const isDraw = !duel.winnerId;

    return (
      <div className="pt-duel-finished-block">
        <h4 className="pt-duel-title">🏁 Дуэль окончена!</h4>
        <div className="pt-duel-scoreboard">
          <div className="pt-duel-score-col">
            <span className="name">Ты</span>
            <span className="score">{myScore}</span>
          </div>
          <span className="vs">:</span>
          <div className="pt-duel-score-col">
            <span className="name">@{partnerNickname}</span>
            <span className="score">{partnerScore}</span>
          </div>
        </div>
        <p className="pt-duel-result-banner">
          {isDraw
            ? "🤝 Ничья! Силы равны!"
            : isWinner
              ? "🏆 Твоя безоговорочная победа!"
              : `💀 @${partnerNickname} оказался победителем.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="pt-duel-title">⚔️ Идет битва!</h4>
      <div className="pt-duel-scoreboard">
        <div
          className={`pt-duel-score-col ${myScore >= partnerScore ? "leading" : ""}`}
        >
          <span className="name">Ты</span>
          <span className="score">{myScore}</span>
        </div>
        <span className="vs">VS</span>
        <div
          className={`pt-duel-score-col ${partnerScore >= myScore ? "leading" : ""}`}
        >
          <span className="name">@{partnerNickname}</span>
          <span className="score">{partnerScore}</span>
        </div>
      </div>

      <div className="pt-duel-timer">
        ⏳ Осталось {daysLeft} {pluralRu(daysLeft, DAY_FORMS)}
      </div>

      <button
        type="button"
        className="pt-duel-surrender-btn"
        onClick={handleSurrender}
      >
        🏳️ Сдаться
      </button>
    </div>
  );
}
