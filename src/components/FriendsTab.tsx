import { useState, useEffect, useMemo, useRef } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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

const STATUS_LABELS: Record<string, string> = {
  cancel: "Без походов",
  sad: "Плохо",
  neutral: "Нормально",
  happy: "Отлично",
};

interface FriendProfile {
  uid: string;
  nickname: string;
  avatar?: string;
  bio?: string;
}

export interface DayComment {
  id: string;
  authorUid: string;
  authorNickname: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
}

interface ChatMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: number;
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

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [comments, setComments] = useState<DayComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");

  const [chatPartner, setChatPartner] = useState<FriendProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        if (isMounted) setFriends(list);
      } catch (e) {
        console.error("Ошибка загрузки друзей:", e);
      }
    }
    fetchFriends();
    return () => {
      isMounted = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    if (!selectedFriend || !selectedDateKey) return;

    const commentsRef = collection(
      db,
      "users",
      selectedFriend.uid,
      "tracker_comments",
      selectedDateKey,
      "comments",
    );
    const q = query(commentsRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as DayComment,
      );
      setComments(list);
    });

    return () => {
      unsubscribe();
      setComments([]);
    };
  }, [selectedFriend, selectedDateKey]);

  useEffect(() => {
    if (!chatPartner) return;

    const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
    const msgRef = collection(db, "chats", chatId, "messages");
    const q = query(msgRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ChatMessage,
      );
      setMessages(list);
    });

    return () => {
      unsubscribe();
      setMessages([]);
    };
  }, [chatPartner, currentUser.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Идеальный контроль клавиатуры для iOS (Visual Viewport)
  useEffect(() => {
    if (!chatPartner) {
      document.body.classList.remove("chat-is-open");
      return;
    }

    document.body.classList.add("chat-is-open");

    const updateHeight = () => {
      const vh = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
      document.documentElement.style.setProperty("--chat-vh", `${vh}px`);
      window.scrollTo(0, 0);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    } else {
      window.addEventListener("resize", updateHeight);
    }

    updateHeight();

    return () => {
      document.body.classList.remove("chat-is-open");
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport.removeEventListener("scroll", updateHeight);
      } else {
        window.removeEventListener("resize", updateHeight);
      }
    };
  }, [chatPartner]);

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
    setSelectedDateKey(null);
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

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !selectedFriend || !selectedDateKey) return;
    try {
      const commentsRef = collection(
        db,
        "users",
        selectedFriend.uid,
        "tracker_comments",
        selectedDateKey,
        "comments",
      );
      await addDoc(commentsRef, {
        authorUid: currentUser.uid,
        authorNickname: currentUser.displayName || "user",
        authorAvatar: currentUserAvatar,
        text: newCommentText.trim(),
        createdAt: Date.now(),
      });
      setNewCommentText("");
    } catch (e) {
      console.error("Ошибка отправки комментария:", e);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedFriend || !selectedDateKey) return;
    if (!window.confirm("Удалить комментарий?")) return;
    try {
      await deleteDoc(
        doc(
          db,
          "users",
          selectedFriend.uid,
          "tracker_comments",
          selectedDateKey,
          "comments",
          commentId,
        ),
      );
    } catch (e) {
      console.error("Ошибка удаления комментария:", e);
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatPartner) return;

    const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
    const msgRef = collection(db, "chats", chatId, "messages");

    try {
      await addDoc(msgRef, {
        senderUid: currentUser.uid,
        text: newMessage.trim(),
        createdAt: Date.now(),
      });
      setNewMessage("");
    } catch (e) {
      console.error("Ошибка отправки сообщения:", e);
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

  if (chatPartner) {
    return (
      <div className="pt-chat-fullscreen">
        <div className="pt-chat-nav">
          <button className="pt-back-btn" onClick={() => setChatPartner(null)}>
            ← Назад
          </button>
          <div className="pt-chat-title">
            <span className="pt-chat-avatar">{chatPartner.avatar || "👑"}</span>
            <span>@{chatPartner.nickname}</span>
          </div>
          <div style={{ width: 60 }} />
        </div>

        <div className="pt-chat-messages">
          {messages.length === 0 ? (
            <p className="pt-empty-comments">Напиши первое сообщение!</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`pt-chat-bubble ${m.senderUid === currentUser.uid ? "me" : "them"}`}
              >
                <span>{m.text}</span>
                <span className="pt-chat-time">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="pt-chat-form">
          <input
            type="text"
            placeholder="Сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onFocus={() => {
              setTimeout(() => window.scrollTo(0, 0), 100);
            }}
            className="pt-chat-input"
          />
          <button
            type="submit"
            className="pt-comment-send-btn"
            disabled={!newMessage.trim()}
          >
            ➤
          </button>
        </form>
      </div>
    );
  }

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

            <button
              className="pt-btn pt-btn--primary pt-btn--compact"
              style={{
                margin: "16px auto 0",
                display: "inline-block",
                padding: "8px 20px",
              }}
              onClick={() => setChatPartner(selectedFriend)}
            >
              💬 Написать сообщение
            </button>
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
              const key = toDateKey(year, month, day);
              const rec = friendRecords[key];
              const isSelected = selectedDateKey === key;

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDateKey(key)}
                  className={[
                    "cal-cell cal-cell--display cal-cell--clickable",
                    rec?.status && `cal-cell--${rec.status}`,
                    isSelected && "cal-cell--selected-friend",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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

          {selectedDateKey && (
            <div className="pt-comments-section">
              <div className="pt-comments-header">
                <h4>
                  {selectedDateKey.split("-")[2]}{" "}
                  {MONTHS[parseInt(selectedDateKey.split("-")[1]) - 1]}
                </h4>
                {friendRecords[selectedDateKey]?.status ? (
                  <span className="pt-comments-status">
                    {STATUS_EMOJI[friendRecords[selectedDateKey].status]}{" "}
                    {STATUS_LABELS[friendRecords[selectedDateKey].status]}
                  </span>
                ) : (
                  <span className="pt-comments-status">Нет записей</span>
                )}
              </div>

              <div className="pt-comments-list">
                {comments.length === 0 ? (
                  <p className="pt-empty-comments">
                    Пока нет комментариев. Будь первым!
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="pt-comment-bubble">
                      <div className="pt-comment-avatar">
                        {comment.authorAvatar}
                      </div>
                      <div className="pt-comment-content">
                        <div className="pt-comment-top">
                          <strong>@{comment.authorNickname}</strong>
                          <span className="pt-comment-time">
                            {new Date(comment.createdAt).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                        </div>
                        <p>{comment.text}</p>
                      </div>
                      {comment.authorUid === currentUser.uid && (
                        <button
                          className="pt-comment-delete"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="pt-comment-form">
                <input
                  type="text"
                  placeholder="Написать комментарий..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="pt-input pt-comment-input"
                />
                <button
                  type="submit"
                  className="pt-comment-send-btn"
                  disabled={!newCommentText.trim()}
                >
                  ➤
                </button>
              </form>
            </div>
          )}
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
                    <div
                      className="pt-friend-actions"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <button
                        className="pt-quick-chat-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFriend(null);
                          setChatPartner(f);
                        }}
                      >
                        💬
                      </button>
                      <span className="pt-profile-menu-arrow">›</span>
                    </div>
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
