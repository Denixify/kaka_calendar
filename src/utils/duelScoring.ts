import type { DayRecord, Records } from "../components/PoopTracker";

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calculateRecordScore(rec?: DayRecord): number {
  if (!rec || !rec.status) return 0;

  let score = 0;

  switch (rec.status) {
    case "happy":
      score += 3;
      break;
    case "neutral":
      score += 1;
      break;
    case "sad":
      score -= 1;
      break;
    case "cancel":
      score -= 2;
      break;
  }

  if (rec.quality) {
    switch (rec.quality) {
      case "soft":
        score += 3;
        break;
      case "hard":
        score += 1;
        break;
      case "undefined":
        score += 0;
        break;
      case "diarrhea":
        score -= 2;
        break;
    }
  }

  const countNum = parseInt(rec.count || "1", 10);
  if (rec.status !== "cancel") {
    if (countNum >= 1 && countNum <= 2) {
      score += 1;
    } else if (countNum >= 4) {
      score -= 1;
    }
  }

  return score;
}

export function calculateDuelScore(
  records: Records,
  startDate: number,
  endDate: number,
): number {
  let total = 0;
  const startObj = new Date(startDate);
  const endObj = new Date(endDate);

  const current = new Date(
    startObj.getFullYear(),
    startObj.getMonth(),
    startObj.getDate(),
  );
  const finish = new Date(
    endObj.getFullYear(),
    endObj.getMonth(),
    endObj.getDate(),
  );

  while (current <= finish) {
    const key = toDateKey(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
    );
    if (records[key]) {
      total += calculateRecordScore(records[key]);
    }
    current.setDate(current.getDate() + 1);
  }

  return total;
}
