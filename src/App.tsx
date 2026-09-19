import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, onSnapshot } from "firebase/firestore";
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

  const trackerRef = useRef<PoopTrackerHandle>(null);

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

  const [friendsCount, setFriendsCount] = useState(0);
  const [networkToast, setNetworkToast] = useState<"offline" | "online" | null>(
    !navigator.onLine ? "offline" : null,
  );

  useEffect(() => {
    const handleOffline = () => setNetworkToast("offline");
    const handleOnline = () => {
      setNetworkToast("online");
      setTimeout(() => setNetworkToast(null), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
    });

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      unsubscribe();
    };
  }, []);

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

    return { streak: Math.min(streak, 7), isLost: false };
  }, [records]);

  useEffect(() => {
    const newlyUnlocked: string[] = [];
    const values = Object.values(records);

    if (streakInfo.streak >= 1 && !unlockedAchievements.includes("streak_1"))
      newlyUnlocked.push("streak_1");
    if (streakInfo.streak >= 2 && !unlockedAchievements.includes("streak_2"))
      newlyUnlocked.push("streak_2");
    if (streakInfo.streak >= 3 && !unlockedAchievements.includes("streak_3"))
      newlyUnlocked.push("streak_3");
    if (streakInfo.streak >= 4 && !unlockedAchievements.includes("streak_4"))
      newlyUnlocked.push("streak_4");
    if (streakInfo.streak >= 5 && !unlockedAchievements.includes("streak_5"))
      newlyUnlocked.push("streak_5");
    if (streakInfo.streak >= 6 && !unlockedAchievements.includes("streak_6"))
      newlyUnlocked.push("streak_6");
    if (streakInfo.streak >= 7 && !unlockedAchievements.includes("streak_7"))
      newlyUnlocked.push("streak_7");

    if (streakInfo.isLost && !unlockedAchievements.includes("lost_streak"))
      newlyUnlocked.push("lost_streak");
    if (lastRestore > 0 && !unlockedAchievements.includes("magic_restore"))
      newlyUnlocked.push("magic_restore");

    if (
      values.some((r) => Number(r.count) > 1) &&
      !unlockedAchievements.includes("machine_gun")
    )
      newlyUnlocked.push("machine_gun");
    if (
      values.some((r) => r.quality === "diarrhea") &&
      !unlockedAchievements.includes("liquid_gold")
    )
      newlyUnlocked.push("liquid_gold");
    if (
      values.some((r) => r.status === "sad") &&
      !unlockedAchievements.includes("soup_time")
    )
      newlyUnlocked.push("soup_time");
    if (
      values.some((r) => r.quality === "hard") &&
      !unlockedAchievements.includes("fatality")
    )
      newlyUnlocked.push("fatality");
    if (
      values.some((r) => r.status === "happy") &&
      !unlockedAchievements.includes("chamber_of_secrets")
    )
      newlyUnlocked.push("chamber_of_secrets");
    if (
      values.some((r) => r.status === "cancel") &&
      !unlockedAchievements.includes("stranger_things")
    )
      newlyUnlocked.push("stranger_things");
    if (
      values.some((r) => r.quality === "soft") &&
      !unlockedAchievements.includes("perfect_soft")
    )
      newlyUnlocked.push("perfect_soft");
    if (
      values.some((r) => r.quality === "undefined") &&
      !unlockedAchievements.includes("schrodinger")
    )
      newlyUnlocked.push("schrodinger");
    if (
      values.some((r) => r.status === "neutral") &&
      !unlockedAchievements.includes("not_great_not_terrible")
    )
      newlyUnlocked.push("not_great_not_terrible");

    if (friendsCount >= 1 && !unlockedAchievements.includes("friend_1"))
      newlyUnlocked.push("friend_1");
    if (friendsCount >= 2 && !unlockedAchievements.includes("friend_2"))
      newlyUnlocked.push("friend_2");
    if (friendsCount >= 3 && !unlockedAchievements.includes("friend_3"))
      newlyUnlocked.push("friend_3");
    if (friendsCount >= 4 && !unlockedAchievements.includes("friend_4"))
      newlyUnlocked.push("friend_4");
    if (friendsCount >= 5 && !unlockedAchievements.includes("friend_5"))
      newlyUnlocked.push("friend_5");

    if (newlyUnlocked.length > 0) {
      queueMicrotask(() => {
        setUnlockedAchievements((prev) => {
          const uniqueNew = newlyUnlocked.filter((id) => !prev.includes(id));
          if (uniqueNew.length === 0) return prev;
          const updated = [...prev, ...uniqueNew];
          localStorage.setItem("pt-achievements", JSON.stringify(updated));
          return updated;
        });
      });
    }
  }, [records, streakInfo, lastRestore, unlockedAchievements, friendsCount]);

  const handleTabChange = (tab: "home" | "friends" | "profile") => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

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
          <div className={`pt-toast pt-toast--${networkToast}`}>
            {networkToast === "offline"
              ? "⚠️ Нет сети. Данные сохраняются локально."
              : "✅ Сеть восстановлена! Синхронизация завершена."}
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

      <BottomNavBar activeTab={activeTab} onChangeTab={handleTabChange} />

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
