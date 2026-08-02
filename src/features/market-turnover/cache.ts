import type { MarketTurnoverResponse } from "./types";

const STORAGE_KEY = "investor:market-turnover:v1";

let memoryCache: MarketTurnoverResponse | null = null;

export function peekTurnoverMemoryCache(): MarketTurnoverResponse | null {
  return memoryCache;
}

function readTurnoverStorage(): MarketTurnoverResponse | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketTurnoverResponse;
    if (parsed?.ok !== true || !Array.isArray(parsed.markets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Memory first, then localStorage. Reading storage does not warm memory (so cold reload can still probe). */
export function readTurnoverCache(): MarketTurnoverResponse | null {
  return memoryCache ?? readTurnoverStorage();
}

export function writeTurnoverCache(data: MarketTurnoverResponse): void {
  memoryCache = data;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode — memory still works for SPA
  }
}

/** Cheap probe equality — asOf + amounts; avoids full JSON.stringify on every poll. */
export function turnoverDataEqual(
  a: MarketTurnoverResponse | null | undefined,
  b: MarketTurnoverResponse | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.asOf !== b.asOf || a.session !== b.session || a.total.amount !== b.total.amount) {
    return false;
  }
  if (a.markets.length !== b.markets.length) return false;
  return a.markets.every(
    (m, i) =>
      m.id === b.markets[i]?.id &&
      m.amount === b.markets[i]?.amount &&
      m.delta === b.markets[i]?.delta,
  );
}

export function clearTurnoverCacheForTests(): void {
  memoryCache = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
