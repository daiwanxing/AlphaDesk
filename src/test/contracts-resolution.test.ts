import { describe, expect, it } from "vitest";
import type { MarketTurnoverResponse } from "@contracts/market-turnover";

const fixture = {
  ok: true,
  asOf: "2026-08-03T09:30:00+08:00",
  session: "continuous",
  compareMode: "vs_prev_same_time",
  disclaimer: "同时刻累计对比",
  markets: [],
  total: {
    amount: 100,
    prevFullDayAmount: 90,
    prevSameTimeAmount: 80,
    delta: 20,
    deltaPct: 25,
  },
  series: {
    tradeDate: "2026-08-03",
    prevTradeDate: "2026-07-31",
    today: [],
    prev: [],
  },
} satisfies MarketTurnoverResponse;

describe("contracts resolution", () => {
  it("resolves the shared contract from the frontend boundary", () => {
    expect(fixture.series.today).toEqual([]);
  });
});
