import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  increment,
} from "firebase/firestore";
import { db } from "../firebase";
import { ACHIEVEMENTS_MAP, GIFTS_MAP } from "../constants/achievements";
import { FlappyPoop } from "./games/FlappyPoop";
import { DoodleTurd } from "./games/DoodleTurd";

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
  neutral: "😁",
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
  featuredAchievementId?: string | null;
  flappyHighScore?: number;
  doodleHighScore?: number;
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
  read?: boolean;
  type?: "text" | "duel_invite" | "gift" | "game_challenge";
  duelId?: string;
  duelStatus?: "pending" | "active" | "declined" | "finished";
  giftId?: string;
  gameType?: "flappy" | "doodle";
  gameScore?: number;
}

interface ReceivedGift {
  id: string;
  fromUid: string;
  fromNickname: string;
  giftId: string;
  createdAt: number;
}

interface FriendsTabProps {
  currentUser: User;
}

interface ActiveDuelCardProps {
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

function DuelCardView({
  duelId,
  currentUserId,
  partnerNickname,
}: ActiveDuelCardProps) {
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [now, setNow] = useState(() => new Date().getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date().getTime());
    }, 60000);

    const unsub = onSnapshot(doc(db, "duels", duelId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as DuelData;
        setDuel(data);

        const currentTimestamp = new Date().getTime();

        if (data.status === "active" && currentTimestamp >= data.endDate) {
          const p1 = data.player1;
          const p2 = data.player2;
          const s1 = data.scores?.[p1] || 0;
          const s2 = data.scores?.[p2] || 0;
          let winner: string | null = null;
          if (s1 > s2) winner = p1;
          else if (s2 > s1) winner = p2;

          updateDoc(doc(db, "duels", duelId), {
            status: "finished",
            winnerId: winner,
          }).catch(() => {});

          if (winner) {
            getDoc(doc(db, "users", winner)).then((uSnap) => {
              const currentWins = uSnap.data()?.duelWins || 0;
              updateDoc(doc(db, "users", winner), {
                duelWins: currentWins + 1,
                balance: increment(10),
              }).catch(() => {});
            });
          }
        }
      }
    });

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [duelId]);

  const handleSurrender = async () => {
    if (!duel || duel.status !== "active") return;
    const isConfirmed = window.confirm(
      `Точно хочешь сдаться? Победа автоматически достанется @${partnerNickname}!`,
    );
    if (!isConfirmed) return;

    const winner = duel.player1 === currentUserId ? duel.player2 : duel.player1;

    try {
      await updateDoc(doc(db, "duels", duelId), {
        status: "finished",
        winnerId: winner,
        surrenderedBy: currentUserId,
      });

      const uSnap = await getDoc(doc(db, "users", winner));
      const currentWins = uSnap.data()?.duelWins || 0;
      await updateDoc(doc(db, "users", winner), {
        duelWins: currentWins + 1,
      });
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
        ⏳ Осталось {daysLeft}{" "}
        {daysLeft === 1 ? "день" : daysLeft < 5 ? "дня" : "дней"}
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

export function FriendsTab({ currentUser }: FriendsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<FriendProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const [friends, setFriends] = useState<FriendProfile[]>(() => {
    try {
      const cached = localStorage.getItem(
        `pt-friends-cache-${currentUser.uid}`,
      );
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(
    null,
  );
  const [friendRecords, setFriendRecords] = useState<
    Record<string, { status: string }>
  >({});
  const [viewDate, setViewDate] = useState<Date>(new Date());

  const [currentUserAvatar, setCurrentUserAvatar] = useState(() => {
    return localStorage.getItem(`pt-avatar-cache-${currentUser.uid}`) || "👑";
  });
  const [myFlappyScore, setMyFlappyScore] = useState(0);
  const [myDoodleScore, setMyDoodleScore] = useState(0);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [comments, setComments] = useState<DayComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");

  const [chatPartner, setChatPartner] = useState<FriendProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [unreadFriendUids, setUnreadFriendUids] = useState<string[]>([]);
  const [pendingDuelFriendUids, setPendingDuelFriendUids] = useState<string[]>(
    [],
  );

  const [activeGame, setActiveGame] = useState<"flappy" | "doodle" | null>(
    null,
  );

  const [isGiftPickerOpen, setIsGiftPickerOpen] = useState(false);
  const [friendGifts, setFriendGifts] = useState<ReceivedGift[]>([]);

  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentUserAvatar(data.avatar || "👑");
        setMyFlappyScore(data.flappyHighScore || 0);
        setMyDoodleScore(data.doodleHighScore || 0);
        if (data.balance !== undefined) setBalance(data.balance);
      }
    });
    return () => unsub();
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
              featuredAchievementId: uData.featuredAchievementId || null,
              flappyHighScore: uData.flappyHighScore || 0,
              doodleHighScore: uData.doodleHighScore || 0,
            });
          }
        }
        if (isMounted) {
          setFriends(list);
          localStorage.setItem(
            `pt-friends-cache-${currentUser.uid}`,
            JSON.stringify(list),
          );
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

  useEffect(() => {
    if (friends.length === 0) return;

    const unsubscribes: (() => void)[] = [];
    const unreadMap: Record<string, boolean> = {};
    const duelMap: Record<string, boolean> = {};

    friends.forEach((friend) => {
      const chatId = [currentUser.uid, friend.uid].sort().join("_");
      const msgRef = collection(db, "chats", chatId, "messages");
      const q = query(msgRef, where("senderUid", "==", friend.uid));

      const unsub = onSnapshot(q, (snap) => {
        unreadMap[friend.uid] = snap.docs.some(
          (d) => d.data().read === false && d.data().type !== "duel_invite",
        );
        duelMap[friend.uid] = snap.docs.some(
          (d) =>
            d.data().type === "duel_invite" &&
            d.data().duelStatus === "pending",
        );

        setUnreadFriendUids(
          Object.keys(unreadMap).filter((uid) => unreadMap[uid]),
        );
        setPendingDuelFriendUids(
          Object.keys(duelMap).filter((uid) => duelMap[uid]),
        );
      });

      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach((fn) => fn());
      setUnreadFriendUids([]);
      setPendingDuelFriendUids([]);
    };
  }, [friends, currentUser.uid]);

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
    if (!selectedFriend) return;

    const unsubGifts = onSnapshot(
      collection(db, "users", selectedFriend.uid, "gifts_received"),
      (snap) => {
        setFriendGifts(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as ReceivedGift)
            .sort((a, b) => b.createdAt - a.createdAt),
        );
      },
    );

    return () => unsubGifts();
  }, [selectedFriend]);

  useEffect(() => {
    if (!chatPartner) return;

    const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
    const msgRef = collection(db, "chats", chatId, "messages");
    const q = query(msgRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<ChatMessage, "id">;
        if (data.senderUid === chatPartner.uid && data.read === false) {
          updateDoc(doc(db, "chats", chatId, "messages", d.id), {
            read: true,
          }).catch(() => {});
        }
        return { id: d.id, ...data };
      });
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

  useEffect(() => {
    if (chatPartner) {
      document.body.classList.add("chat-is-open");
    } else {
      document.body.classList.remove("chat-is-open");
    }
    return () => document.body.classList.remove("chat-is-open");
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
            featuredAchievementId: pData.featuredAchievementId || null,
            flappyHighScore: pData.flappyHighScore || 0,
            doodleHighScore: pData.doodleHighScore || 0,
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
    const timestamp = Date.now();
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
        read: false,
      });
      setNewMessage("");
    } catch (e) {
      console.error("Ошибка отправки сообщения:", e);
    }
  };

  const handleSendGift = useCallback(
    async (giftId: string) => {
      if (!chatPartner) return;

      const gift = GIFTS_MAP[giftId];
      if (balance < gift.price) {
        alert(
          `Нужно больше золота! Не хватает Смыв-коинов (цена: ${gift.price} 🪙).`,
        );
        return;
      }

      setIsGiftPickerOpen(false);
      const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
      const timestamp = new Date().getTime();

      try {
        setBalance((prev) => prev - gift.price);

        await updateDoc(doc(db, "users", currentUser.uid), {
          balance: increment(-gift.price),
        });

        await addDoc(collection(db, "chats", chatId, "messages"), {
          senderUid: currentUser.uid,
          text: `Отправил(а) подарок!`,
          type: "gift",
          giftId: giftId,
          createdAt: timestamp,
          read: false,
        });
        await addDoc(
          collection(db, "users", chatPartner.uid, "gifts_received"),
          {
            fromUid: currentUser.uid,
            fromNickname: currentUser.displayName || "user",
            giftId: giftId,
            createdAt: timestamp,
          },
        );
      } catch (e) {
        console.error("Ошибка при отправке подарка:", e);
      }
    },
    [chatPartner, currentUser, balance],
  );

  const handleSendDuelInvite = useCallback(
    async (friend: FriendProfile) => {
      try {
        const q1 = query(
          collection(db, "duels"),
          where("player1", "==", currentUser.uid),
          where("player2", "==", friend.uid),
          where("status", "in", ["pending", "active"]),
        );
        const q2 = query(
          collection(db, "duels"),
          where("player1", "==", friend.uid),
          where("player2", "==", currentUser.uid),
          where("status", "in", ["pending", "active"]),
        );

        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        if (!s1.empty || !s2.empty) {
          alert(
            `У вас уже есть активная дуэль или ожидающий ответ вызов с @${friend.nickname}!`,
          );
          return;
        }

        const isConfirmed = window.confirm(
          `Бросить вызов @${friend.nickname} на 7-дневную дуэль?`,
        );
        if (!isConfirmed) return;

        const now = new Date().getTime();

        const duelRef = doc(collection(db, "duels"));
        await setDoc(duelRef, {
          player1: currentUser.uid,
          player2: friend.uid,
          status: "pending",
          createdAt: now,
          scores: {
            [currentUser.uid]: 0,
            [friend.uid]: 0,
          },
        });

        const chatId = [currentUser.uid, friend.uid].sort().join("_");
        const msgRef = collection(db, "chats", chatId, "messages");

        await addDoc(msgRef, {
          senderUid: currentUser.uid,
          text: "Я вызываю тебя на дуэль!",
          createdAt: now,
          read: false,
          type: "duel_invite",
          duelId: duelRef.id,
          duelStatus: "pending",
        });

        setSelectedFriend(null);
        setChatPartner(friend);
      } catch (e) {
        console.error("Ошибка при создании дуэли:", e);
      }
    },
    [currentUser.uid],
  );

  const handleSendGameChallenge = async (
    gameType: "flappy" | "doodle",
    score: number,
  ) => {
    if (!selectedFriend) return;
    const gameName = gameType === "flappy" ? "Flappy Poop" : "Doodle Turd";
    try {
      await addDoc(
        collection(
          db,
          "chats",
          [currentUser.uid, selectedFriend.uid].sort().join("_"),
          "messages",
        ),
        {
          senderUid: currentUser.uid,
          text: `Я набрал ${score} очков в ${gameName}! Сможешь побить мой рекорд?`,
          type: "game_challenge",
          gameType: gameType,
          gameScore: score,
          createdAt: Date.now(),
          read: false,
        },
      );
      setChatPartner(selectedFriend);
      setSelectedFriend(null);
    } catch (e) {
      console.error("Ошибка вызова на игру:", e);
    }
  };

  const handleAcceptDuel = useCallback(
    async (messageId: string, duelId: string) => {
      if (!chatPartner) return;
      const now = new Date().getTime();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      try {
        const duelRef = doc(db, "duels", duelId);
        await updateDoc(duelRef, {
          status: "active",
          startDate: now,
          endDate: now + oneWeek,
        });

        const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
        await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
          duelStatus: "active",
        });
      } catch (e) {
        console.error("Ошибка при принятии дуэли:", e);
      }
    },
    [chatPartner, currentUser.uid],
  );

  const handleDeclineDuel = useCallback(
    async (messageId: string, duelId: string) => {
      if (!chatPartner) return;

      try {
        const duelRef = doc(db, "duels", duelId);
        await updateDoc(duelRef, { status: "declined" });

        const chatId = [currentUser.uid, chatPartner.uid].sort().join("_");
        await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
          duelStatus: "declined",
        });
      } catch (e) {
        console.error("Ошибка при отклонении дуэли:", e);
      }
    },
    [chatPartner, currentUser.uid],
  );

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
          <div className="pt-chat-nav-placeholder" />
        </div>

        <div className="pt-chat-messages">
          {messages.length === 0 ? (
            <p className="pt-empty-comments">Напиши первое сообщение!</p>
          ) : (
            messages.map((m) => {
              const isMe = m.senderUid === currentUser.uid;

              if (m.type === "gift" && m.giftId && GIFTS_MAP[m.giftId]) {
                const gift = GIFTS_MAP[m.giftId];
                return (
                  <div
                    key={m.id}
                    className={`pt-chat-bubble ${isMe ? "me" : "them"}`}
                  >
                    <div className="pt-chat-bubble-content--gift">
                      <div className="pt-chat-bubble-gift-icon">
                        {gift.icon}
                      </div>
                      <h4 className="pt-chat-bubble-gift-title">{gift.name}</h4>
                      <p className="pt-chat-bubble-gift-sub">
                        {isMe
                          ? "Ты отправил(а) подарок!"
                          : "Тебе прислали подарок!"}
                      </p>
                      <span className="pt-chat-time pt-chat-time--right">
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              }

              if (m.type === "game_challenge") {
                const gameName =
                  m.gameType === "flappy" ? "Flappy Poop" : "Doodle Turd";
                const icon = m.gameType === "flappy" ? "💩💨" : "🧻⬆️";
                return (
                  <div
                    key={m.id}
                    className={`pt-chat-bubble pt-duel-invite ${isMe ? "me" : "them"}`}
                  >
                    <h4 className="pt-duel-title">
                      {icon} Вызов в {gameName}!
                    </h4>
                    <p className="pt-duel-challenge-text">
                      {isMe
                        ? `Ты бросил вызов с рекордом: ${m.gameScore}`
                        : `@${chatPartner.nickname} бросает вызов с рекордом: ${m.gameScore}!`}
                    </p>
                    <button
                      className="pt-btn pt-btn--primary pt-btn--compact"
                      onClick={() => setActiveGame(m.gameType!)}
                    >
                      Играть
                    </button>
                    <span className="pt-chat-time">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              }

              if (m.type === "duel_invite") {
                if (m.duelStatus === "declined") {
                  return (
                    <div
                      key={m.id}
                      className={`pt-chat-bubble pt-duel-invite declined ${isMe ? "me" : "them"}`}
                    >
                      <h4 className="pt-duel-title">Вызов отклонен ❌</h4>
                      <p className="pt-duel-declined-text">
                        {isMe
                          ? `@${chatPartner.nickname} струсил(а) и отказался от дуэли.`
                          : `Ты отказался от дуэли.`}
                      </p>
                    </div>
                  );
                }

                if (m.duelStatus === "active") {
                  return (
                    <div
                      key={m.id}
                      className={`pt-chat-bubble pt-duel-invite active ${isMe ? "me" : "them"}`}
                    >
                      <h4 className="pt-duel-title">⚔️ Идет битва!</h4>
                      <DuelCardView
                        duelId={m.duelId!}
                        currentUserId={currentUser.uid}
                        partnerNickname={chatPartner.nickname}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    className={`pt-chat-bubble pt-duel-invite ${isMe ? "me" : "them"}`}
                  >
                    <h4 className="pt-duel-title">⚔️ Вызов на дуэль!</h4>
                    <p className="pt-duel-disclaimer">
                      Наше приложение не умеет определять качество похода в
                      туалет с помощью ИИ, так что надеемся на Вашу честность.
                    </p>

                    {!isMe ? (
                      <div className="pt-duel-actions">
                        <button
                          className="pt-btn pt-btn--primary pt-btn--compact"
                          onClick={() => handleAcceptDuel(m.id, m.duelId!)}
                        >
                          Принять
                        </button>
                        <button
                          className="pt-btn pt-btn--secondary pt-btn--compact pt-btn--danger-text"
                          onClick={() => handleDeclineDuel(m.id, m.duelId!)}
                        >
                          Отказаться
                        </button>
                      </div>
                    ) : (
                      <div className="pt-duel-waiting">
                        ⏳ Ожидаем ответа соперника...
                      </div>
                    )}
                    <span className="pt-chat-time">
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              }

              return (
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
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSendMessage}
          className="pt-chat-form pt-chat-form-wrap"
        >
          <button
            type="button"
            className="pt-btn pt-btn--secondary pt-btn--compact pt-chat-gift-btn"
            onClick={() => setIsGiftPickerOpen(true)}
          >
            🎁
          </button>
          <input
            type="text"
            placeholder="Сообщение..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="pt-chat-input pt-chat-input--flex"
          />
          <button
            type="submit"
            className="pt-comment-send-btn"
            disabled={!newMessage.trim()}
          >
            ➤
          </button>
        </form>

        {isGiftPickerOpen && (
          <div
            className="pt-overlay"
            onClick={() => setIsGiftPickerOpen(false)}
          >
            <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pt-modal__handle" />
              <h3 className="pt-modal__title">
                Магазин (Баланс: {balance} 🪙)
              </h3>
              <div className="pt-avatar-picker-grid">
                {Object.entries(GIFTS_MAP).map(([id, gift]) => {
                  const canAfford = balance >= gift.price;
                  return (
                    <button
                      key={id}
                      className={`pt-avatar-picker-item pt-gift-picker-item ${!canAfford ? "pt-gift-picker-item--disabled" : ""}`}
                      onClick={() =>
                        canAfford
                          ? handleSendGift(id)
                          : alert("Иди зарабатывай Смыв-коины! 🪙")
                      }
                    >
                      <span className="pt-gift-picker-icon">{gift.icon}</span>
                      <span className="pt-gift-picker-name">{gift.name}</span>
                      <span
                        className={`pt-gift-picker-price ${canAfford ? "pt-gift-picker-price--ok" : "pt-gift-picker-price--no"}`}
                      >
                        {gift.price} 🪙
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="pt-modal__actions">
                <button
                  className="pt-modal__close"
                  onClick={() => setIsGiftPickerOpen(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {activeGame === "flappy" && (
          <div className="pt-chat-fullscreen pt-chat-fullscreen--game">
            <FlappyPoop
              userId={currentUser.uid}
              highScore={myFlappyScore}
              onClose={() => setActiveGame(null)}
            />
          </div>
        )}
        {activeGame === "doodle" && (
          <div className="pt-chat-fullscreen pt-chat-fullscreen--game">
            <DoodleTurd
              userId={currentUser.uid}
              highScore={myDoodleScore}
              onClose={() => setActiveGame(null)}
            />
          </div>
        )}
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

            {selectedFriend.featuredAchievementId &&
              ACHIEVEMENTS_MAP[selectedFriend.featuredAchievementId] && (
                <div className="pt-featured-badge">
                  <span className="pt-featured-badge__icon">
                    {
                      ACHIEVEMENTS_MAP[selectedFriend.featuredAchievementId]
                        .icon
                    }
                  </span>
                  <span className="pt-featured-badge__title">
                    {
                      ACHIEVEMENTS_MAP[selectedFriend.featuredAchievementId]
                        .name
                    }
                  </span>
                </div>
              )}

            {friendGifts.length > 0 && (
              <div className="pt-settings-section pt-game-zone-section">
                <h4>Подарки ({friendGifts.length}) 🎁</h4>
                <div className="pt-gifts-grid">
                  {friendGifts.map((g) => (
                    <div key={g.id} className="pt-gift-item">
                      <span className="pt-gift-icon">
                        {GIFTS_MAP[g.giftId]?.icon || "🎁"}
                      </span>
                      <div className="pt-gift-info">
                        <span className="pt-gift-name">
                          {GIFTS_MAP[g.giftId]?.name || "Подарок"}
                        </span>
                        <span className="pt-gift-sender">
                          от @{g.fromNickname}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-settings-section pt-game-zone-section">
              <h4>Рекорды в играх 🎮</h4>
              <div className="pt-game-cards-wrap pt-game-cards-wrap--friend">
                <div className="pt-game-card pt-game-card--compact">
                  <div className="pt-game-icon pt-game-icon--compact">💩💨</div>
                  <h4 className="pt-game-title pt-game-title--compact">
                    Flappy Poop
                  </h4>
                  <div className="pt-game-score-record">
                    Топ: {selectedFriend.flappyHighScore || 0}
                  </div>
                  <button
                    className="pt-btn pt-btn--primary pt-btn--compact"
                    onClick={() =>
                      handleSendGameChallenge("flappy", myFlappyScore)
                    }
                  >
                    Вызов ({myFlappyScore})
                  </button>
                </div>
                <div className="pt-game-card pt-game-card--compact">
                  <div className="pt-game-icon pt-game-icon--compact">🧻⬆️</div>
                  <h4 className="pt-game-title pt-game-title--compact">
                    Doodle Turd
                  </h4>
                  <div className="pt-game-score-record">
                    Топ: {selectedFriend.doodleHighScore || 0}
                  </div>
                  <button
                    className="pt-btn pt-btn--primary pt-btn--compact pt-btn--gradient"
                    onClick={() =>
                      handleSendGameChallenge("doodle", myDoodleScore)
                    }
                  >
                    Вызов ({myDoodleScore})
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-friend-actions-row">
              <button
                className="pt-btn pt-btn--primary pt-btn--compact"
                onClick={() => setChatPartner(selectedFriend)}
              >
                💬 Чат
              </button>
              <button
                className="pt-btn pt-btn--secondary pt-btn--compact pt-btn--duel"
                onClick={() => handleSendDuelInvite(selectedFriend)}
              >
                ⚔️ Вызвать на дуэль
              </button>
            </div>
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
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
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
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (!val.trim()) {
                    setSearchResult(null);
                    setSearchError(null);
                    setRequestSent(false);
                  }
                }}
                autoCapitalize="none"
              />
              <button
                type="submit"
                className="pt-btn pt-btn--primary pt-search-btn"
                disabled={isSearching}
              >
                {isSearching ? <span className="pt-spinner" /> : "Найти"}
              </button>
            </form>

            {searchError && <div className="pt-auth-error">{searchError}</div>}

            {searchResult && (
              <div className="pt-search-result-card">
                <div className="pt-friend-info">
                  <span className="pt-friend-avatar">
                    {searchResult.avatar || "👑"}
                  </span>
                  <div className="pt-friend-text-meta">
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
                    type="button"
                    className="pt-btn pt-btn--primary pt-btn--compact pt-friend-add-btn"
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
                {friends.map((f) => {
                  const hasUnread = unreadFriendUids.includes(f.uid);
                  const hasPendingDuel = pendingDuelFriendUids.includes(f.uid);

                  return (
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
                      <div className="pt-friend-actions pt-friend-actions-group">
                        <button
                          className="pt-quick-chat-btn"
                          title="Вызвать на дуэль"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendDuelInvite(f);
                          }}
                        >
                          ⚔️
                          {hasPendingDuel && (
                            <span className="pt-unread-dot pt-unread-dot--duel" />
                          )}
                        </button>
                        <button
                          className="pt-quick-chat-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFriend(null);
                            setChatPartner(f);
                          }}
                        >
                          💬
                          {hasUnread && <span className="pt-unread-dot" />}
                        </button>
                        <span className="pt-profile-menu-arrow">›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
