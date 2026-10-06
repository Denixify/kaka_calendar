import type { Records } from "../components/PoopTracker";

export const cacheKeys = {
  records: (uid: string) => `pt-records-${uid}`,
  achievements: (uid: string) => `pt-achievements-${uid}`,
  lastRestore: (uid: string) => `pt-last-restore-${uid}`,
};

const LEGACY = {
  records: "poop-tracker-data",
  achievements: "pt-achievements",
  lastRestore: "pt-last-restore",
};

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    //
  }
}

export function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    //
  }
}

export function normalizeRecords(raw: unknown): Records {
  const result: Records = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") {
      result[key] = {
        status: val as Records[string]["status"],
        count: "",
        quality: null,
      };
    } else if (val && typeof val === "object") {
      result[key] = val as Records[string];
    }
  }
  return result;
}

function readJson<T>(key: string): T | null {
  const raw = safeGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function purgeLegacyCache() {
  safeRemove(LEGACY.records);
  safeRemove(LEGACY.achievements);
  safeRemove(LEGACY.lastRestore);
}

export function loadUserCache(uid: string): {
  records: Records;
  achievements: string[];
  lastRestore: number;
} {
  purgeLegacyCache();

  const records = readJson<unknown>(cacheKeys.records(uid));
  const achievements = readJson<string[]>(cacheKeys.achievements(uid));
  const lastRestore = Number(safeGet(cacheKeys.lastRestore(uid)) || 0) || 0;

  return {
    records: normalizeRecords(records),
    achievements: Array.isArray(achievements) ? achievements : [],
    lastRestore,
  };
}
