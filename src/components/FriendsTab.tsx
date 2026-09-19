import { useState, useEffect, useMemo } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const STATUS_EMOJI: Record<string, string> = {
  cancel: "❌",
  sad: "😢",
  neutral: "😐",
  happy: "😊",
};

interface FriendProfile {
  uid: string;
  nickname: string;
  avatar?: string;
  bio?: string;
}

interface FriendsTabProps {
  currentUser: User;
}

export function FriendsTab({ currentUser }: FriendsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<FriendProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(
    null,
  );
  const [friendRecords, setFriendRecords] = useState<
    Record<string, { status: string }>
  >({});
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [currentUserAvatar, setCurrentUserAvatar] = useState("👑");

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentAvatar() {
      try {
        const uSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (uSnap.exists() && isMounted) {
          setCurrentUserAvatar(uSnap.data().avatar || "👑");
        }
      } catch (e) {
        console.error("Ошибка загрузки аватарки пользователя:", e);
      }
    }

    loadCurrentAvatar();

    return () => {
      isMounted = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    let isMounted = true;

    async function fetchFriends() {
      try {
        const snap = await getDocs(
          collection(db, "users", currentUser.uid, "friends"),
        );
        const list: FriendProfile[] = [];
        for (const d of snap.docs) {
          const uSnap = await getDoc(doc(db, "users", d.id));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            list.push({
              uid: d.id,
              nickname: uData.nickname,
              avatar: uData.avatar || "👑",
              bio: uData.bio,
            });
          }
        }
        if (isMounted) {
          setFriends(list);
        }
      } catch (e) {
        console.error("Ошибка загрузки друзей:", e);
      }
    }

    fetchFriends();

    return () => {
      isMounted = false;
    };
  }, [currentUser.uid]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().toLowerCase().replace(/^@/, "");
    if (!clean) return;

    if (clean === (currentUser.displayName || "").toLowerCase()) {
      setSearchError("Это твой собственный никнейм");
      setSearchResult(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    setRequestSent(false);

    try {
      const uSnap = await getDoc(doc(db, "usernames", clean));
      if (!uSnap.exists()) {
        setSearchError("Пользователь с таким ником не найден");
      } else {
        const targetUid = uSnap.data().uid;
        const profileSnap = await getDoc(doc(db, "users", targetUid));
        if (profileSnap.exists()) {
          const pData = profileSnap.data();
          setSearchResult({
            uid: targetUid,
            nickname: pData.nickname,
            avatar: pData.avatar || "👑",
            bio: pData.bio,
          });
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Ошибка поиска";
      setSearchError(errorMsg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (targetUser: FriendProfile) => {
    const timestamp = new Date().getTime();
    try {
      await setDoc(
        doc(db, "users", targetUser.uid, "friend_requests", currentUser.uid),
        {
          fromUid: currentUser.uid,
          fromNickname: currentUser.displayName || "user",
          fromAvatar: currentUserAvatar,
          createdAt: timestamp,
          status: "pending",
        },
      );
      setRequestSent(true);
    } catch (e) {
      console.error("Ошибка отправки заявки:", e);
    }
  };

  const handleOpenFriend = async (friend: FriendProfile) => {
    setSelectedFriend(friend);
    try {
      const recordsSnap = await getDoc(
        doc(db, "users", friend.uid, "tracker", "records"),
      );
      if (recordsSnap.exists()) {
        setFriendRecords(
          recordsSnap.data() as Record<string, { status: string }>,
        );
      } else {
        setFriendRecords({});
      }
    } catch (e) {
      console.error("Ошибка загрузки календаря:", e);
    }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    if (!window.confirm("Точно хочешь удалить из друзей?")) return;

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "friends", friendUid));
      await deleteDoc(doc(db, "users", friendUid, "friends", currentUser.uid));

      setFriends((prev) => prev.filter((f) => f.uid !== friendUid));
      setSelectedFriend(null);
    } catch (e) {
      console.error("Ошибка при удалении из друзей:", e);
    }
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [year, month]);

  return (
    <div className="pt-app">
      {selectedFriend ? (
        <div className="pt-card pt-friend-view">
          <div className="pt-friend-view-nav">
            <button
              className="pt-back-btn"
              onClick={() => setSelectedFriend(null)}
            >
              ← Назад
            </button>
            <button
              className="pt-remove-friend-btn"
              onClick={() => handleRemoveFriend(selectedFriend.uid)}
            >
              Удалить
            </button>
          </div>

          <div className="pt-friend-header">
            <div className="pt-profile-avatar">
              {selectedFriend.avatar || "👑"}
            </div>
            <h2 className="pt-profile-name">@{selectedFriend.nickname}</h2>
            {selectedFriend.bio && (
              <p className="pt-bio-text">«{selectedFriend.bio}»</p>
            )}
          </div>

          <div className="cal-header">
            <button
              className="cal-nav"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
            >
              ‹
            </button>
            <h2 className="cal-title">
              {MONTHS[month]} {year}
            </h2>
            <button
              className="cal-nav"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className="cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((day, idx) => {
              if (day === null) {
                return (
                  <div key={`e-${idx}`} className="cal-cell cal-cell--empty" />
                );
              }
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const rec = friendRecords[key];

              return (
                <div
                  key={key}
                  className={`cal-cell cal-cell--display ${rec?.status ? `cal-cell--${rec.status}` : ""}`}
                >
                  <span className="cal-cell__day">{day}</span>
                  {rec?.status && (
                    <span className="cal-cell__emoji">
                      {STATUS_EMOJI[rec.status]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="pt-card">
            <h3 className="pt-friends-title">Поиск друзей</h3>
            <form onSubmit={handleSearch} className="pt-friends-search-form">
              <input
                type="text"
                className="pt-input pt-friends-input"
                placeholder="Введи @никнейм..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoCapitalize="none"
              />
              <button
                type="submit"
                className="pt-btn pt-btn--primary"
                disabled={isSearching}
              >
                Найти
              </button>
            </form>

            {searchError && <div className="pt-auth-error">{searchError}</div>}

            {searchResult && (
              <div className="pt-search-result-card">
                <div className="pt-friend-info">
                  <span className="pt-friend-avatar">
                    {searchResult.avatar || "👑"}
                  </span>
                  <div>
                    <strong>@{searchResult.nickname}</strong>
                    {searchResult.bio && (
                      <p className="pt-search-bio">«{searchResult.bio}»</p>
                    )}
                  </div>
                </div>

                {friends.some((f) => f.uid === searchResult.uid) ? (
                  <span className="pt-friend-badge">Уже в друзьях</span>
                ) : requestSent ? (
                  <span className="pt-friend-badge">Запрос отправлен</span>
                ) : (
                  <button
                    className="pt-btn pt-btn--primary pt-btn--compact"
                    onClick={() => handleSendRequest(searchResult)}
                  >
                    Добавить
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pt-card">
            <h3 className="pt-friends-title">Мои друзья ({friends.length})</h3>
            {friends.length === 0 ? (
              <p className="pt-empty-friends">
                У тебя пока нет друзей. Найди их через поиск выше!
              </p>
            ) : (
              <div className="pt-friends-list">
                {friends.map((f) => (
                  <div
                    key={f.uid}
                    className="pt-friend-row"
                    onClick={() => handleOpenFriend(f)}
                  >
                    <div className="pt-friend-info">
                      <span className="pt-friend-avatar">
                        {f.avatar || "👑"}
                      </span>
                      <div>
                        <strong>@{f.nickname}</strong>
                        {f.bio && <p className="pt-friend-sub">{f.bio}</p>}
                      </div>
                    </div>
                    <span className="pt-profile-menu-arrow">›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
