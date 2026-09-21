import { useState, useEffect, useMemo, useCallback } from "react";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { Records } from "./PoopTracker";
import { ACHIEVEMENTS, ACHIEVEMENTS_MAP } from "../constants/achievements";

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const SOUNDS = [
  { id: "none", label: "Без звука 🔕" },
  { id: "metalpipe.mp3", label: "метал)" },
  { id: "poop1.mp3", label: "пук1" },
  { id: "poop2.mp3", label: "пук2" },
];

const PRESET_AVATARS = [
  "👑",
  "💩",
  "🦄",
  "🐱",
  "🐶",
  "🦊",
  "🐸",
  "🐼",
  "🥷",
  "🧙",
  "🦸",
  "👽",
  "🤖",
  "👻",
  "⚡",
  "🔥",
];

const BASE = import.meta.env.BASE_URL;

interface FriendRequest {
  fromUid: string;
  fromNickname: string;
  fromAvatar?: string;
}

interface FinishedDuel {
  id: string;
  partnerNickname: string;
  partnerAvatar: string;
  myScore: number;
  partnerScore: number;
  winnerId: string | null;
  endedAt: number;
}

interface ProfileTabProps {
  currentUser: User;
  records: Records;
  lastRestore: number;
  onRestoreStreak: () => void;
  unlockedAchievements: string[];
}

export function ProfileTab({
  currentUser,
  records,
  lastRestore,
  onRestoreStreak,
  unlockedAchievements,
}: ProfileTabProps) {
  const [bio, setBio] = useState(() => {
    return localStorage.getItem(`pt-bio-cache-${currentUser.uid}`) || "";
  });
  const [avatar, setAvatar] = useState(() => {
    return localStorage.getItem(`pt-avatar-cache-${currentUser.uid}`) || "👑";
  });
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(() => {
    return localStorage.getItem(`pt-bio-cache-${currentUser.uid}`) || "";
  });
  const [isSavingBio, setIsSavingBio] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAchievModalOpen, setIsAchievModalOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isDuelHistoryOpen, setIsDuelHistoryOpen] = useState(false);

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [duelHistory, setDuelHistory] = useState<FinishedDuel[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [featuredAchievementId, setFeaturedAchievementId] = useState<
    string | null
  >(() => {
    return localStorage.getItem(`pt-featured-ach-${currentUser.uid}`) || null;
  });

  const [soundPref, setSoundPref] = useState<string>(
    () => localStorage.getItem("pt-sound-pref") || "metalpipe.mp3",
  );

  const [duelWins, setDuelWins] = useState<number>(() => {
    return Number(localStorage.getItem(`pt-duel-wins-${currentUser.uid}`) || 0);
  });

  const [nowTime] = useState(() => new Date().getTime());

  useEffect(() => {
    const isAnyModalOpen =
      isSettingsOpen ||
      isAchievModalOpen ||
      isRequestsOpen ||
      isAvatarModalOpen ||
      isDuelHistoryOpen;

    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.classList.add("modal-is-open");
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.classList.remove("modal-is-open");
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.classList.remove("modal-is-open");
    };
  }, [
    isSettingsOpen,
    isAchievModalOpen,
    isRequestsOpen,
    isAvatarModalOpen,
    isDuelHistoryOpen,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function loadUserProfile() {
      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists() && isMounted) {
          const data = userSnap.data();
          if (data.bio !== undefined) {
            setBio(data.bio);
            setBioDraft(data.bio);
            localStorage.setItem(`pt-bio-cache-${currentUser.uid}`, data.bio);
          }
          if (data.avatar) {
            setAvatar(data.avatar);
            localStorage.setItem(
              `pt-avatar-cache-${currentUser.uid}`,
              data.avatar,
            );
          }
          if (data.duelWins !== undefined) {
            setDuelWins(data.duelWins);
            localStorage.setItem(
              `pt-duel-wins-${currentUser.uid}`,
              String(data.duelWins),
            );
          }
          if (data.featuredAchievementId !== undefined) {
            setFeaturedAchievementId(data.featuredAchievementId);
            if (data.featuredAchievementId) {
              localStorage.setItem(
                `pt-featured-ach-${currentUser.uid}`,
                data.featuredAchievementId,
              );
            } else {
              localStorage.removeItem(`pt-featured-ach-${currentUser.uid}`);
            }
          }
        }
      } catch (e) {
        console.error("Ошибка загрузки профиля:", e);
      }
    }

    loadUserProfile();

    return () => {
      isMounted = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    let isMounted = true;

    async function fetchRequests() {
      try {
        const snap = await getDocs(
          collection(db, "users", currentUser.uid, "friend_requests"),
        );
        const list: FriendRequest[] = snap.docs.map((d) => ({
          fromUid: d.data().fromUid,
          fromNickname: d.data().fromNickname,
          fromAvatar: d.data().fromAvatar,
        }));
        if (isMounted) {
          setRequests(list);
        }
      } catch (e) {
        console.error("Ошибка загрузки заявок:", e);
      }
    }

    fetchRequests();

    return () => {
      isMounted = false;
    };
  }, [currentUser.uid]);

  const handleOpenDuelHistory = useCallback(async () => {
    setIsDuelHistoryOpen(true);
    setIsHistoryLoading(true);

    try {
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

      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const allDocs = [...s1.docs, ...s2.docs];

      const list: FinishedDuel[] = [];

      for (const d of allDocs) {
        const data = d.data();
        const partnerUid =
          data.player1 === currentUser.uid ? data.player2 : data.player1;

        let partnerName = "Игрок";
        let partnerAvatar = "👑";

        const uSnap = await getDoc(doc(db, "users", partnerUid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          partnerName = uData.nickname || "user";
          partnerAvatar = uData.avatar || "👑";
        }

        list.push({
          id: d.id,
          partnerNickname: partnerName,
          partnerAvatar: partnerAvatar,
          myScore: data.scores?.[currentUser.uid] || 0,
          partnerScore: data.scores?.[partnerUid] || 0,
          winnerId: data.winnerId || null,
          endedAt: data.endDate || data.createdAt || new Date().getTime(),
        });
      }

      list.sort((a, b) => b.endedAt - a.endedAt);
      setDuelHistory(list);
    } catch (err) {
      console.error("Ошибка загрузки истории дуэлей:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [currentUser.uid]);

  const handleToggleFeatured = async (achId: string) => {
    const nextId = featuredAchievementId === achId ? null : achId;
    setFeaturedAchievementId(nextId);
    if (nextId) {
      localStorage.setItem(`pt-featured-ach-${currentUser.uid}`, nextId);
    } else {
      localStorage.removeItem(`pt-featured-ach-${currentUser.uid}`);
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        featuredAchievementId: nextId,
      });
    } catch (e) {
      console.error("Ошибка обновления закрепленного достижения:", e);
    }
  };

  const handleSelectAvatar = async (selectedEmoji: string) => {
    setAvatar(selectedEmoji);
    localStorage.setItem(`pt-avatar-cache-${currentUser.uid}`, selectedEmoji);
    setIsAvatarModalOpen(false);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        avatar: selectedEmoji,
      });
    } catch (e) {
      console.error("Ошибка обновления аватарки:", e);
    }
  };

  const handleSaveBio = async () => {
    const cleanBio = bioDraft.trim();
    setIsSavingBio(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        bio: cleanBio,
      });
      setBio(cleanBio);
      localStorage.setItem(`pt-bio-cache-${currentUser.uid}`, cleanBio);
      setIsEditingBio(false);
    } catch (e) {
      console.error("Ошибка сохранения bio:", e);
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleAcceptRequest = async (req: FriendRequest) => {
    const timestamp = new Date().getTime();
    try {
      await setDoc(doc(db, "users", currentUser.uid, "friends", req.fromUid), {
        addedAt: timestamp,
      });
      await setDoc(doc(db, "users", req.fromUid, "friends", currentUser.uid), {
        addedAt: timestamp,
      });
      await deleteDoc(
        doc(db, "users", currentUser.uid, "friend_requests", req.fromUid),
      );
      setRequests((prev) => prev.filter((r) => r.fromUid !== req.fromUid));
    } catch (e) {
      console.error("Ошибка подтверждения заявки:", e);
    }
  };

  const handleRejectRequest = async (fromUid: string) => {
    try {
      await deleteDoc(
        doc(db, "users", currentUser.uid, "friend_requests", fromUid),
      );
      setRequests((prev) => prev.filter((r) => r.fromUid !== fromUid));
    } catch (e) {
      console.error("Ошибка отклонения заявки:", e);
    }
  };

  const playSound = (soundId: string) => {
    if (soundId === "none") return;
    const audio = new Audio(`${BASE}sounds/${soundId}`);
    audio.play().catch(() => {});
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

    if (totalActive === 0)
      return { streak: 0, isLost: false, isBeginner: true };

    const hasToday = activeDates.includes(_todayStr);
    const hasYesterday = activeDates.includes(_yestStr);
    const isBeginner = totalActive < 2 && !hasYesterday;

    if (!hasToday && !hasYesterday && totalActive > 0) {
      return { streak: 0, isLost: true, isBeginner: false };
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

    return { streak, isLost: false, isBeginner };
  }, [records]);

  const cooldownDaysLeft = Math.ceil(
    (7 * 24 * 60 * 60 * 1000 - (nowTime - lastRestore)) / (1000 * 60 * 60 * 24),
  );
  const isCooldown = cooldownDaysLeft > 0;

  return (
    <div className="pt-app">
      <div className="pt-card pt-profile-card">
        <div
          className="pt-avatar-badge-wrap"
          onClick={() => setIsAvatarModalOpen(true)}
        >
          <div className="pt-profile-avatar">{avatar}</div>
          <span className="pt-avatar-badge-edit">✏️</span>
        </div>

        <h2 className="pt-profile-name">
          @{currentUser.displayName || "user"}
        </h2>

        {featuredAchievementId && ACHIEVEMENTS_MAP[featuredAchievementId] && (
          <div
            className="pt-featured-badge"
            onClick={() => handleToggleFeatured(featuredAchievementId)}
            title="Нажми, чтобы открепить"
          >
            <span className="pt-featured-badge__icon">
              {ACHIEVEMENTS_MAP[featuredAchievementId].icon}
            </span>
            <span className="pt-featured-badge__title">
              {ACHIEVEMENTS_MAP[featuredAchievementId].name}
            </span>
          </div>
        )}

        <p className="pt-profile-desc">Синхронизация с облаком активна</p>

        <div className="pt-bio-block">
          {isEditingBio ? (
            <div className="pt-bio-edit">
              <textarea
                className="pt-bio-input"
                placeholder="Расскажи о себе..."
                maxLength={140}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
              />
              <div className="pt-bio-actions">
                <button
                  className="pt-btn pt-btn--secondary pt-btn--compact"
                  onClick={() => {
                    setBioDraft(bio);
                    setIsEditingBio(false);
                  }}
                >
                  Отмена
                </button>
                <button
                  className="pt-btn pt-btn--primary pt-btn--compact"
                  disabled={isSavingBio}
                  onClick={handleSaveBio}
                >
                  {isSavingBio ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="pt-bio-display"
              onClick={() => setIsEditingBio(true)}
            >
              <p className="pt-bio-text">
                {bio
                  ? `«${bio}»`
                  : "Нажми сюда, чтобы добавить описание профиля..."}
              </p>
              <button className="pt-bio-edit-icon" title="Редактировать bio">
                ✏️
              </button>
            </div>
          )}

          {duelWins > 0 && (
            <div
              className="pt-duel-trophy-badge pt-clickable"
              onClick={handleOpenDuelHistory}
              title="Нажми, чтобы открыть историю дуэлей"
            >
              <span className="pt-duel-trophy-icon">
                {duelWins >= 10 ? "🏆" : duelWins >= 5 ? "🥇" : "⚔️"}
              </span>
              <span className="pt-duel-trophy-count">
                {duelWins}{" "}
                {duelWins === 1 ? "победа" : duelWins < 5 ? "победы" : "побед"}
              </span>
              <span
                style={{ fontSize: "11px", opacity: 0.7, marginLeft: "2px" }}
              >
                ›
              </span>
            </div>
          )}
        </div>

        <div className="pt-profile-menu">
          <button
            className="pt-profile-menu-item"
            onClick={() => setIsRequestsOpen(true)}
          >
            <span className="pt-profile-menu-icon">🔔</span>
            <span className="pt-profile-menu-text">Заявки в друзья</span>
            {requests.length > 0 && (
              <span className="pt-badge-inline">{requests.length}</span>
            )}
            <span className="pt-profile-menu-arrow">›</span>
          </button>

          <button
            className="pt-profile-menu-item"
            onClick={handleOpenDuelHistory}
          >
            <span className="pt-profile-menu-icon">⚔️</span>
            <span className="pt-profile-menu-text">История дуэлей</span>
            {duelWins > 0 && (
              <span className="pt-profile-menu-badge">{duelWins}</span>
            )}
            <span className="pt-profile-menu-arrow">›</span>
          </button>

          <button
            className="pt-profile-menu-item"
            onClick={() => setIsAchievModalOpen(true)}
          >
            <span className="pt-profile-menu-icon">🏆</span>
            <span className="pt-profile-menu-text">Достижения</span>
            <span className="pt-profile-menu-badge">
              {unlockedAchievements.length}/{ACHIEVEMENTS.length}
            </span>
          </button>

          <button
            className="pt-profile-menu-item"
            onClick={() => setIsSettingsOpen(true)}
          >
            <span className="pt-profile-menu-icon">⚙️</span>
            <span className="pt-profile-menu-text">Настройки приложения</span>
            <span className="pt-profile-menu-arrow">›</span>
          </button>
        </div>

        <button
          className="pt-btn pt-btn--danger pt-profile-logout-btn"
          onClick={() => signOut(auth)}
        >
          Выйти из аккаунта
        </button>
      </div>

      {isAvatarModalOpen && (
        <div className="pt-overlay" onClick={() => setIsAvatarModalOpen(false)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">Выбери аватарку</h3>
            <div className="pt-avatar-picker-grid">
              {PRESET_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  className={`pt-avatar-picker-item ${avatar === emoji ? "active" : ""}`}
                  onClick={() => handleSelectAvatar(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setIsAvatarModalOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {isRequestsOpen && (
        <div className="pt-overlay" onClick={() => setIsRequestsOpen(false)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">Заявки в друзья</h3>

            {requests.length === 0 ? (
              <p className="pt-empty-friends">Новых заявок пока нет</p>
            ) : (
              <div className="pt-requests-list">
                {requests.map((req) => (
                  <div key={req.fromUid} className="pt-request-row">
                    <div className="pt-friend-info">
                      <span className="pt-friend-avatar">
                        {req.fromAvatar || "💩"}
                      </span>
                      <span>@{req.fromNickname}</span>
                    </div>
                    <div className="pt-request-actions">
                      <button
                        className="pt-btn pt-btn--primary pt-btn--compact"
                        onClick={() => handleAcceptRequest(req)}
                      >
                        Принять
                      </button>
                      <button
                        className="pt-btn pt-btn--secondary pt-btn--compact"
                        onClick={() => handleRejectRequest(req.fromUid)}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setIsRequestsOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {isDuelHistoryOpen && (
        <div className="pt-overlay" onClick={() => setIsDuelHistoryOpen(false)}>
          <div
            className="pt-modal pt-modal--achievs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">История дуэлей 📜</h3>

            {isHistoryLoading ? (
              <div className="pt-duel-waiting">Загрузка архива...</div>
            ) : duelHistory.length === 0 ? (
              <p className="pt-empty-friends">
                Завершённых дуэлей пока нет. Самое время бросить кому-нибудь
                вызов!
              </p>
            ) : (
              <div className="pt-duel-history-list">
                {duelHistory.map((h) => {
                  const isWin = h.winnerId === currentUser.uid;
                  const isDraw = !h.winnerId;

                  return (
                    <div
                      key={h.id}
                      className={`pt-duel-history-item ${isWin ? "win" : isDraw ? "draw" : "loss"}`}
                    >
                      <div className="pt-friend-info">
                        <span className="pt-friend-avatar">
                          {h.partnerAvatar}
                        </span>
                        <div>
                          <strong>@{h.partnerNickname}</strong>
                          <span className="pt-duel-history-date">
                            {new Date(h.endedAt).toLocaleDateString([], {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="pt-duel-history-score">
                        <span className="score">
                          {h.myScore} : {h.partnerScore}
                        </span>
                        <span className="badge">
                          {isDraw
                            ? "Ничья 🤝"
                            : isWin
                              ? "Победа 🏆"
                              : "Поражение 💀"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setIsDuelHistoryOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="pt-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">Настройки</h3>

            <div className="pt-settings-section">
              <h4>Звук завершения</h4>
              <div className="pt-sound-buttons">
                {SOUNDS.map((s) => (
                  <button
                    key={s.id}
                    className={`pt-sound-btn ${soundPref === s.id ? "active" : ""}`}
                    onClick={() => {
                      setSoundPref(s.id);
                      localStorage.setItem("pt-sound-pref", s.id);
                      playSound(s.id);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-settings-section pt-secret-section">
              <h4>Секретная функция 🤫</h4>
              <p className="pt-secret-desc">
                Позволяет восстановить упущенный стрик, если ты забыл(а)
                отметиться вчера.
              </p>

              {streakInfo.isBeginner ? (
                <button className="pt-btn pt-btn--secondary" disabled>
                  Слишком рано для магии (нужна история от 2 дней)...
                </button>
              ) : isCooldown ? (
                <button className="pt-btn pt-btn--secondary" disabled>
                  Магия восстанавливается (ещё {cooldownDaysLeft} дн.)
                </button>
              ) : streakInfo.isLost ? (
                <button
                  className="pt-btn pt-secret-btn"
                  onClick={onRestoreStreak}
                >
                  ✨ Спасти стрик (отметить вчера)
                </button>
              ) : (
                <button className="pt-btn pt-btn--secondary" disabled>
                  Твой стрик в порядке, спасать нечего! 😎
                </button>
              )}
            </div>

            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setIsSettingsOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {isAchievModalOpen && (
        <div className="pt-overlay" onClick={() => setIsAchievModalOpen(false)}>
          <div
            className="pt-modal pt-modal--achievs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">Достижения</h3>
            <div className="pt-achievs-progress-container">
              <p className="pt-achievs-progress-text">
                Разблокировано {unlockedAchievements.length} из{" "}
                {ACHIEVEMENTS.length}
              </p>
              <div className="pt-achievs-progress-bar">
                <div
                  className="pt-achievs-progress-fill"
                  style={{
                    width: `${(unlockedAchievements.length / ACHIEVEMENTS.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-achievements-list">
              {ACHIEVEMENTS.map((ach) => {
                const isUnlocked = unlockedAchievements.includes(ach.id);
                const isPinned = featuredAchievementId === ach.id;

                return (
                  <div
                    key={ach.id}
                    className={`pt-achiev-card ${isUnlocked ? "unlocked" : "locked"}`}
                  >
                    <div className="pt-achiev-card__icon">
                      {isUnlocked ? ach.icon : "🔒"}
                    </div>
                    <div className="pt-achiev-card__info">
                      <div className="pt-achiev-card__status">
                        {isUnlocked ? "Выполнено!" : "Заблокировано"}
                      </div>
                      <h4 className="pt-achiev-card__name">
                        {isUnlocked ? ach.name : "???"}
                      </h4>
                      <p className="pt-achiev-card__desc">{ach.desc}</p>
                    </div>

                    {isUnlocked && (
                      <button
                        type="button"
                        className={`pt-pin-btn ${isPinned ? "pinned" : ""}`}
                        onClick={() => handleToggleFeatured(ach.id)}
                        title={
                          isPinned
                            ? "Открепить от профиля"
                            : "Закрепить в профиле"
                        }
                      >
                        📌
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setIsAchievModalOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
