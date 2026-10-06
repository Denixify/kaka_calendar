import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  collection,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { PoopTracker, type Records } from "./components/PoopTracker";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileTab } from "./components/ProfileTab";
import { FriendsTab } from "./components/FriendsTab";
import { BottomNavBar } from "./components/BottomNavBar";
import { DialogHost } from "./components/DialogHost";
import { ACHIEVEMENTS_MAP } from "./constants/achievements";
import { useToday } from "./hooks/useToday";
import { useChatBadges } from "./hooks/useChatBadges";
import { computeStreak } from "./utils/streak";
import { dateToKey, shiftDateKey } from "./utils/dates";
import { claimDuelReward, finishExpiredDuel } from "./utils/duels";
import { notify } from "./utils/dialogs";
import {
  cacheKeys,
  loadUserCache,
  normalizeRecords,
  safeSet,
} from "./utils/localCache";
import "./components/PoopTracker.scss";

interface DuelDoc {
  id: string;
  player1: string;
  player2: string;
  status: string;
  endDate: number;
  winnerId?: string | null;
  scores?: Record<string, number>;
  surrenderedBy?: string;
  rewarded?: boolean;
}

function diffRecords(prev: Records, next: Records): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      payload[key] = next[key];
    }
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) payload[key] = deleteField();
  }
  return payload;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "friends" | "profile">(
    "home",
  );
  const [networkToast, setNetworkToast] = useState<"offline" | "online" | null>(
    !navigator.onLine ? "offline" : null,
  );

  const [records, setRecords] = useState<Records>({});
  const [lastRestore, setLastRestore] = useState<number>(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(
    [],
  );

  const recordsRef = useRef<Records>(records);
  const unlockedRef = useRef<string[]>(unlockedAchievements);

  const uid = currentUser?.uid ?? null;
  const today = useToday();
  const { friendsCount, unreadFriendUids, pendingDuelFriendUids } =
    useChatBadges(uid);

  const streakInfo = useMemo(
    () => computeStreak(records, today),
    [records, today],
  );

  const applyRecords = useCallback(
    (next: Records) => {
      recordsRef.current = next;
      setRecords(next);
      if (uid) safeSet(cacheKeys.records(uid), JSON.stringify(next));
    },
    [uid],
  );

  const handleUpdateRecords = useCallback(
    (nextRecords: Records) => {
      const prev = recordsRef.current;
      applyRecords(nextRecords);
      if (!uid) return;

      const payload = diffRecords(prev, nextRecords);
      if (Object.keys(payload).length === 0) return;
      setDoc(doc(db, "users", uid, "tracker", "records"), payload, {
        merge: true,
      }).catch((e) => console.error("Ошибка сохранения записей:", e));
    },
    [uid, applyRecords],
  );

  const handleRestoreStreak = () => {
    if (!uid) return;
    const yesterdayKey = shiftDateKey(dateToKey(new Date()), -1);

    handleUpdateRecords({
      ...recordsRef.current,
      [yesterdayKey]: { count: "", quality: null, status: "neutral" },
    });

    const restoreTime = Date.now();
    setLastRestore(restoreTime);
    safeSet(cacheKeys.lastRestore(uid), String(restoreTime));
    setDoc(
      doc(db, "users", uid),
      { lastRestore: restoreTime },
      { merge: true },
    ).catch(() => {});
  };

  const handleUnlockAchievements = useCallback(
    (newUnlocks: string[]) => {
      if (!uid) return;

      const currentList = unlockedRef.current;
      const uniqueNew = newUnlocks.filter((id) => !currentList.includes(id));
      if (uniqueNew.length === 0) return;

      const updated = [...currentList, ...uniqueNew];
      unlockedRef.current = updated;

      safeSet(cacheKeys.achievements(uid), JSON.stringify(updated));
      setUnlockedAchievements(updated);

      setDoc(
        doc(db, "users", uid),
        { unlockedAchievements: updated },
        { merge: true },
      ).catch(() => {});

      const names = uniqueNew
        .map((id) => ACHIEVEMENTS_MAP[id]?.name)
        .filter(Boolean)
        .join(", ");

      if (names) notify(`🏆 Новые достижения: ${names}`, "success");
    },
    [uid],
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
      if (user) {
        const cache = loadUserCache(user.uid);
        recordsRef.current = cache.records;
        unlockedRef.current = cache.achievements;
        setRecords(cache.records);
        setUnlockedAchievements(cache.achievements);
        setLastRestore(cache.lastRestore);
      } else {
        recordsRef.current = {};
        unlockedRef.current = [];
        setRecords({});
        setUnlockedAchievements([]);
        setLastRestore(0);
      }
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
    if (!uid) return;
    const ref = doc(db, "users", uid, "tracker", "records");
    let migrated = false;

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          applyRecords(normalizeRecords(snap.data()));
        } else if (!snap.metadata.fromCache && !migrated) {
          migrated = true;
          const local = recordsRef.current;
          if (Object.keys(local).length > 0) {
            setDoc(ref, local, { merge: true }).catch(() => {});
          }
        }
      },
      (e) => console.error("Ошибка подписки на записи:", e),
    );

    return () => unsubscribe();
  }, [uid, applyRecords]);

  useEffect(() => {
    if (!uid) return;
    let isMounted = true;

    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();

        const cloudAch = (data.unlockedAchievements as string[]) || [];
        const merged = Array.from(
          new Set([...cloudAch, ...unlockedRef.current]),
        );
        unlockedRef.current = merged;
        setUnlockedAchievements(merged);
        safeSet(cacheKeys.achievements(uid), JSON.stringify(merged));
        if (merged.length !== cloudAch.length) {
          setDoc(
            doc(db, "users", uid),
            { unlockedAchievements: merged },
            { merge: true },
          ).catch(() => {});
        }

        const cloudRestore = Number(data.lastRestore || 0);
        if (cloudRestore > 0) {
          setLastRestore((prev) => Math.max(prev, cloudRestore));
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    let duels1: DuelDoc[] = [];
    let duels2: DuelDoc[] = [];
    const handled = new Set<string>();

    const process = () => {
      const all = [...duels1, ...duels2];
      const now = Date.now();

      let winsCount = 0;
      let hasFlawless = false;
      let hasPacifist = false;
      let hasSurrender = false;

      for (const duel of all) {
        if (duel.status === "active" && now >= duel.endDate) {
          if (!handled.has(`finish:${duel.id}`)) {
            handled.add(`finish:${duel.id}`);
            finishExpiredDuel(duel.id);
          }
          continue;
        }
        if (duel.status !== "finished") continue;

        if (
          duel.winnerId === uid &&
          duel.rewarded === false &&
          !handled.has(`claim:${duel.id}`)
        ) {
          handled.add(`claim:${duel.id}`);
          claimDuelReward(duel.id, uid);
        }

        const isWinner = duel.winnerId === uid;
        const partnerUid = duel.player1 === uid ? duel.player2 : duel.player1;
        const myScore = duel.scores?.[uid] || 0;
        const partnerScore = duel.scores?.[partnerUid] || 0;

        if (isWinner) winsCount++;
        if (isWinner && myScore - partnerScore >= 10) hasFlawless = true;
        if (!duel.winnerId) hasPacifist = true;
        if (duel.surrenderedBy === uid) hasSurrender = true;
      }

      const newlyUnlocked: string[] = [];
      if (winsCount >= 1) newlyUnlocked.push("duel_first_blood");
      if (winsCount >= 5) newlyUnlocked.push("duel_gladiator");
      if (hasFlawless) newlyUnlocked.push("duel_flawless");
      if (hasPacifist) newlyUnlocked.push("duel_pacifist");
      if (hasSurrender) newlyUnlocked.push("duel_surrender");
      if (newlyUnlocked.length > 0) handleUnlockAchievements(newlyUnlocked);
    };

    const toDocs = (snap: { docs: { id: string; data: () => unknown }[] }) =>
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DuelDoc);

    const statuses = ["active", "finished"];
    const unsub1 = onSnapshot(
      query(
        collection(db, "duels"),
        where("player1", "==", uid),
        where("status", "in", statuses),
      ),
      (snap) => {
        duels1 = toDocs(snap);
        process();
      },
    );
    const unsub2 = onSnapshot(
      query(
        collection(db, "duels"),
        where("player2", "==", uid),
        where("status", "in", statuses),
      ),
      (snap) => {
        duels2 = toDocs(snap);
        process();
      },
    );

    const timer = setInterval(process, 60000);

    return () => {
      clearInterval(timer);
      unsub1();
      unsub2();
    };
  }, [uid, handleUnlockAchievements]);

  useEffect(() => {
    const newlyUnlocked: string[] = [];
    const values = Object.values(records);

    for (let n = 1; n <= 7; n++) {
      if (streakInfo.streak >= n) newlyUnlocked.push(`streak_${n}`);
    }

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

    for (let n = 1; n <= 5; n++) {
      if (friendsCount >= n) newlyUnlocked.push(`friend_${n}`);
    }

    if (newlyUnlocked.length > 0) {
      queueMicrotask(() => handleUnlockAchievements(newlyUnlocked));
    }
  }, [
    records,
    streakInfo,
    lastRestore,
    friendsCount,
    handleUnlockAchievements,
  ]);

  const networkToastView = networkToast && (
    <div
      className={`pt-toast pt-toast--${networkToast}`}
      onClick={() => setNetworkToast(null)}
    >
      {networkToast === "offline"
        ? "⚠️ Нет сети. Данные сохраняются локально."
        : "✅ Сеть восстановлена!"}
    </div>
  );

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
        {networkToastView}
        <DialogHost />
      </>
    );
  }

  return (
    <div className="pt-layout-container">
      <main className="pt-main-view">
        {activeTab === "home" && (
          <PoopTracker
            userId={currentUser.uid}
            records={records}
            onUpdateRecords={handleUpdateRecords}
          />
        )}

        {activeTab === "friends" && (
          <FriendsTab
            currentUser={currentUser}
            unreadFriendUids={unreadFriendUids}
            pendingDuelFriendUids={pendingDuelFriendUids}
          />
        )}

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
        hasUnreadMessages={unreadFriendUids.length > 0}
        hasPendingDuels={pendingDuelFriendUids.length > 0}
      />

      {networkToastView}
      <DialogHost />
    </div>
  );
}
