import { useState, useEffect, useMemo } from "react";
import type { FormEvent } from "react";
import {
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import "./PoopTracker.scss";
import type { DayComment } from "./FriendsTab";
import { syncMyDuelScores } from "../utils/duels";
import { claimDailyReward } from "../utils/economy";
import { notify, askConfirm } from "../utils/dialogs";
import { toDateKey } from "../utils/dates";
import { computeStreak } from "../utils/streak";
import { DAY_FORMS, pluralRu } from "../utils/format";
import { useToday } from "../hooks/useToday";

const BASE = import.meta.env.BASE_URL;

type Status = "cancel" | "sad" | "neutral" | "happy";
type Quality = "diarrhea" | "hard" | "soft" | "undefined" | null;

export interface DayRecord {
  count: string;
  quality: Quality;
  status: Status;
}

export type Records = Record<string, DayRecord>;

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

const STATUS_ICONS: Record<Status, string> = {
  cancel: `${BASE}crossed-neutral-pink-poop.svg`,
  sad: `${BASE}sad-pink-poop.svg`,
  neutral: `${BASE}neutral-pink-poop.svg`,
  happy: `${BASE}happy-pink-poop.svg`,
};

const STATUS_LABELS: Record<Status, string> = {
  cancel: "Без походов",
  sad: "Плохо",
  neutral: "Нормально",
  happy: "Отлично",
};

const STATUS_EMOJI: Record<Status, string> = {
  cancel: "❌",
  sad: "😢",
  neutral: "😁",
  happy: "😊",
};

const QUALITY_LABELS: Record<NonNullable<Quality>, string> = {
  diarrhea: "Понос",
  hard: "Твердый",
  soft: "Мягкий",
  undefined: "Неопределенный",
};

interface PoopTrackerProps {
  userId: string;
  records: Records;
  onUpdateRecords: (records: Records) => void;
}

export function PoopTracker({
  userId,
  records,
  onUpdateRecords,
}: PoopTrackerProps) {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [detailDate, setDetailDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<DayRecord>>({});

  const [comments, setComments] = useState<DayComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [currentUserAvatar, setCurrentUserAvatar] = useState("👑");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayKey = useToday();

  const detailKey = toDateKey(
    detailDate.getFullYear(),
    detailDate.getMonth(),
    detailDate.getDate(),
  );
  const detailRecord = records[detailKey];
  const isTodayDetail = detailKey === todayKey;

  const openModal = (key: string) => {
    setSelectedDate(key);
    setStep(1);
    setDraft(records[key] || { count: "", quality: null });
  };

  useEffect(() => {
    if (!userId) return;
    getDoc(doc(db, "users", userId))
      .then((uSnap) => {
        if (uSnap.exists()) {
          setCurrentUserAvatar(uSnap.data().avatar || "👑");
        }
      })
      .catch((err) => console.error("Ошибка загрузки профиля:", err));
  }, [userId]);

  useEffect(() => {
    if (!userId || !detailKey) return;

    const commentsRef = collection(
      db,
      "users",
      userId,
      "tracker_comments",
      detailKey,
      "comments",
    );
    const q = query(commentsRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as DayComment,
      );
      setComments(list);
    });

    return () => unsubscribe();
  }, [userId, detailKey]);

  useEffect(() => {
    if (selectedDate) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.classList.add("modal-is-open");
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.classList.remove("modal-is-open");
        window.scrollTo(0, scrollY);
      };
    } else {
      document.body.classList.remove("modal-is-open");
    }
    return () => {
      document.body.classList.remove("modal-is-open");
    };
  }, [selectedDate]);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [year, month]);

  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const counts = { sad: 0, neutral: 0, happy: 0, cancel: 0 };
    Object.entries(records).forEach(([key, val]) => {
      if (key.startsWith(prefix) && val.status) counts[val.status]++;
    });
    return counts;
  }, [records, year, month]);

  const streakInfo = useMemo(
    () => computeStreak(records, todayKey),
    [records, todayKey],
  );

  const handleGoToday = () => {
    const nowTime = new Date();
    setDetailDate(nowTime);
    setViewDate(new Date(nowTime.getFullYear(), nowTime.getMonth(), 1));
  };

  const handlePrevDay = () => {
    const d = new Date(detailDate);
    d.setDate(d.getDate() - 1);
    setDetailDate(d);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleNextDay = () => {
    const d = new Date(detailDate);
    d.setDate(d.getDate() + 1);
    if (toDateKey(d.getFullYear(), d.getMonth(), d.getDate()) > todayKey)
      return;
    setDetailDate(d);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(year, month, day);
    if (toDateKey(year, month, day) > todayKey) return;
    setDetailDate(newDate);
  };

  const playSound = () => {
    const soundPref =
      localStorage.getItem("pt-sound-pref") || "metalpipe.mp3";
    if (soundPref === "none") return;
    const audio = new Audio(`${BASE}sounds/${soundPref}`);
    audio.play().catch(() => {});
  };

  const handleSave = (status: Status) => {
    if (!selectedDate) return;
    if (status !== "cancel") playSound();

    const isCancel = status === "cancel";
    const next = {
      ...records,
      [selectedDate]: {
        count: isCancel ? "" : draft.count || "",
        quality: isCancel ? null : draft.quality || null,
        status: status,
      },
    };

    onUpdateRecords(next);
    setSelectedDate(null);

    if (
      selectedDate === todayKey &&
      status === "happy" &&
      draft.quality === "soft"
    ) {
      claimDailyReward(userId, "lastRecordReward", 1).then((claimed) => {
        if (claimed) {
          notify("Идеально! Начислено Смыв-коинов: +1 🪙", "success");
        }
      });
    }

    syncMyDuelScores(userId, next);
  };

  const clearDay = async (keyToClear: string) => {
    if (!(await askConfirm("Удалить запись за этот день?"))) return;
    const next = { ...records };
    delete next[keyToClear];
    onUpdateRecords(next);
    syncMyDuelScores(userId, next);
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !detailKey) return;
    try {
      const commentsRef = collection(
        db,
        "users",
        userId,
        "tracker_comments",
        detailKey,
        "comments",
      );
      await addDoc(commentsRef, {
        authorUid: userId,
        authorNickname: auth.currentUser?.displayName || "user",
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
    if (!detailKey) return;
    if (!(await askConfirm("Удалить комментарий?"))) return;
    try {
      await deleteDoc(
        doc(
          db,
          "users",
          userId,
          "tracker_comments",
          detailKey,
          "comments",
          commentId,
        ),
      );
    } catch (e) {
      console.error("Ошибка удаления комментария:", e);
    }
  };

  return (
    <div className="pt-app">
      <header className="pt-header">
        <div className="pt-header__icon">💩</div>
        <div className="pt-header__text">
          <h1>Дневник</h1>
          <p>Слежу за тобой</p>
        </div>
        <div className="pt-header__actions">
          <div
            className={`pt-streak pt-streak--${Math.min(streakInfo.streak, 7)}`}
          >
            <span className="pt-streak__icon" />
            <span>
              {streakInfo.streak} {pluralRu(streakInfo.streak, DAY_FORMS)}
            </span>
          </div>
        </div>
      </header>

      <div className="pt-stats">
        <div className="pt-stat">
          <span className="pt-stat__emoji">😊</span>
          <span className="pt-stat__count">{monthStats.happy}</span>
        </div>
        <div className="pt-stat">
          <span className="pt-stat__emoji">😁</span>
          <span className="pt-stat__count">{monthStats.neutral}</span>
        </div>
        <div className="pt-stat">
          <span className="pt-stat__emoji">😢</span>
          <span className="pt-stat__count">{monthStats.sad}</span>
        </div>
        <div className="pt-stat">
          <span className="pt-stat__emoji">❌</span>
          <span className="pt-stat__count">{monthStats.cancel}</span>
        </div>
      </div>

      <div className="pt-card">
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
            const record = records[key];
            const isToday = key === todayKey;
            const isSelected = key === detailKey;

            return (
              <div
                key={key}
                onClick={() => handleSelectDay(day)}
                className={[
                  "cal-cell",
                  "cal-cell--display",
                  "cal-cell--clickable",
                  isToday && "cal-cell--today",
                  isSelected && "cal-cell--selected",
                  record?.status && `cal-cell--${record.status}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="cal-cell__day">{day}</span>
                {record?.status && (
                  <span className="cal-cell__emoji">
                    {STATUS_EMOJI[record.status]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-details-block">
        <div className="pt-details-header">
          <button className="pt-details-nav" onClick={handlePrevDay}>
            ‹
          </button>

          <div className="pt-details-center">
            <h3 className="pt-details-title">
              {detailDate.getDate()} {MONTHS[detailDate.getMonth()]}
            </h3>
            <button
              className="pt-btn--today"
              disabled={isTodayDetail}
              onClick={handleGoToday}
            >
              Сегодня
            </button>
          </div>

          <button
            className="pt-details-nav"
            onClick={handleNextDay}
            disabled={isTodayDetail}
          >
            ›
          </button>
        </div>

        {detailRecord ? (
          <div className="pt-details-content">
            <div className="today-row">
              <span>Статус:</span>{" "}
              <strong>
                {STATUS_EMOJI[detailRecord.status]}{" "}
                {STATUS_LABELS[detailRecord.status]}
              </strong>
            </div>
            {detailRecord.count && (
              <div className="today-row">
                <span>Количество:</span>{" "}
                <strong>{detailRecord.count} раз(а)</strong>
              </div>
            )}
            {detailRecord.quality && (
              <div className="today-row">
                <span>Качество:</span>{" "}
                <strong>{QUALITY_LABELS[detailRecord.quality]}</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-details-empty">Нет информации за этот день</div>
        )}

        <div className="pt-details-actions">
          <button
            className="pt-btn pt-btn--primary pt-btn--action"
            onClick={() => openModal(detailKey)}
          >
            {detailRecord
              ? "✏️ Отредактировать запись"
              : "💩 Сходил покакать!"}
          </button>

          {detailRecord && (
            <button
              className="pt-btn pt-btn--danger"
              onClick={() => clearDay(detailKey)}
            >
              🗑️ Удалить запись
            </button>
          )}
        </div>

        <div className="pt-owner-comments-wrap">
          <h4 className="pt-owner-comments-title">
            Комментарии ({comments.length})
          </h4>
          <div className="pt-comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="pt-comment-bubble">
                <div className="pt-comment-avatar">
                  {comment.authorAvatar}
                </div>
                <div className="pt-comment-content">
                  <div className="pt-comment-top">
                    <strong>@{comment.authorNickname}</strong>
                    <span className="pt-comment-time">
                      {comment.createdAt != null
                        ? new Date(
                            typeof comment.createdAt === "number"
                              ? comment.createdAt
                              : (
                                  comment.createdAt as import("firebase/firestore").Timestamp
                                ).toMillis(),
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <p>{comment.text}</p>
                </div>
                <button
                  className="pt-comment-delete"
                  onClick={() => handleDeleteComment(comment.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddComment} className="pt-comment-form">
            <input
              type="text"
              placeholder="Ответить..."
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
      </div>

      {selectedDate && (
        <div className="pt-overlay" onClick={() => setSelectedDate(null)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <div className="pt-modal__steps-indicator">Шаг {step} из 3</div>

            {step === 1 && (
              <div className="pt-modal__step">
                <h3 className="pt-modal__title">Количество походов</h3>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="pt-input"
                  placeholder="Например: 2"
                  value={draft.count || ""}
                  onChange={(e) => {
                    const onlyNumbers = e.target.value.replace(/\D/g, "");
                    setDraft({ ...draft, count: onlyNumbers });
                  }}
                />
                <div className="pt-modal__actions-row">
                  <button
                    className="pt-btn pt-btn--secondary"
                    onClick={() => setStep(2)}
                  >
                    Пропустить
                  </button>
                  <button
                    className="pt-btn pt-btn--primary"
                    onClick={() => setStep(2)}
                  >
                    Далее
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="pt-modal__step">
                <h3 className="pt-modal__title">Качество стула</h3>
                <div className="pt-quality-grid">
                  {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                    <button
                      key={q!}
                      className={`pt-quality-btn ${draft.quality === q ? "active" : ""}`}
                      onClick={() => setDraft({ ...draft, quality: q })}
                    >
                      {QUALITY_LABELS[q!]}
                    </button>
                  ))}
                </div>
                <div className="pt-modal__actions-row">
                  <button
                    className="pt-btn pt-btn--secondary"
                    onClick={() => setStep(3)}
                  >
                    Пропустить
                  </button>
                  <button
                    className="pt-btn pt-btn--primary"
                    onClick={() => setStep(3)}
                  >
                    Далее
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="pt-modal__step">
                <h3 className="pt-modal__title">Общая оценка</h3>
                <div className="pt-icon-grid pt-icon-grid--step-spaced">
                  {(["cancel", "sad", "neutral", "happy"] as Status[]).map(
                    (s) => (
                      <button
                        key={s}
                        className={`pt-icon-btn pt-icon-btn--${s} ${records[selectedDate]?.status === s ? "pt-icon-btn--active" : ""}`}
                        onClick={() => handleSave(s)}
                      >
                        <img src={STATUS_ICONS[s]} alt={STATUS_LABELS[s]} />
                        <span>{STATUS_LABELS[s]}</span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="pt-modal__actions">
              <button
                className="pt-modal__close"
                onClick={() => setSelectedDate(null)}
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
