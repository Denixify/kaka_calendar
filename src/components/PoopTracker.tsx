import { useState, useEffect, useMemo } from "react";
import "./PoopTracker.scss";

const BASE = import.meta.env.BASE_URL;

type Status = "cancel" | "sad" | "neutral" | "happy";
type Quality = "diarrhea" | "hard" | "soft" | "undefined" | null;

interface DayRecord {
  count: string;
  quality: Quality;
  status: Status;
}

type Records = Record<string, DayRecord>;

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

const SOUNDS = [
  { id: "metalpipe.mp3", label: "метал)" },
  { id: "poop1.mp3", label: "пук1" },
  { id: "poop2.mp3", label: "пук2" },
];

export function PoopTracker() {
  const [records, setRecords] = useState<Records>(() => {
    try {
      const saved = localStorage.getItem("poop-tracker-data");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach((k) => {
        if (typeof parsed[k] === "string") {
          parsed[k] = { status: parsed[k], count: "", quality: null };
        }
      });
      return parsed;
    } catch {
      return {};
    }
  });

  const [soundPref, setSoundPref] = useState<string | null>(() =>
    localStorage.getItem("pt-sound-pref"),
  );
  const [lastRestore, setLastRestore] = useState<number>(() =>
    Number(localStorage.getItem("pt-last-restore") || 0),
  );

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<DayRecord>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("poop-tracker-data", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    if (soundPref) localStorage.setItem("pt-sound-pref", soundPref);
  }, [soundPref]);

  useEffect(() => {
    localStorage.setItem("pt-last-restore", lastRestore.toString());
  }, [lastRestore]);

  useEffect(() => {
    if (selectedDate || isSettingsOpen) {
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
  }, [selectedDate, isSettingsOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterdayObj = new Date(now);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayKey = toDateKey(
    yesterdayObj.getFullYear(),
    yesterdayObj.getMonth(),
    yesterdayObj.getDate(),
  );

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
    const now = new Date();
    const todayStr = toDateKey(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const yesterdayObj = new Date(now);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = toDateKey(
      yesterdayObj.getFullYear(),
      yesterdayObj.getMonth(),
      yesterdayObj.getDate(),
    );

    const activeEntries = Object.entries(records)
      .filter(([, data]) => data.status && data.status !== "cancel")
      .sort((a, b) => b[0].localeCompare(a[0]));

    const activeDates = activeEntries.map(([date]) => date);
    const totalActive = activeDates.length;

    if (totalActive === 0)
      return { streak: 0, isLost: false, isBeginner: true };

    const hasToday = activeDates.includes(todayStr);
    const hasYesterday = activeDates.includes(yesterdayStr);

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

    return {
      streak: Math.min(streak, 7),
      isLost: false,
      isBeginner,
    };
  }, [records]);

  const openModal = (key: string) => {
    setSelectedDate(key);
    setStep(1);
    setDraft(records[key] || { count: "", quality: null });
  };

  const playSound = (soundId: string) => {
    const audio = new Audio(`${BASE}sounds/${soundId}`);
    audio.play().catch(() => {});
  };

  const handleSave = (status: Status) => {
    if (!selectedDate) return;
    if (status !== "cancel" && soundPref) playSound(soundPref);

    setRecords({
      ...records,
      [selectedDate]: {
        count: draft.count || "",
        quality: draft.quality || null,
        status: status,
      },
    });
    setSelectedDate(null);
  };

  const clearDay = () => {
    if (!selectedDate) return;
    const next = { ...records };
    delete next[selectedDate];
    setRecords(next);
    setSelectedDate(null);
  };

  const handleRestoreStreak = () => {
    setRecords({
      ...records,
      [yesterdayKey]: { count: "", quality: null, status: "neutral" },
    });
    setLastRestore(Date.now());
  };

  const todayRecord = records[todayKey];
  const [currentTime] = useState(() => Date.now());

  const cooldownDaysLeft = Math.ceil(
    (7 * 24 * 60 * 60 * 1000 - (currentTime - lastRestore)) /
      (1000 * 60 * 60 * 24),
  );
  const isCooldown = cooldownDaysLeft > 0;

  return (
    <div className="pt-app">
      <header className="pt-header">
        <div className="pt-header__icon">💩</div>
        <div className="pt-header__text">
          <h1>Дневник</h1>
          <p>Слежу за тобой</p>
        </div>
        <div className="pt-header__actions">
          <div className="pt-streak">🔥 {streakInfo.streak}/7</div>
          <button
            className="pt-settings-btn"
            onClick={() => setIsSettingsOpen(true)}
          >
            ⚙️
          </button>
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
            if (day === null)
              return (
                <div key={`e-${idx}`} className="cal-cell cal-cell--empty" />
              );
            const key = toDateKey(year, month, day);
            const record = records[key];
            const isToday = key === todayKey;

            return (
              <button
                key={key}
                type="button"
                className={[
                  "cal-cell",
                  isToday && "cal-cell--today",
                  key === selectedDate && "cal-cell--selected",
                  record?.status && `cal-cell--${record.status}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() =>
                  selectedDate === key ? setSelectedDate(null) : openModal(key)
                }
              >
                <span className="cal-cell__day">{day}</span>
                {record?.status && (
                  <span className="cal-cell__emoji">
                    {STATUS_EMOJI[record.status]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-today-block">
        <h3 className="pt-today-block__title">
          Сегодня, {now.getDate()} {MONTHS[now.getMonth()]}
        </h3>
        {todayRecord ? (
          <div className="pt-today-block__content">
            <div className="today-row">
              <span>Статус:</span>{" "}
              <strong>
                {STATUS_EMOJI[todayRecord.status]}{" "}
                {STATUS_LABELS[todayRecord.status]}
              </strong>
            </div>
            {todayRecord.count && (
              <div className="today-row">
                <span>Количество:</span>{" "}
                <strong>{todayRecord.count} раз(а)</strong>
              </div>
            )}
            {todayRecord.quality && (
              <div className="today-row">
                <span>Качество:</span>{" "}
                <strong>{QUALITY_LABELS[todayRecord.quality]}</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-today-block__empty">
            Нету информации по сегодняшнему стулу
          </div>
        )}
      </div>

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
                  onClick={handleRestoreStreak}
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

      {selectedDate && (
        <div className="pt-overlay" onClick={() => setSelectedDate(null)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <div className="pt-modal__steps-indicator">Шаг {step} из 3</div>

            {step === 1 && (
              <div className="pt-modal__step">
                <h3 className="pt-modal__title">Количество походов</h3>
                <input
                  type="number"
                  className="pt-input"
                  placeholder="Например: 2"
                  value={draft.count || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, count: e.target.value })
                  }
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
                <div className="pt-icon-grid" style={{ marginTop: "20px" }}>
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
              {records[selectedDate] && (
                <button className="pt-modal__clear" onClick={clearDay}>
                  Удалить запись
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
