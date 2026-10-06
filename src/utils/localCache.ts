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

export function loadUserCache(uid: string): {
  records: Records;
  achievements: string[];
  lastRestore: number;
} {
  let records = readJson<unknown>(cacheKeys.records(uid));
  if (records === null) {
    records = readJson<unknown>(LEGACY.records);
    if (records !== null) {
      safeSet(cacheKeys.records(uid), JSON.stringify(records));
      safeRemove(LEGACY.records);
    }
  }

  let achievements = readJson<string[]>(cacheKeys.achievements(uid));
  if (achievements === null) {
    achievements = readJson<string[]>(LEGACY.achievements);
    if (achievements !== null) {
      safeSet(cacheKeys.achievements(uid), JSON.stringify(achievements));
      safeRemove(LEGACY.achievements);
    }
  }

  let lastRestoreRaw = safeGet(cacheKeys.lastRestore(uid));
  if (lastRestoreRaw === null) {
    lastRestoreRaw = safeGet(LEGACY.lastRestore);
    if (lastRestoreRaw !== null) {
      safeSet(cacheKeys.lastRestore(uid), lastRestoreRaw);
      safeRemove(LEGACY.lastRestore);
    }
  }

  return {
    records: normalizeRecords(records),
    achievements: Array.isArray(achievements) ? achievements : [],
    lastRestore: Number(lastRestoreRaw || 0) || 0,
  };
}
