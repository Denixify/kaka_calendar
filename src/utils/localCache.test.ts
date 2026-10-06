import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKeys, loadUserCache } from "./localCache";

function stubLocalStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe("loadUserCache", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("старые общие ключи не переходят новому пользователю и удаляются", () => {
    const store = stubLocalStorage({
      "pt-achievements": JSON.stringify(["friend_4"]),
      "poop-tracker-data": JSON.stringify({
        "2026-01-01": { status: "happy" },
      }),
      "pt-last-restore": "123",
    });

    const cache = loadUserCache("new-user");

    expect(cache.achievements).toEqual([]);
    expect(cache.records).toEqual({});
    expect(cache.lastRestore).toBe(0);
    expect(store.has("pt-achievements")).toBe(false);
    expect(store.has("poop-tracker-data")).toBe(false);
  });

  it("кэш разных пользователей не пересекается", () => {
    stubLocalStorage({
      [cacheKeys.achievements("a")]: JSON.stringify(["streak_1"]),
      [cacheKeys.achievements("b")]: JSON.stringify(["friend_1"]),
    });
    expect(loadUserCache("a").achievements).toEqual(["streak_1"]);
    expect(loadUserCache("b").achievements).toEqual(["friend_1"]);
    expect(loadUserCache("c").achievements).toEqual([]);
  });
});
