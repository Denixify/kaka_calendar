import { useState, useEffect, useMemo } from "react";
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
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { Records } from "./PoopTracker";

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

const ACHIEVEMENTS = [
  {
    id: "streak_1",
    name: "Первая кровь... тьфу, стул",
    desc: "Сделай стрик 1 день",
    icon: "🔥",
  },
  {
    id: "streak_2",
    name: "Уверенный шаг",
    desc: "Сделай стрик 2 дня",
    icon: "🔥",
  },
  {
    id: "streak_3",
    name: "Вошел во вкус",
    desc: "Сделай стрик 3 дня",
    icon: "🔥",
  },
  {
    id: "streak_4",
    name: "Стабильность — признак мастерства",
    desc: "Сделай стрик 4 дня",
    icon: "🔥",
  },
  {
    id: "streak_5",
    name: "Пятидневный марафон",
    desc: "Сделай стрик 5 дней",
    icon: "🔥",
  },
  {
    id: "streak_6",
    name: "Почти идеал",
    desc: "Сделай стрик 6 дней",
    icon: "🔥",
  },
  {
    id: "streak_7",
    name: "Король Унитаза",
    desc: "Закрой полный стрик из 7 дней",
    icon: "👑",
  },
  {
    id: "lost_streak",
    name: "Потрачено",
    desc: "Обидно потеряй стрик",
    icon: "💀",
  },
  {
    id: "magic_restore",
    name: "Магия вне Хогвартса",
    desc: "Воспользуйся секретной кнопкой восстановления стрика",
    icon: "🪄",
  },
  {
    id: "machine_gun",
    name: "Пулемёт",
    desc: "Сходи в туалет больше 1 раза за день",
    icon: "🚀",
  },
  {
    id: "liquid_gold",
    name: "Дал жиденького",
    desc: "Выбери вариант качества «Понос»",
    icon: "💦",
  },
  {
    id: "fatality",
    name: "Fatality!",
    desc: "Схватка была напряженной... Выбери вариант качества «Твердый»",
    icon: "🧱",
  },
  {
    id: "perfect_soft",
    name: "Мягкая посадка",
    desc: "Идеальный баланс. Выбери вариант качества «Мягкий»",
    icon: "☁️",
  },
  {
    id: "schrodinger",
    name: "Стул Шрёдингера",
    desc: "Он как бы есть, но какой он — загадка... Выбери качество «Неопределенный»",
    icon: "📦",
  },
  {
    id: "stranger_things",
    name: "Плохой день",
    desc: "Сегодня обойдемся без смеха... Отметь «Без походов»",
    icon: "😭",
  },
  {
    id: "soup_time",
    name: "Нужно покушать супчика",
    desc: "Надеюсь, в следующий раз будет лучше... Отметь плохой поход (😢)",
    icon: "🥣",
  },
  {
    id: "not_great_not_terrible",
    name: "Полёт нормальный",
    desc: "Не отлично, но и не ужасно. Отметь статус «Нормально» (😐)",
    icon: "👌",
  },
  {
    id: "chamber_of_secrets",
    name: "Самый лучший день!",
    desc: "Это было настолько хорошо, что я тебе прям завидую... Отметь статус «Отлично» (😊)",
    icon: "😎",
  },
  {
    id: "friend_1",
    name: "Первый свидетель",
    desc: "Теперь тебе есть с кем обсудить утренний кофе. Добавь своего первого друга",
    icon: "👀",
  },
  {
    id: "friend_2",
    name: "Сообразим на троих?",
    desc: "Собери 2 друзей в свою ленту. (Ведь третий — это ты!)",
    icon: "🍻",
  },
  {
    id: "friend_3",
    name: "Кружок по интересам",
    desc: "Пора создавать тематический групповой чат. Собери 3 друзей",
    icon: "🤝",
  },
  {
    id: "friend_4",
    name: "Четыре всадника",
    desc: "Кажется, Апокалипсис уже близко! Добавь 4 друзей",
    icon: "🐎",
  },
  {
    id: "friend_5",
    name: "Лидер мнений",
    desc: "Настоящий кака-блогер, пора продавать рекламу! Собери 5 друзей",
    icon: "🌟",
  },
];

const BASE = import.meta.env.BASE_URL;

interface FriendRequest {
  fromUid: string;
  fromNickname: string;
  fromAvatar?: string;
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
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("👑");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAchievModalOpen, setIsAchievModalOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  const [soundPref, setSoundPref] = useState<string>(
    () => localStorage.getItem("pt-sound-pref") || "metalpipe.mp3",
  );

  const [nowTime] = useState(() => new Date().getTime());

  useEffect(() => {
    if (
      isSettingsOpen ||
      isAchievModalOpen ||
      isRequestsOpen ||
      isAvatarModalOpen
    ) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isSettingsOpen, isAchievModalOpen, isRequestsOpen, isAvatarModalOpen]);

  useEffect(() => {
    let isMounted = true;

    async function loadUserProfile() {
      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists() && isMounted) {
          const data = userSnap.data();
          if (data.bio) {
            setBio(data.bio);
            setBioDraft(data.bio);
          }
          if (data.avatar) {
            setAvatar(data.avatar);
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

  const handleSelectAvatar = async (selectedEmoji: string) => {
    setAvatar(selectedEmoji);
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
    setIsSavingBio(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        bio: bioDraft.trim(),
      });
      setBio(bioDraft.trim());
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

    return { streak: Math.min(streak, 7), isLost: false, isBeginner };
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
