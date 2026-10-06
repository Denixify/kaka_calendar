import { dateToKey, shiftDateKey } from "./dates";

interface StreakRecord {
  status?: string | null;
}

export interface StreakInfo {
  streak: number;
  isLost: boolean;
  isBeginner: boolean;
}

export function computeStreak(
  records: Record<string, StreakRecord>,
  todayKey: string = dateToKey(new Date()),
): StreakInfo {
  const activeDates = Object.entries(records)
    .filter(([, data]) => data.status && data.status !== "cancel")
    .map(([date]) => date)
    .sort((a, b) => b.localeCompare(a));

  if (activeDates.length === 0) {
    return { streak: 0, isLost: false, isBeginner: true };
  }

  const yesterdayKey = shiftDateKey(todayKey, -1);
  const hasToday = activeDates.includes(todayKey);
  const hasYesterday = activeDates.includes(yesterdayKey);

  if (!hasToday && !hasYesterday) {
    return { streak: 0, isLost: true, isBeginner: false };
  }

  const isBeginner = activeDates.length < 2 && !hasYesterday;

  const counted = activeDates.filter((d) => d <= todayKey);
  let streak = 0;
  let expected = counted[0];
  for (const date of counted) {
    if (date !== expected) break;
    streak++;
    expected = shiftDateKey(expected, -1);
  }

  return { streak, isLost: false, isBeginner };
}
