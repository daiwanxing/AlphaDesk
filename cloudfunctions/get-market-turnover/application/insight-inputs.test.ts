import { afterEach, describe, expect, it, vi } from "vitest";

import type { TurnoverProfileDoc } from "../domain/turnover-profile";
import type { TurnoverRepository } from "../infrastructure/repository";
import type { TurnoverPoint } from "../series";
import { __resetProfileListCacheForTests, assembleInsightInputs } from "./insight-inputs";
import type { TurnoverDataProvider } from "./service";

afterEach(() => {
  __resetProfileListCacheForTests();
});

function points(n: number): TurnoverPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    t: `09:${String(30 + i).padStart(2, "0")}`,
    v: (i + 1) * 10,
  }));
}

function stubProfile(tradeDate: string): TurnoverProfileDoc {
  const market = {
    points: points(5),
    fullDayAmount: 100,
    source: "eastmoney",
  };
  return {
    docType: "turnover_profile",
    tradeDate,
    unit: "yuan",
    timeZone: "Asia/Shanghai",
    markets: { sh: market, sz: market, bj: market },
    total: { points: points(5), fullDayAmount: 300 },
    quality: {
      schemaVersion: 1,
      status: "complete",
      completeMarkets: ["sh", "sz", "bj"],
      lastPoint: "15:00",
      validPointCount: 5,
      expectedPointCount: 5,
      source: "eastmoney",
    },
    generatedAt: `${tradeDate}T15:10:00+08:00`,
  };
}

describe("assembleInsightInputs profile list TTL", () => {
  it("reuses listTurnoverProfiles within the TTL window", async () => {
    let listCalls = 0;
    const repository = {
      async listTurnoverProfiles() {
        listCalls += 1;
        return [stubProfile("2026-07-30"), stubProfile("2026-07-31")];
      },
    } as Pick<TurnoverRepository, "listTurnoverProfiles"> as TurnoverRepository;

    const provider = {
      async fetchTrends2() {
        return [];
      },
      async fetchDailyKlines() {
        return [];
      },
      async fetchTencentDayMinuteSeries() {
        return new Map();
      },
    } satisfies TurnoverDataProvider;

    const args = {
      tradeDate: "2026-08-03",
      provider,
      repository,
    };

    await assembleInsightInputs(args);
    await assembleInsightInputs(args);
    expect(listCalls).toBe(1);
  });
});

describe("assembleInsightInputs seriesByMarket shape reuse", () => {
  it("builds shape days from seriesByMarket without calling fetchTrends2", async () => {
    const fetchTrends2 = vi.fn(async () => {
      throw new Error("trends should not be called");
    });
    const provider: TurnoverDataProvider = {
      fetchTrends2,
      async fetchDailyKlines() {
        // Per-market amount; loadKlineScale sums three markets → 300.
        return [
          { tradeDate: "2026-07-30", amount: 100 },
          { tradeDate: "2026-07-31", amount: 100 },
        ];
      },
      async fetchTencentDayMinuteSeries() {
        return new Map();
      },
    };

    const dayPoints = points(3);
    const seriesByMarket = [
      new Map([
        ["2026-07-30", dayPoints],
        ["2026-07-31", dayPoints],
        ["2026-08-03", dayPoints],
      ]),
      new Map([
        ["2026-07-30", dayPoints],
        ["2026-07-31", dayPoints],
        ["2026-08-03", dayPoints],
      ]),
      new Map([
        ["2026-07-30", dayPoints],
        ["2026-07-31", dayPoints],
        ["2026-08-03", dayPoints],
      ]),
    ];

    const inputs = await assembleInsightInputs({
      tradeDate: "2026-08-03",
      provider,
      repository: null,
      seriesByMarket,
    });

    expect(fetchTrends2).not.toHaveBeenCalled();
    expect(inputs.shapeDays.map((d) => d.tradeDate)).toEqual(["2026-07-30", "2026-07-31"]);
    expect(inputs.scaleFullDayAmounts).toEqual([300, 300]);
  });
});
