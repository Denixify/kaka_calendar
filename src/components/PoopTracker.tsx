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
  const [detailDate, setDetailDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Partial<DayRecord>>({});

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAchievModalOpen, setIsAchievModalOpen] = useState(false);

  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem("pt-achievements") || "[]");
      } catch {
        return [];
      }
    },
  );

  const [newAchievsCount, setNewAchievsCount] = useState<number>(() => {
    return Number(localStorage.getItem("pt-new-achievs") || 0);
  });

  const [currentTime] = useState(() => Date.now());

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

  const detailKey = toDateKey(
    detailDate.getFullYear(),
    detailDate.getMonth(),
    detailDate.getDate(),
  );
  const detailRecord = records[detailKey];
  const isTodayDetail = detailKey === todayKey;

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

  useEffect(() => {
    const newlyUnlocked: string[] = [];
    const values = Object.values(records);

    if (streakInfo.streak >= 1 && !unlockedAchievements.includes("streak_1"))
      newlyUnlocked.push("streak_1");
    if (streakInfo.streak >= 2 && !unlockedAchievements.includes("streak_2"))
      newlyUnlocked.push("streak_2");
    if (streakInfo.streak >= 3 && !unlockedAchievements.includes("streak_3"))
      newlyUnlocked.push("streak_3");
    if (streakInfo.streak >= 4 && !unlockedAchievements.includes("streak_4"))
      newlyUnlocked.push("streak_4");
    if (streakInfo.streak >= 5 && !unlockedAchievements.includes("streak_5"))
      newlyUnlocked.push("streak_5");
    if (streakInfo.streak >= 6 && !unlockedAchievements.includes("streak_6"))
      newlyUnlocked.push("streak_6");
    if (streakInfo.streak >= 7 && !unlockedAchievements.includes("streak_7"))
      newlyUnlocked.push("streak_7");

    if (streakInfo.isLost && !unlockedAchievements.includes("lost_streak"))
      newlyUnlocked.push("lost_streak");
    if (lastRestore > 0 && !unlockedAchievements.includes("magic_restore"))
      newlyUnlocked.push("magic_restore");

    if (
      values.some((r) => Number(r.count) > 1) &&
      !unlockedAchievements.includes("machine_gun")
    )
      newlyUnlocked.push("machine_gun");
    if (
      values.some((r) => r.quality === "diarrhea") &&
      !unlockedAchievements.includes("liquid_gold")
    )
      newlyUnlocked.push("liquid_gold");
    if (
      values.some((r) => r.status === "sad") &&
      !unlockedAchievements.includes("soup_time")
    )
      newlyUnlocked.push("soup_time");

    if (
      values.some((r) => r.quality === "hard") &&
      !unlockedAchievements.includes("fatality")
    )
      newlyUnlocked.push("fatality");
    if (
      values.some((r) => r.status === "happy") &&
      !unlockedAchievements.includes("chamber_of_secrets")
    )
      newlyUnlocked.push("chamber_of_secrets");
    if (
      values.some((r) => r.status === "cancel") &&
      !unlockedAchievements.includes("stranger_things")
    )
      newlyUnlocked.push("stranger_things");
    if (
      values.some((r) => r.quality === "soft") &&
      !unlockedAchievements.includes("perfect_soft")
    )
      newlyUnlocked.push("perfect_soft");

    if (
      values.some((r) => r.quality === "undefined") &&
      !unlockedAchievements.includes("schrodinger")
    )
      newlyUnlocked.push("schrodinger");

    if (
      values.some((r) => r.status === "neutral") &&
      !unlockedAchievements.includes("not_great_not_terrible")
    )
      newlyUnlocked.push("not_great_not_terrible");

    if (newlyUnlocked.length > 0) {
      const timer = setTimeout(() => {
        setUnlockedAchievements((prev) => [...prev, ...newlyUnlocked]);
        setNewAchievsCount((prev) => prev + newlyUnlocked.length);
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [records, streakInfo, lastRestore, unlockedAchievements]);

  useEffect(() => {
    localStorage.setItem(
      "pt-achievements",
      JSON.stringify(unlockedAchievements),
    );
  }, [unlockedAchievements]);
  useEffect(() => {
    localStorage.setItem("pt-new-achievs", newAchievsCount.toString());
  }, [newAchievsCount]);
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
    if (selectedDate || isSettingsOpen || isAchievModalOpen) {
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
  }, [selectedDate, isSettingsOpen, isAchievModalOpen]);

  const handleGoToday = () => {
    const now = new Date();
    setDetailDate(now);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
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

  const clearDay = (keyToClear: string) => {
    const next = { ...records };
    delete next[keyToClear];
    setRecords(next);
  };

  const handleRestoreStreak = () => {
    setRecords({
      ...records,
      [yesterdayKey]: { count: "", quality: null, status: "neutral" },
    });
    setLastRestore(Date.now());
  };

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
          <div className={`pt-streak pt-streak--${streakInfo.streak}`}>
            <span className="pt-streak__icon" />
            <span>{streakInfo.streak}/7</span>
          </div>

          <div className="pt-badge-wrapper">
            <button
              className="pt-settings-btn"
              onClick={() => {
                setIsAchievModalOpen(true);
                setNewAchievsCount(0);
              }}
            >
              🏆
            </button>
            {newAchievsCount > 0 && (
              <span className="pt-badge">{newAchievsCount}</span>
            )}
          </div>

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
            {detailRecord ? "✏️ Отредактировать запись" : "💩 Сходил покакать!"}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
