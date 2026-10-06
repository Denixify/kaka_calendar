import { describe, expect, it } from "vitest";
import { parseDateKey, shiftDateKey, toDateKey } from "./dates";

describe("dates", () => {
  it("toDateKey дополняет нулями", () => {
    expect(toDateKey(2026, 0, 5)).toBe("2026-01-05");
  });

  it("parseDateKey даёт локальную полночь нужной даты", () => {
    const d = parseDateKey("2026-03-10");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 10]);
    expect(d.getHours()).toBe(0);
  });

  it("shiftDateKey двигает дату в обе стороны", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDateKey("2025-12-31", 1)).toBe("2026-01-01");
  });
});
