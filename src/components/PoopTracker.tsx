import {
  useState,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import "./PoopTracker.scss";

const BASE = import.meta.env.BASE_URL;

type Status = "cancel" | "sad" | "neutral" | "happy";
type Quality = "diarrhea" | "hard" | "soft" | "undefined" | null;

export interface DayRecord {
  count: string;
  quality: Quality;
  status: Status;
}

export type Records = Record<string, DayRecord>;

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
  neutral: "😐",
  happy: "😊",
};

const QUALITY_LABELS: Record<NonNullable<Quality>, string> = {
  diarrhea: "Понос",
  hard: "Твердый",
  soft: "Мягкий",
  undefined: "Неопределенный",
};

export interface PoopTrackerHandle {
  openTodayModal: () => void;
}

interface PoopTrackerProps {
  userId: string;
  records: Records;
  onUpdateRecords: (records: Records) => void;
}

export const PoopTracker = forwardRef<PoopTrackerHandle, PoopTrackerProps>(
  ({ userId, records, onUpdateRecords }, ref) => {
    const [viewDate, setViewDate] = useState<Date>(new Date());
    const [detailDate, setDetailDate] = useState<Date>(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<Partial<DayRecord>>({});

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const now = new Date();

    const todayKey = toDateKey(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

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

    useImperativeHandle(ref, () => ({
      openTodayModal() {
        openModal(todayKey);
      },
    }));

    useEffect(() => {
      if (!userId) return;

      async function syncCloudData() {
        try {
          const docRef = doc(db, "users", userId, "tracker", "records");
          const snap = await getDoc(docRef);

          if (snap.exists()) {
            const cloudData = snap.data() as Records;
            onUpdateRecords(cloudData);
            localStorage.setItem(
              "poop-tracker-data",
              JSON.stringify(cloudData),
            );
          } else {
            const localSaved = localStorage.getItem("poop-tracker-data");
            if (localSaved) {
              const parsed = JSON.parse(localSaved);
              await setDoc(docRef, parsed, { merge: true });
            }
          }
        } catch (err) {
          console.error("Ошибка синхронизации с базой:", err);
        }
      }

      syncCloudData();
    }, [userId, onUpdateRecords]);

    useEffect(() => {
      if (selectedDate) {
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
      if (d > now) return;
      setDetailDate(d);
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
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

      const next = {
        ...records,
        [selectedDate]: {
          count: draft.count || "",
          quality: draft.quality || null,
          status: status,
        },
      };

      onUpdateRecords(next);
      setSelectedDate(null);
    };

    const clearDay = (keyToClear: string) => {
      const next = { ...records };
      delete next[keyToClear];
      onUpdateRecords(next);
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
            <div className={`pt-streak pt-streak--${streakInfo.streak}`}>
              <span className="pt-streak__icon" />
              <span>{streakInfo.streak}/7</span>
            </div>
          </div>
        </header>

        <div className="pt-stats">
          <div className="pt-stat">
            <span className="pt-stat__emoji">😊</span>
            <span className="pt-stat__count">{monthStats.happy}</span>
          </div>
          <div className="pt-stat">
            <span className="pt-stat__emoji">😐</span>
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

              return (
                <div
                  key={key}
                  className={[
                    "cal-cell",
                    "cal-cell--display",
                    isToday && "cal-cell--today",
                    key === detailKey && "cal-cell--selected",
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
  },
);
