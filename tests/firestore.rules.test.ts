import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const alice = { uid: "alice", email: "alice@poopstagram.local" };
const bob = { uid: "bob", email: "bob@poopstagram.local" };
const eve = { uid: "eve", email: "eve@poopstagram.local" };

const as = (u: { uid: string; email: string }) =>
  env.authenticatedContext(u.uid, { email: u.email }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kaka-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { nickname: "alice", balance: 20 });
    await setDoc(doc(db, "users/bob"), { nickname: "bob", balance: 0 });
    await setDoc(doc(db, "users/eve"), { nickname: "eve", balance: 0 });
    await setDoc(doc(db, "users/alice/friends/bob"), { addedAt: 1 });
    await setDoc(doc(db, "users/bob/friends/alice"), { addedAt: 1 });
    await setDoc(doc(db, "users/alice/tracker/records"), {
      "2026-01-01": { status: "happy" },
    });
  });
});

describe("профили и баланс", () => {
  it("владелец может обновить аватар", async () => {
    await assertSucceeds(
      updateDoc(doc(as(alice), "users/alice"), { avatar: "🦄" }),
    );
  });

  it("нельзя править чужой профиль", async () => {
    await assertFails(updateDoc(doc(as(eve), "users/alice"), { bio: "x" }));
  });

  it("нельзя сменить ник", async () => {
    await assertFails(
      updateDoc(doc(as(alice), "users/alice"), { nickname: "other" }),
    );
  });

  it("нельзя поднять баланс сразу на большую сумму", async () => {
    await assertFails(
      updateDoc(doc(as(alice), "users/alice"), { balance: increment(1000) }),
    );
    await assertSucceeds(
      updateDoc(doc(as(alice), "users/alice"), { balance: increment(2) }),
    );
  });

  it("нельзя уйти в минус", async () => {
    await assertFails(
      updateDoc(doc(as(alice), "users/alice"), { balance: increment(-21) }),
    );
  });

  it("регистрация: профиль и ник создаются только на свой uid и ник", async () => {
    const newUser = { uid: "carol", email: "carol@poopstagram.local" };
    const db = as(newUser);
    await assertSucceeds(
      setDoc(doc(db, "users/carol"), { nickname: "carol", createdAt: 1 }),
    );
    await assertSucceeds(setDoc(doc(db, "usernames/carol"), { uid: "carol" }));
    await assertFails(setDoc(doc(db, "usernames/alice"), { uid: "carol" }));
  });

  it("неавторизованный ничего не читает", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "users/alice")));
  });
});

describe("дневник и комментарии", () => {
  it("друг видит записи, чужой — нет", async () => {
    await assertSucceeds(getDoc(doc(as(bob), "users/alice/tracker/records")));
    await assertFails(getDoc(doc(as(eve), "users/alice/tracker/records")));
  });

  it("писать записи может только владелец", async () => {
    await assertSucceeds(
      setDoc(doc(as(alice), "users/alice/tracker/records"), { a: 1 }),
    );
    await assertFails(
      setDoc(doc(as(bob), "users/alice/tracker/records"), { a: 1 }),
    );
  });

  it("друг может комментировать от своего имени, но не подделать автора", async () => {
    const path = "users/alice/tracker_comments/2026-01-01/comments/c1";
    await assertSucceeds(
      setDoc(doc(as(bob), path), { authorUid: "bob", text: "привет" }),
    );
    await assertFails(
      setDoc(doc(as(bob), path + "2"), { authorUid: "alice", text: "x" }),
    );
    await assertFails(
      setDoc(doc(as(eve), path + "3"), { authorUid: "eve", text: "x" }),
    );
  });
});

describe("друзья", () => {
  it("принятие заявки: запись в обе стороны разрешена только при наличии заявки", async () => {
    const carol = { uid: "carol", email: "carol@poopstagram.local" };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/carol"), { nickname: "carol" });
    });
    await assertSucceeds(
      setDoc(doc(as(carol), "users/alice/friend_requests/carol"), {
        fromUid: "carol",
      }),
    );
    await assertSucceeds(
      setDoc(doc(as(alice), "users/alice/friends/carol"), { addedAt: 1 }),
    );
    await assertSucceeds(
      setDoc(doc(as(alice), "users/carol/friends/alice"), { addedAt: 1 }),
    );
    await assertSucceeds(
      deleteDoc(doc(as(alice), "users/alice/friend_requests/carol")),
    );
  });

  it("без заявки нельзя навязать дружбу", async () => {
    await assertFails(
      setDoc(doc(as(eve), "users/alice/friends/eve"), { addedAt: 1 }),
    );
    await assertFails(
      setDoc(doc(as(eve), "users/eve/friends/alice"), { addedAt: 1 }),
    );
  });

  it("нельзя отправить заявку от чужого имени", async () => {
    await assertFails(
      setDoc(doc(as(eve), "users/alice/friend_requests/bob"), {
        fromUid: "bob",
      }),
    );
  });
});

describe("чаты и подарки", () => {
  it("участники читают и пишут, посторонний — нет", async () => {
    const path = "chats/alice_bob/messages/m1";
    await assertSucceeds(
      setDoc(doc(as(alice), path), {
        senderUid: "alice",
        text: "hi",
        read: false,
      }),
    );
    await assertSucceeds(getDoc(doc(as(bob), path)));
    await assertFails(getDoc(doc(as(eve), path)));
    await assertFails(
      setDoc(doc(as(bob), "chats/alice_bob/messages/m2"), {
        senderUid: "alice",
        text: "подделка",
      }),
    );
  });

  it("получатель может отметить прочитанным, но не менять текст", async () => {
    const path = "chats/alice_bob/messages/m1";
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), {
        senderUid: "alice",
        text: "hi",
        read: false,
      });
    });
    await assertFails(updateDoc(doc(as(bob), path), { text: "edited" }));
    await assertSucceeds(updateDoc(doc(as(bob), path), { read: true }));
  });

  it("запрос непрочитанных сообщений друга разрешён", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(as(bob), "chats/alice_bob/messages"),
          where("senderUid", "==", "alice"),
          where("read", "==", false),
        ),
      ),
    );
  });

  it("подарок можно отправить только другу и только от своего имени", async () => {
    await assertSucceeds(
      setDoc(doc(as(alice), "users/bob/gifts_received/g1"), {
        fromUid: "alice",
        giftId: "x",
      }),
    );
    await assertFails(
      setDoc(doc(as(eve), "users/bob/gifts_received/g2"), {
        fromUid: "eve",
        giftId: "x",
      }),
    );
    await assertFails(
      setDoc(doc(as(alice), "users/bob/gifts_received/g3"), {
        fromUid: "bob",
        giftId: "x",
      }),
    );
  });
});

describe("дуэли", () => {
  const duelBase = {
    player1: "alice",
    player2: "bob",
    status: "pending",
    scores: { alice: 0, bob: 0 },
  };

  const seed = async (data: Record<string, unknown>) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "duels/d1"), data);
    });
  };

  it("вызвать можно только друга", async () => {
    await assertSucceeds(setDoc(doc(as(alice), "duels/n1"), duelBase));
    await assertFails(
      setDoc(doc(as(alice), "duels/n2"), { ...duelBase, player2: "eve" }),
    );
    await assertFails(
      setDoc(doc(as(eve), "duels/n3"), { ...duelBase, player1: "alice" }),
    );
  });

  it("принять вызов может только соперник и ровно на 7 дней", async () => {
    await seed(duelBase);
    const week = 7 * 24 * 3600 * 1000;
    await assertFails(
      updateDoc(doc(as(alice), "duels/d1"), {
        status: "active",
        startDate: 1,
        endDate: 1 + week,
      }),
    );
    await assertFails(
      updateDoc(doc(as(bob), "duels/d1"), {
        status: "active",
        startDate: 1,
        endDate: 5,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(bob), "duels/d1"), {
        status: "active",
        startDate: 1,
        endDate: 1 + week,
      }),
    );
  });

  it("очки: только свои и только в активной дуэли", async () => {
    await seed({ ...duelBase, status: "active", startDate: 1, endDate: 2e12 });
    await assertSucceeds(
      updateDoc(doc(as(alice), "duels/d1"), { "scores.alice": 7 }),
    );
    await assertFails(
      updateDoc(doc(as(alice), "duels/d1"), { "scores.bob": 7 }),
    );
  });

  it("досрочно объявить себя победителем нельзя, сдаться — можно", async () => {
    await seed({ ...duelBase, status: "active", startDate: 1, endDate: 2e12 });
    await assertFails(
      updateDoc(doc(as(alice), "duels/d1"), {
        status: "finished",
        winnerId: "alice",
        rewarded: false,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(alice), "duels/d1"), {
        status: "finished",
        winnerId: "bob",
        surrenderedBy: "alice",
        rewarded: false,
      }),
    );
  });

  it("по истечении срока победитель определяется очками", async () => {
    await seed({
      ...duelBase,
      status: "active",
      startDate: 1,
      endDate: 2,
      scores: { alice: 3, bob: 9 },
    });
    await assertFails(
      updateDoc(doc(as(alice), "duels/d1"), {
        status: "finished",
        winnerId: "alice",
        rewarded: false,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as(alice), "duels/d1"), {
        status: "finished",
        winnerId: "bob",
        rewarded: false,
      }),
    );
  });

  it("награду забирает только победитель и один раз", async () => {
    await seed({
      ...duelBase,
      status: "finished",
      winnerId: "bob",
      rewarded: false,
      startDate: 1,
      endDate: 2,
    });
    await assertFails(updateDoc(doc(as(alice), "duels/d1"), { rewarded: true }));
    await assertSucceeds(updateDoc(doc(as(bob), "duels/d1"), { rewarded: true }));
    await assertFails(updateDoc(doc(as(bob), "duels/d1"), { rewarded: false }));
  });

  it("постороннему дуэль недоступна", async () => {
    await seed(duelBase);
    await assertFails(getDoc(doc(as(eve), "duels/d1")));
  });
});
