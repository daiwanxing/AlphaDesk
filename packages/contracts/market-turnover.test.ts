import { describe, expect, it } from "vitest";
import type {
  CompareMode,
  MarketId,
  MarketSession,
  MarketTurnoverResponse,
} from "./market-turnover";

const preOpenSnapshot = {
  ok: true,
  asOf: "2026-08-03T09:29:00+08:00",
  session: "pre_open",
  compareMode: "vs_prev_full_day",
  disclaimer: "休市快照对比",
  markets: [
    {
      id: "sh",
      label: "沪市",
      source: "上证指数",
      amount: 2_100,
      prevFullDayAmount: 2_000,
      delta: 100,
      deltaPct: 0.05,
    },
  ],
  total: {
    amount: 2_100,
    prevFullDayAmount: 2_000,
    prevSameTimeAmount: 0,
    delta: 100,
    deltaPct: 0.05,
  },
  series: {
    tradeDate: "2026-07-31",
    prevTradeDate: "2026-07-30",
    today: [],
    prev: [],
  },
  snapshotTradeDate: "2026-07-31",
} satisfies MarketTurnoverResponse;

const sessions: MarketSession[] = ["pre_open", "continuous", "lunch", "closed", "weekend"];
const marketIds: MarketId[] = ["sh", "sz", "bj"];
const compareModes: CompareMode[] = ["vs_prev_same_time", "vs_prev_full_day"];

describe("market-turnover contracts", () => {
  it("preserves the empty-series pre-open snapshot shape", () => {
    expect(preOpenSnapshot.series.today).toEqual([]);
    expect(preOpenSnapshot.series.prev).toEqual([]);
    expect(preOpenSnapshot.snapshotTradeDate).toBe("2026-07-31");
  });

  it("keeps the public enums finite", () => {
    expect(sessions).toHaveLength(5);
    expect(marketIds).toEqual(["sh", "sz", "bj"]);
    expect(compareModes).toEqual(["vs_prev_same_time", "vs_prev_full_day"]);
  });
});
