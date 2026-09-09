import { useState, useEffect, useMemo } from "react";
import "./PoopTracker.scss";

type Status = "cancel" | "sad" | "neutral" | "happy";
type Records = Record<string, Status>;

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
  cancel: "/crossed-neutral-pink-poop.svg",
  sad: "/sad-pink-poop.svg",
  neutral: "/neutral-pink-poop.svg",
  happy: "/happy-pink-poop.svg",
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

function formatDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function PoopTracker() {
  const [records, setRecords] = useState<Records>(() => {
    try {
      const saved = localStorage.getItem("poop-tracker-data");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("poop-tracker-data", JSON.stringify(records));
  }, [records]);

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

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const counts = { sad: 0, neutral: 0, happy: 0, cancel: 0 };
    Object.entries(records).forEach(([key, val]) => {
      if (key.startsWith(prefix)) {
        counts[val as keyof typeof counts]++;
      }
    });
    return counts;
  }, [records, year, month]);

  const setStatus = (status: Status) => {
    if (!selectedDate) return;
    setRecords({ ...records, [selectedDate]: status });
    setSelectedDate(null);
  };

  const clearDay = () => {
    if (!selectedDate) return;
    const next = { ...records };
    delete next[selectedDate];
    setRecords(next);
    setSelectedDate(null);
  };

  const selectedStatus = selectedDate ? records[selectedDate] : undefined;

  return (
    <div className="pt-app">
      <header className="pt-header">
        <div className="pt-header__icon">💩</div>
        <div className="pt-header__text">
          <h1>Дневник</h1>
          <p>Слежу за тобой</p>
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
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <h2 className="cal-title">
            {MONTHS[month]} {year}
          </h2>
          <button
            className="cal-nav"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            aria-label="Следующий месяц"
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
            const status = records[key];
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;

            return (
              <button
                key={key}
                type="button"
                className={[
                  "cal-cell",
                  isToday && "cal-cell--today",
                  isSelected && "cal-cell--selected",
                  status && `cal-cell--${status}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                aria-label={`${day} ${MONTHS[month]}`}
              >
                <span className="cal-cell__day">{day}</span>
                {status && (
                  <span className="cal-cell__emoji">
                    {STATUS_EMOJI[status]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div
          className="pt-overlay"
          onClick={() => setSelectedDate(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pt-modal__handle" />
            <h3 className="pt-modal__title">{formatDate(selectedDate)}</h3>
            {selectedStatus && (
              <p className="pt-modal__current">
                Сейчас: {STATUS_EMOJI[selectedStatus]}{" "}
                {STATUS_LABELS[selectedStatus]}
              </p>
            )}

            <div className="pt-icon-grid">
              {(["cancel", "sad", "neutral", "happy"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`pt-icon-btn pt-icon-btn--${s} ${selectedStatus === s ? "pt-icon-btn--active" : ""}`}
                  onClick={() => setStatus(s)}
                  aria-label={STATUS_LABELS[s]}
                >
                  <img src={STATUS_ICONS[s]} alt={STATUS_LABELS[s]} />
                  <span>{STATUS_LABELS[s]}</span>
                </button>
              ))}
            </div>

            <div className="pt-modal__actions">
              <button
                type="button"
                className="pt-modal__close"
                onClick={() => setSelectedDate(null)}
              >
                Закрыть
              </button>

              {selectedStatus && (
                <button
                  type="button"
                  className="pt-modal__clear"
                  onClick={clearDay}
                >
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
