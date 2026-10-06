import { describe, expect, it } from "vitest";
import {
  MAX_COUNT_PER_DAY,
  calculateDuelScore,
  calculateRecordScore,
} from "./duelScoring";

describe("calculateRecordScore", () => {
  it("пустая запись — 0", () => {
    expect(calculateRecordScore(undefined)).toBe(0);
  });

  it("happy + soft + 1 поход = 3 + 3 + 1", () => {
    expect(
      calculateRecordScore({ status: "happy", quality: "soft", count: "1" }),
    ).toBe(7);
  });

  it("пустой count считается как 1", () => {
    expect(
      calculateRecordScore({ status: "neutral", quality: null, count: "" }),
    ).toBe(2);
  });

  it("количество ограничено, чтобы нельзя было накрутить очки", () => {
    expect(
      calculateRecordScore({ status: "neutral", quality: null, count: "999" }),
    ).toBe(1 + MAX_COUNT_PER_DAY);
  });

  it("cancel штрафуется и не добавляет count", () => {
    expect(
      calculateRecordScore({ status: "cancel", quality: null, count: "3" }),
    ).toBe(-2);
  });
});

describe("calculateDuelScore", () => {
  it("суммирует только дни внутри периода дуэли", () => {
    const records = {
      "2020-01-01": { status: "happy", quality: null, count: "" },
      "2020-01-02": { status: "happy", quality: null, count: "" },
      "2020-01-04": { status: "happy", quality: null, count: "" },
    } as const;
    const start = new Date(2020, 0, 2, 12).getTime();
    const end = new Date(2020, 0, 3, 12).getTime();
    expect(calculateDuelScore({ ...records }, start, end)).toBe(4);
  });
});
