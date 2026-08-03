// keep in sync with src/features/market-turnover/session.ts

import type { MarketSession as MarketSessionContract } from "@contracts/market-turnover" with {
  "resolution-mode": "import",
};

export type MarketSession = MarketSessionContract;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiParts(now: Date): { minutes: number; dayOfWeek: number } {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const hours = shifted.getUTCHours();
  const mins = shifted.getUTCMinutes();
  return { minutes: hours * 60 + mins, dayOfWeek: shifted.getUTCDay() };
}

export function resolveMarketSession(now: Date): MarketSessionContract {
  const { minutes, dayOfWeek } = shanghaiParts(now);

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return "weekend";
  }

  const openMorning = 9 * 60 + 30;
  const lunchStart = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const close = 15 * 60;

  if (minutes < openMorning) {
    return "pre_open";
  }
  if (minutes < lunchStart) {
    return "continuous";
  }
  if (minutes < afternoonOpen) {
    return "lunch";
  }
  if (minutes < close) {
    return "continuous";
  }
  return "closed";
}
