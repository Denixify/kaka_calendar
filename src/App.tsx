import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  PoopTracker,
  type PoopTrackerHandle,
  type Records,
} from "./components/PoopTracker";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileTab } from "./components/ProfileTab";
import { FriendsTab } from "./components/FriendsTab";
import { BottomNavBar } from "./components/BottomNavBar";
import { ACHIEVEMENTS_MAP } from "./constants/achievements";
import "./components/PoopTracker.scss";

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "friends" | "profile">(
    "home",
  );
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [hasPendingDuels, setHasPendingDuels] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [networkToast, setNetworkToast] = useState<"offline" | "online" | null>(
    !navigator.onLine ? "offline" : null,
  );

  const [records, setRecords] = useState<Records>(() => {
    try {
      const saved = localStorage.getItem("poop-tracker-data");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach((k) => {
        if (typeof parsed[k] === "string") {
          parsed[k] = { status: parsed[k], count: "", quality: null };
        }
      });
      return parsed;
    } catch {
      return {};
    }
  });

  const [lastRestore, setLastRestore] = useState<number>(() =>
    Number(localStorage.getItem("pt-last-restore") || 0),
  );

  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem("pt-achievements") || "[]");
      } catch {
        return [];
      }
    },
  );

  const trackerRef = useRef<PoopTrackerHandle>(null);

  const unlockedRef = useRef<string[]>(unlockedAchievements);

  useEffect(() => {
    unlockedRef.current = unlockedAchievements;
  }, [unlockedAchievements]);

  const streakInfo = useMemo(() => {
    const _now = new Date();
    const _todayStr = toDateKey(
      _now.getFullYear(),
      _now.getMonth(),
      _now.getDate(),
    );
    const _yestObj = new Date(_now);
    _yestObj.setDate(_yestObj.getDate() - 1);
    const _yestStr = toDateKey(
      _yestObj.getFullYear(),
      _yestObj.getMonth(),
      _yestObj.getDate(),
    );

    const activeEntries = Object.entries(records)
      .filter(([, data]) => data.status && data.status !== "cancel")
      .sort((a, b) => b[0].localeCompare(a[0]));

    const activeDates = activeEntries.map(([date]) => date);
    const totalActive = activeDates.length;

    if (totalActive === 0) return { streak: 0, isLost: false };

    const hasToday = activeDates.includes(_todayStr);
    const hasYesterday = activeDates.includes(_yestStr);

    if (!hasToday && !hasYesterday && totalActive > 0) {
      return { streak: 0, isLost: true };
    }

    let streak = 0;
    let currentExpected = activeDates[0];

    const getPrevDay = (d: string) => {
      const obj = new Date(d);
      obj.setDate(obj.getDate() - 1);
      return toDateKey(obj.getFullYear(), obj.getMonth(), obj.getDate());
    };

    for (const date of activeDates) {
      if (date === currentExpected) {
        streak++;
        currentExpected = getPrevDay(currentExpected);
      } else {
        break;
      }
    }

    return { streak, isLost: false };
  }, [records]);

  const handleUpdateRecords = useCallback(
    (newRecords: Records) => {
      setRecords(newRecords);
      localStorage.setItem("poop-tracker-data", JSON.stringify(newRecords));
      if (currentUser && Object.keys(newRecords).length > 0) {
        setDoc(
          doc(db, "users", currentUser.uid, "tracker", "records"),
          newRecords,
          {
            merge: true,
          },
        ).catch(() => {});
      }
    },
    [currentUser],
  );

  const handleRestoreStreak = () => {
    const now = new Date();
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yesterdayKey = toDateKey(
      yest.getFullYear(),
      yest.getMonth(),
      yest.getDate(),
    );

    const updated = {
      ...records,
      [yesterdayKey]: { count: "", quality: null, status: "neutral" as const },
    };

    const restoreTime = Date.now();
    setLastRestore(restoreTime);
    localStorage.setItem("pt-last-restore", restoreTime.toString());
    handleUpdateRecords(updated);
  };

  const handleUnlockAchievements = useCallback(
    (newUnlocks: string[]) => {
      if (!currentUser) return;

      const currentList = unlockedRef.current;
      const uniqueNew = newUnlocks.filter((id) => !currentList.includes(id));
      if (uniqueNew.length === 0) return;

      const updated = [...currentList, ...uniqueNew];
      unlockedRef.current = updated;

      localStorage.setItem("pt-achievements", JSON.stringify(updated));
      setUnlockedAchievements(updated);

      setDoc(
        doc(db, "users", currentUser.uid),
        { unlockedAchievements: updated },
        { merge: true },
      ).catch(() => {});

      const names = uniqueNew
        .map((id) => ACHIEVEMENTS_MAP[id]?.name)
        .filter(Boolean)
        .join(", ");

      if (names) {
        setTimeout(() => {
          alert(`🏆 Открыты новые достижения:\n${names}`);
        }, 300);
      }
    },
    [currentUser],
  );

  const handleTabChange = (tab: "home" | "friends" | "profile") => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleOffline = () => {
      setNetworkToast("offline");
      clearTimeout(timer);
      timer = setTimeout(() => setNetworkToast(null), 4000);
    };

    const handleOnline = () => {
      setNetworkToast("online");
      clearTimeout(timer);
      timer = setTimeout(() => setNetworkToast(null), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    getDoc(doc(db, "users", currentUser.uid))
      .then((snap) => {
        if (!isMounted) return;
        if (snap.exists() && snap.data().unlockedAchievements) {
          const ach = snap.data().unlockedAchievements as string[];
          setUnlockedAchievements(ach);
          unlockedRef.current = ach;
          localStorage.setItem("pt-achievements", JSON.stringify(ach));
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(
      collection(db, "users", currentUser.uid, "friends"),
      (snap) => {
        setFriendsCount(snap.size);
      },
    );
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    let msgUnsubs: (() => void)[] = [];

    const unsubFriends = onSnapshot(
      collection(db, "users", currentUser.uid, "friends"),
      (friendsSnap) => {
        msgUnsubs.forEach((fn) => fn());
        msgUnsubs = [];

        const friendIds = friendsSnap.docs.map((d) => d.id);
        if (friendIds.length === 0) {
          setHasUnreadMessages(false);
          setHasPendingDuels(false);
          return;
        }

        const unreadMsgMap: Record<string, boolean> = {};
        const pendingDuelMap: Record<string, boolean> = {};

        friendIds.forEach((fUid) => {
          const chatId = [currentUser.uid, fUid].sort().join("_");
          const msgRef = collection(db, "chats", chatId, "messages");
          const q = query(msgRef, where("senderUid", "==", fUid));

          const unsubMsg = onSnapshot(q, (snap) => {
            unreadMsgMap[fUid] = snap.docs.some(
              (d) => d.data().read === false && d.data().type !== "duel_invite",
            );
            pendingDuelMap[fUid] = snap.docs.some(
              (d) =>
                d.data().type === "duel_invite" &&
                d.data().duelStatus === "pending",
            );

            setHasUnreadMessages(Object.values(unreadMsgMap).some(Boolean));
            setHasPendingDuels(Object.values(pendingDuelMap).some(Boolean));
          });

          msgUnsubs.push(unsubMsg);
        });
      },
    );

    return () => {
      unsubFriends();
      msgUnsubs.forEach((fn) => fn());
      setHasUnreadMessages(false);
      setHasPendingDuels(false);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const q1 = query(
      collection(db, "duels"),
      where("player1", "==", currentUser.uid),
      where("status", "==", "finished"),
    );
    const q2 = query(
      collection(db, "duels"),
      where("player2", "==", currentUser.uid),
      where("status", "==", "finished"),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let duels1: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let duels2: any[] = [];

    const checkDuelAchievs = () => {
      const allDuels = [...duels1, ...duels2];
      if (allDuels.length === 0) return;

      const newlyUnlocked: string[] = [];
      let winsCount = 0;
      let hasFlawless = false;
      let hasPacifist = false;
      let hasSurrender = false;

      allDuels.forEach((duel) => {
        const isWinner = duel.winnerId === currentUser.uid;
        const isDraw = !duel.winnerId;
        const myScore = duel.scores?.[currentUser.uid] || 0;
        const partnerUid =
          duel.player1 === currentUser.uid ? duel.player2 : duel.player1;
        const partnerScore = duel.scores?.[partnerUid] || 0;
        const iSurrendered = duel.surrenderedBy === currentUser.uid;

        if (isWinner) winsCount++;
        if (isWinner && myScore - partnerScore >= 10) hasFlawless = true;
        if (isDraw) hasPacifist = true;
        if (iSurrendered) hasSurrender = true;
      });

      if (winsCount >= 1) newlyUnlocked.push("duel_first_blood");
      if (winsCount >= 5) newlyUnlocked.push("duel_gladiator");
      if (hasFlawless) newlyUnlocked.push("duel_flawless");
      if (hasPacifist) newlyUnlocked.push("duel_pacifist");
      if (hasSurrender) newlyUnlocked.push("duel_surrender");

      if (newlyUnlocked.length > 0) {
        handleUnlockAchievements(newlyUnlocked);
      }
    };

    const unsub1 = onSnapshot(q1, (snap) => {
      duels1 = snap.docs.map((d) => d.data());
      checkDuelAchievs();
    });
    const unsub2 = onSnapshot(q2, (snap) => {
      duels2 = snap.docs.map((d) => d.data());
      checkDuelAchievs();
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUser, handleUnlockAchievements]);

  useEffect(() => {
    const newlyUnlocked: string[] = [];
    const values = Object.values(records);

    if (streakInfo.streak >= 1) newlyUnlocked.push("streak_1");
    if (streakInfo.streak >= 2) newlyUnlocked.push("streak_2");
    if (streakInfo.streak >= 3) newlyUnlocked.push("streak_3");
    if (streakInfo.streak >= 4) newlyUnlocked.push("streak_4");
    if (streakInfo.streak >= 5) newlyUnlocked.push("streak_5");
    if (streakInfo.streak >= 6) newlyUnlocked.push("streak_6");
    if (streakInfo.streak >= 7) newlyUnlocked.push("streak_7");

    if (streakInfo.isLost) newlyUnlocked.push("lost_streak");
    if (lastRestore > 0) newlyUnlocked.push("magic_restore");

    if (values.some((r) => Number(r.count) > 1))
      newlyUnlocked.push("machine_gun");
    if (values.some((r) => r.quality === "diarrhea"))
      newlyUnlocked.push("liquid_gold");
    if (values.some((r) => r.status === "sad")) newlyUnlocked.push("soup_time");
    if (values.some((r) => r.quality === "hard"))
      newlyUnlocked.push("fatality");
    if (values.some((r) => r.status === "happy"))
      newlyUnlocked.push("chamber_of_secrets");
    if (values.some((r) => r.status === "cancel"))
      newlyUnlocked.push("stranger_things");
    if (values.some((r) => r.quality === "soft"))
      newlyUnlocked.push("perfect_soft");
    if (values.some((r) => r.quality === "undefined"))
      newlyUnlocked.push("schrodinger");
    if (values.some((r) => r.status === "neutral"))
      newlyUnlocked.push("not_great_not_terrible");

    if (friendsCount >= 1) newlyUnlocked.push("friend_1");
    if (friendsCount >= 2) newlyUnlocked.push("friend_2");
    if (friendsCount >= 3) newlyUnlocked.push("friend_3");
    if (friendsCount >= 4) newlyUnlocked.push("friend_4");
    if (friendsCount >= 5) newlyUnlocked.push("friend_5");

    if (newlyUnlocked.length > 0) {
      queueMicrotask(() => {
        handleUnlockAchievements(newlyUnlocked);
      });
    }
  }, [
    records,
    streakInfo,
    lastRestore,
    friendsCount,
    handleUnlockAchievements,
  ]);

  if (!authChecked) {
    return (
      <div className="pt-loading-screen">
        <div className="pt-loading-icon">💩</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthScreen onSuccess={() => {}} />
        {networkToast && (
          <div
            className={`pt-toast pt-toast--${networkToast}`}
            onClick={() => setNetworkToast(null)}
          >
            {networkToast === "offline"
              ? "⚠️ Нет сети. Данные сохраняются локально."
              : "✅ Сеть восстановлена!"}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="pt-layout-container">
      <main className="pt-main-view">
        {activeTab === "home" && (
          <PoopTracker
            ref={trackerRef}
            userId={currentUser.uid}
            records={records}
            onUpdateRecords={handleUpdateRecords}
          />
        )}

        {activeTab === "friends" && <FriendsTab currentUser={currentUser} />}

        {activeTab === "profile" && (
          <ProfileTab
            currentUser={currentUser}
            records={records}
            lastRestore={lastRestore}
            onRestoreStreak={handleRestoreStreak}
            unlockedAchievements={unlockedAchievements}
          />
        )}
      </main>

      <BottomNavBar
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        hasUnreadMessages={hasUnreadMessages}
        hasPendingDuels={hasPendingDuels}
      />

      {networkToast && (
        <div className={`pt-toast pt-toast--${networkToast}`}>
          {networkToast === "offline"
            ? "⚠️ Нет сети. Данные сохраняются локально."
            : "✅ Сеть восстановлена! Синхронизация завершена."}
        </div>
      )}
    </div>
  );
}
