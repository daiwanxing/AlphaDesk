import { describe, expect, it } from "vitest";

import { createTurnoverApplication, type TurnoverDataProvider } from "./service";
import type { TurnoverRepository } from "../infrastructure/repository";

function cumulativeSeries(finalValue: number): Array<{ t: string; v: number }> {
  const points = Array.from({ length: 234 }, (_, index) => {
    const minutes = 9 * 60 + 30 + index;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return {
      t: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      v: (finalValue * (index + 1)) / 235,
    };
  });
  points.push({ t: "14:55", v: finalValue });
  return points;
}

function createProvider(): TurnoverDataProvider {
  return {
    async fetchTrends2() {
      throw new Error("trends unavailable");
    },
    async fetchDailyKlines(secId) {
      const values = {
        "1.000001": [100, 90],
        "0.399001": [200, 180],
        "0.899050": [50, 40],
      }[secId]!;
      return [
        { tradeDate: "2026-07-30", amount: values[1]! },
        { tradeDate: "2026-07-31", amount: values[0]! },
      ];
    },
    async fetchTencentDayMinuteSeries(secId) {
      const finalValues = {
        "1.000001": { "2026-07-31": 100, "2026-07-30": 90 },
        "0.399001": { "2026-07-31": 200, "2026-07-30": 180 },
      }[secId]!;
      return new Map(
        Object.entries(finalValues).map(([date, value]) => [date, cumulativeSeries(value)]),
      );
    },
  };
}

function trendsLines(day: string, amount: number): string[] {
  const lines = Array.from({ length: 234 }, (_, index) => {
    const minutes = 9 * 60 + 30 + index;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return `${day} ${time},0,0,0,0,0,${amount},0`;
  });
  lines.push(`${day} 14:55,0,0,0,0,0,${amount},0`);
  return lines;
}

function createLiveProvider(): TurnoverDataProvider {
  const marketAmounts = {
    "1.000001": { current: 10, previous: 1 },
    "0.399001": { current: 20, previous: 2 },
    "0.899050": { current: 30, previous: 3 },
  };
  return {
    async fetchTrends2(secId) {
      const amounts = marketAmounts[secId as keyof typeof marketAmounts]!;
      return [
        ...trendsLines("2026-07-31", amounts.previous),
        "2026-08-03 09:30,0,0,0,0,0," + amounts.current + ",0",
      ];
    },
    async fetchDailyKlines() {
      throw new Error("daily kline should not be required");
    },
    async fetchTencentDayMinuteSeries() {
      throw new Error("Tencent series should not be required");
    },
  };
}

describe("market turnover application service", () => {
  it("returns a complete historical snapshot when trends data is unavailable", async () => {
    const application = createTurnoverApplication({
      provider: createProvider(),
      repository: () => null,
    });

    const response = await application.buildResponse(new Date("2026-08-02T02:00:00.000Z"));

    expect(response).toMatchObject({
      ok: true,
      session: "weekend",
      compareMode: "vs_prev_same_time",
      snapshotTradeDate: "2026-07-31",
      asOf: "2026-07-31T15:00:00+08:00",
      total: {
        amount: 350,
        prevFullDayAmount: 310,
        prevSameTimeAmount: 310,
      },
      series: {
        tradeDate: "2026-07-31",
        prevTradeDate: "2026-07-30",
      },
    });
    expect(response.series.today).toHaveLength(235);
    expect(response.series.prev).toHaveLength(235);
  });

  it("uses the previous full-day series for live same-time comparison and updates the cache", async () => {
    const saved: {
      value: { tradeDate: string; points: Array<{ t: string; v: number }> } | null;
    } = { value: null };
    const repository: TurnoverRepository = {
      async loadTurnoverMeta() {
        return { _id: "turnover", prevBySecId: {}, updatedAt: "" };
      },
      async loadIntradayPrev() {
        return null;
      },
      async saveTurnoverMeta() {},
      async saveIntradayPrev(tradeDate, points) {
        saved.value = { tradeDate, points };
      },
    };
    const application = createTurnoverApplication({
      provider: createLiveProvider(),
      repository: () => repository,
    });

    const response = await application.buildResponse(new Date("2026-08-03T03:00:00.000Z"));

    expect(response).toMatchObject({
      session: "continuous",
      compareMode: "vs_prev_same_time",
      total: {
        amount: 60,
        prevFullDayAmount: 1410,
        prevSameTimeAmount: 6,
      },
      series: {
        tradeDate: "2026-08-03",
        prevTradeDate: "2026-07-31",
      },
    });
    expect(saved.value?.tradeDate).toBe("2026-07-31");
    expect(saved.value?.points).toHaveLength(235);
  });

  it("keeps the kline-only contract when the Tencent fallback has no data", async () => {
    const provider = createProvider();
    provider.fetchTencentDayMinuteSeries = async () => {
      throw new Error("Tencent unavailable");
    };
    const application = createTurnoverApplication({
      provider,
      repository: () => null,
    });

    const response = await application.buildResponse(new Date("2026-08-02T02:00:00.000Z"));

    expect(response).toMatchObject({
      compareMode: "vs_prev_full_day",
      disclaimer: "分时暂不可用 · 仅展示全天成交额",
      series: { today: [], prev: [] },
    });
  });
});
