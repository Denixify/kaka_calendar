import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak";

const rec = (status = "happy") => ({ status });

describe("computeStreak", () => {
  it("пустые данные — новичок", () => {
    expect(computeStreak({}, "2026-03-10")).toEqual({
      streak: 0,
      isLost: false,
      isBeginner: true,
    });
  });

  it("считает подряд идущие дни, включая сегодня", () => {
    const records = {
      "2026-03-10": rec(),
      "2026-03-09": rec("neutral"),
      "2026-03-08": rec("sad"),
      "2026-03-06": rec(),
    };
    expect(computeStreak(records, "2026-03-10").streak).toBe(3);
  });

  it("стрик жив, если есть запись за вчера, но нет за сегодня", () => {
    const records = { "2026-03-09": rec(), "2026-03-08": rec() };
    const info = computeStreak(records, "2026-03-10");
    expect(info.streak).toBe(2);
    expect(info.isLost).toBe(false);
  });

  it("стрик потерян, если нет записей за сегодня и вчера", () => {
    const info = computeStreak({ "2026-03-01": rec() }, "2026-03-10");
    expect(info).toEqual({ streak: 0, isLost: true, isBeginner: false });
  });

  it("'cancel' прерывает стрик", () => {
    const records = {
      "2026-03-10": rec(),
      "2026-03-09": rec("cancel"),
      "2026-03-08": rec(),
    };
    expect(computeStreak(records, "2026-03-10").streak).toBe(1);
  });

  it("корректно переходит через границу месяца и года", () => {
    const records = {
      "2026-01-01": rec(),
      "2025-12-31": rec(),
      "2025-12-30": rec(),
    };
    expect(computeStreak(records, "2026-01-01").streak).toBe(3);
  });

  it("переход на летнее время не ломает счёт", () => {
    const records = {
      "2026-03-30": rec(),
      "2026-03-29": rec(),
      "2026-03-28": rec(),
    };
    expect(computeStreak(records, "2026-03-30").streak).toBe(3);
  });

  it("игнорирует записи из будущего", () => {
    const records = { "2026-03-12": rec(), "2026-03-10": rec() };
    expect(computeStreak(records, "2026-03-10").streak).toBe(1);
  });
});
