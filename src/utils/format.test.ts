import { describe, expect, it } from "vitest";
import { DAY_FORMS, pluralRu } from "./format";

describe("pluralRu", () => {
  it.each([
    [0, "дней"],
    [1, "день"],
    [2, "дня"],
    [4, "дня"],
    [5, "дней"],
    [11, "дней"],
    [12, "дней"],
    [14, "дней"],
    [21, "день"],
    [22, "дня"],
    [25, "дней"],
    [101, "день"],
    [111, "дней"],
  ])("%i → %s", (n, expected) => {
    expect(pluralRu(n, DAY_FORMS)).toBe(expected);
  });
});
