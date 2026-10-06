import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

interface ChatBadges {
  friendsCount: number;
  unreadFriendUids: string[];
  pendingDuelFriendUids: string[];
}

const EMPTY: ChatBadges = {
  friendsCount: 0,
  unreadFriendUids: [],
  pendingDuelFriendUids: [],
};

export function useChatBadges(uid: string | null): ChatBadges {
  const [friendsCount, setFriendsCount] = useState(0);
  const [unread, setUnread] = useState<string[]>([]);
  const [pendingDuels, setPendingDuels] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) return;

    let msgUnsubs: (() => void)[] = [];

    const unsubFriends = onSnapshot(
      collection(db, "users", uid, "friends"),
      (friendsSnap) => {
        msgUnsubs.forEach((fn) => fn());
        msgUnsubs = [];
        setFriendsCount(friendsSnap.size);

        const unreadMap: Record<string, boolean> = {};
        setUnread([]);

        friendsSnap.docs.forEach((f) => {
          const chatId = [uid, f.id].sort().join("_");
          const q = query(
            collection(db, "chats", chatId, "messages"),
            where("senderUid", "==", f.id),
            where("read", "==", false),
          );
          msgUnsubs.push(
            onSnapshot(q, (snap) => {
              unreadMap[f.id] = snap.docs.some(
                (d) => d.data().type !== "duel_invite",
              );
              setUnread(Object.keys(unreadMap).filter((k) => unreadMap[k]));
            }),
          );
        });
      },
    );

    const unsubDuels = onSnapshot(
      query(
        collection(db, "duels"),
        where("player2", "==", uid),
        where("status", "==", "pending"),
      ),
      (snap) => setPendingDuels(snap.docs.map((d) => d.data().player1)),
    );

    return () => {
      unsubFriends();
      unsubDuels();
      msgUnsubs.forEach((fn) => fn());
    };
  }, [uid]);

  return uid
    ? { friendsCount, unreadFriendUids: unread, pendingDuelFriendUids: pendingDuels }
    : EMPTY;
}
