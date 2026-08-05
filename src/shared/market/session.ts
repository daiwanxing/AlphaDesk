import type { MarketSession } from "@contracts/market-turnover";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function resolveMarketSession(now: Date): MarketSession {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const dayOfWeek = shifted.getUTCDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend";
  if (minutes < 9 * 60 + 30) return "pre_open";
  if (minutes < 11 * 60 + 30) return "continuous";
  if (minutes < 13 * 60) return "lunch";
  if (minutes < 15 * 60) return "continuous";
  return "closed";
}
