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

const activeInsightSnapshot = {
  ...preOpenSnapshot,
  session: "continuous",
  asOf: "2026-08-04T10:30:00+08:00",
  turnoverInsight: {
    status: "active",
    paceState: "expanding",
    effectiveTime: "2026-08-04T10:30:00+08:00",
    paceRatio: 1.12,
    projectedFullDayAmount: 12_500,
    projectedRange: { low: 11_800, high: 13_200 },
    baseline: {
      windowDays: 20,
      sampleDays: 18,
      shapeDays: 12,
      scaleDays: 18,
      firstTradeDate: "2026-07-08",
      lastTradeDate: "2026-08-01",
      method: "median_intraday_progress_v1",
      quality: "active",
    },
    asOf: "2026-08-04T10:30:00+08:00",
  },
} satisfies MarketTurnoverResponse;

const warmingUpInsightSnapshot = {
  ...preOpenSnapshot,
  turnoverInsight: {
    status: "warming_up",
    effectiveTime: "2026-08-04T09:35:00+08:00",
    asOf: "2026-08-04T09:35:00+08:00",
  },
} satisfies MarketTurnoverResponse;

const unavailableInsightSnapshot = {
  ...preOpenSnapshot,
  turnoverInsight: {
    status: "unavailable",
    reason: "profile_missing",
    effectiveTime: "2026-08-04T10:30:00+08:00",
    asOf: "2026-08-04T10:30:00+08:00",
  },
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

  it("accepts an active turnoverInsight with paceState and baseline", () => {
    expect(activeInsightSnapshot.turnoverInsight?.status).toBe("active");
    expect(activeInsightSnapshot.turnoverInsight?.paceState).toBe("expanding");
    expect(activeInsightSnapshot.turnoverInsight?.baseline?.method).toBe(
      "median_intraday_progress_v1",
    );
  });

  it("accepts minimal warming_up and unavailable turnoverInsight shapes", () => {
    expect(warmingUpInsightSnapshot.turnoverInsight?.status).toBe("warming_up");
    expect(warmingUpInsightSnapshot.turnoverInsight?.paceState).toBeUndefined();
    expect(unavailableInsightSnapshot.turnoverInsight?.status).toBe("unavailable");
    expect(unavailableInsightSnapshot.turnoverInsight?.reason).toBe("profile_missing");
  });
});
