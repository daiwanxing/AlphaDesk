import type {
  MarketTurnoverResponse,
  TurnoverInsight,
  TurnoverPoint,
} from "@contracts/market-turnover";

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

function pointsEqual(a: TurnoverPoint[] | undefined, b: TurnoverPoint[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    return other?.t === point.t && other.v === point.v;
  });
}

function insightEqual(a: TurnoverInsight | undefined, b: TurnoverInsight | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (
    a.status !== b.status ||
    a.paceState !== b.paceState ||
    a.effectiveTime !== b.effectiveTime ||
    a.paceRatio !== b.paceRatio ||
    a.reason !== b.reason ||
    a.actualFullDayAmount !== b.actualFullDayAmount ||
    a.projectedFullDayAmount !== b.projectedFullDayAmount
  ) {
    return false;
  }
  const aRange = a.projectedRange;
  const bRange = b.projectedRange;
  if (aRange !== bRange) {
    if (!aRange || !bRange) return false;
    if (aRange.low !== bRange.low || aRange.high !== bRange.high) return false;
  }
  const aBaseline = a.baseline;
  const bBaseline = b.baseline;
  if (aBaseline !== bBaseline) {
    if (!aBaseline || !bBaseline) return false;
    if (
      aBaseline.method !== bBaseline.method ||
      aBaseline.quality !== bBaseline.quality ||
      aBaseline.sampleDays !== bBaseline.sampleDays ||
      aBaseline.shapeDays !== bBaseline.shapeDays ||
      aBaseline.scaleDays !== bBaseline.scaleDays
    ) {
      return false;
    }
  }
  return true;
}

/** Probe equality — compares all semantic fields and sequence points before skipping a render. */
export function turnoverDataEqual(
  a: MarketTurnoverResponse | null | undefined,
  b: MarketTurnoverResponse | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.session !== b.session ||
    a.compareMode !== b.compareMode ||
    a.disclaimer !== b.disclaimer ||
    a.total.amount !== b.total.amount ||
    a.total.prevFullDayAmount !== b.total.prevFullDayAmount ||
    a.total.prevSameTimeAmount !== b.total.prevSameTimeAmount ||
    a.total.delta !== b.total.delta ||
    a.total.deltaPct !== b.total.deltaPct ||
    a.series.tradeDate !== b.series.tradeDate ||
    a.series.prevTradeDate !== b.series.prevTradeDate ||
    a.snapshotTradeDate !== b.snapshotTradeDate
  ) {
    return false;
  }
  if (!pointsEqual(a.series?.today, b.series?.today)) return false;
  if (!pointsEqual(a.series?.prev, b.series?.prev)) return false;
  if (a.markets.length !== b.markets.length) return false;
  if (
    !a.markets.every(
      (m, i) =>
        m.id === b.markets[i]?.id &&
        m.label === b.markets[i]?.label &&
        m.source === b.markets[i]?.source &&
        m.amount === b.markets[i]?.amount &&
        m.prevFullDayAmount === b.markets[i]?.prevFullDayAmount &&
        m.delta === b.markets[i]?.delta &&
        m.deltaPct === b.markets[i]?.deltaPct,
    )
  ) {
    return false;
  }
  return insightEqual(a.turnoverInsight, b.turnoverInsight);
}

export function clearTurnoverCacheForTests(): void {
  memoryCache = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
