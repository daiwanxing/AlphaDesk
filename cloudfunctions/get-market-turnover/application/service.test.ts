import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTurnoverApplication, type TurnoverDataProvider } from "./service";
import type { TurnoverProfileDoc } from "../domain/turnover-profile";
import type { TurnoverRepository } from "../infrastructure/repository";

const insightControl = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock("../domain/turnover-insight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../domain/turnover-insight")>();
  return {
    ...actual,
    computeTurnoverInsight(input: Parameters<typeof actual.computeTurnoverInsight>[0]) {
      if (insightControl.shouldThrow) throw new Error("insight exploded");
      return actual.computeTurnoverInsight(input);
    },
  };
});

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

const noProfileRepository: Pick<
  TurnoverRepository,
  | "loadTurnoverProfile"
  | "saveTurnoverProfile"
  | "listTurnoverProfiles"
  | "deleteTurnoverProfilesBefore"
> = {
  async loadTurnoverProfile() {
    return null;
  },
  async saveTurnoverProfile() {},
  async listTurnoverProfiles() {
    return [];
  },
  async deleteTurnoverProfilesBefore() {
    return 0;
  },
};

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

// ---------------------------------------------------------------------------
// turnoverInsight fixtures
// ---------------------------------------------------------------------------

function minuteRange(startHHmm: string, endHHmm: string): string[] {
  const toTotal = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h! * 60 + m!;
  };
  const out: string[] = [];
  for (let total = toTotal(startHHmm); total <= toTotal(endHHmm); total += 1) {
    out.push(
      `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

const TRADING_MINUTES = [...minuteRange("09:30", "11:30"), ...minuteRange("13:00", "15:00")];
const FULL_DAY_MINUTES = TRADING_MINUTES.length;

/** 每分钟成交额（元），三市合计 60/分钟 → 全天 60 × 242。 */
const PER_MINUTE_BY_SEC_ID: Record<string, number> = {
  "1.000001": 10,
  "0.399001": 20,
  "0.899050": 30,
};
const TOTAL_PER_MINUTE = 60;
const FULL_DAY_TOTAL = TOTAL_PER_MINUTE * FULL_DAY_MINUTES;

function minutesUpTo(lastT: string): string[] {
  return TRADING_MINUTES.filter((t) => t <= lastT);
}

function flatTrendsLines(day: string, perMinute: number, lastT: string): string[] {
  return minutesUpTo(lastT).map((t) => `${day} ${t},0,0,0,0,0,${perMinute},0`);
}

function linearCumulative(lastT: string, perMinute: number): Array<{ t: string; v: number }> {
  return minutesUpTo(lastT).map((t, index) => ({
    t,
    v: perMinute * (index + 1),
  }));
}

type InsightProviderOptions = {
  /** trends2 覆盖的交易日（所有市场一致） */
  days: Array<{ day: string; lastT: string }>;
  /** 有日 K 全天额的交易日 */
  klineDates?: string[];
  failKlines?: boolean;
};

function createInsightProvider(options: InsightProviderOptions): TurnoverDataProvider {
  return {
    async fetchTrends2(secId) {
      const perMinute = PER_MINUTE_BY_SEC_ID[secId]!;
      return options.days.flatMap(({ day, lastT }) => flatTrendsLines(day, perMinute, lastT));
    },
    async fetchDailyKlines(secId) {
      if (options.failKlines) throw new Error("daily kline unavailable");
      const perMinute = PER_MINUTE_BY_SEC_ID[secId]!;
      return (options.klineDates ?? []).map((tradeDate) => ({
        tradeDate,
        amount: perMinute * FULL_DAY_MINUTES,
      }));
    },
    async fetchTencentDayMinuteSeries() {
      return new Map();
    },
  };
}

/** 2026-07-15 起的 12 个工作日，全部早于 2026-08-03。 */
const HISTORY_DATES = [
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
];

function completeProfileDoc(tradeDate: string): TurnoverProfileDoc {
  const market = {
    points: linearCumulative("15:00", 20),
    fullDayAmount: 20 * FULL_DAY_MINUTES,
    source: "eastmoney",
  };
  return {
    docType: "turnover_profile",
    tradeDate,
    unit: "yuan",
    timeZone: "Asia/Shanghai",
    markets: { sh: market, sz: market, bj: market },
    total: {
      points: linearCumulative("15:00", TOTAL_PER_MINUTE),
      fullDayAmount: FULL_DAY_TOTAL,
    },
    quality: {
      schemaVersion: 1,
      status: "complete",
      completeMarkets: ["sh", "sz", "bj"],
      lastPoint: "15:00",
      validPointCount: FULL_DAY_MINUTES,
      expectedPointCount: FULL_DAY_MINUTES,
      source: "eastmoney",
    },
    generatedAt: `${tradeDate}T15:10:00+08:00`,
  };
}

function createRepository(overrides: Partial<TurnoverRepository> = {}): TurnoverRepository {
  return {
    async loadTurnoverMeta() {
      return { _id: "turnover", prevBySecId: {}, updatedAt: "" };
    },
    async saveTurnoverMeta() {},
    async loadIntradayPrev() {
      return null;
    },
    async saveIntradayPrev() {},
    ...noProfileRepository,
    ...overrides,
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
      value: {
        tradeDate: string;
        points: Array<{ t: string; v: number }>;
      } | null;
    } = { value: null };
    const repository = createRepository({
      async saveIntradayPrev(tradeDate, points) {
        saved.value = { tradeDate, points };
      },
    });
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

describe("market turnover turnoverInsight assembly", () => {
  const intradayDays = [
    { day: "2026-07-30", lastT: "15:00" },
    { day: "2026-07-31", lastT: "15:00" },
    { day: "2026-08-03", lastT: "10:29" },
  ];
  /** 2026-08-03 10:30 上海 */
  const at1030 = new Date("2026-08-03T02:30:00.000Z");

  beforeEach(() => {
    insightControl.shouldThrow = false;
  });

  it("uses the profile baseline once at least ten complete profiles exist", async () => {
    const profiles = HISTORY_DATES.map(completeProfileDoc);
    const application = createTurnoverApplication({
      provider: createInsightProvider({ days: intradayDays }),
      repository: () =>
        createRepository({
          async listTurnoverProfiles() {
            return profiles;
          },
        }),
    });

    const response = await application.buildResponse(at1030);

    expect(response.turnoverInsight).toMatchObject({
      status: "active",
      paceState: "normal",
      effectiveTime: "10:29",
      baseline: {
        method: "median_intraday_progress_v1",
        quality: "active",
        sampleDays: 12,
      },
    });
    expect(response.turnoverInsight?.paceRatio).toBeCloseTo(1, 10);
    expect(response.turnoverInsight?.projectedFullDayAmount).toBeCloseTo(FULL_DAY_TOTAL, 6);
  });

  it("bootstraps from day-K scale and short-window shape when the profile store is empty", async () => {
    const application = createTurnoverApplication({
      provider: createInsightProvider({
        days: intradayDays,
        klineDates: HISTORY_DATES.concat("2026-07-31"),
      }),
      repository: () => createRepository(),
    });

    const response = await application.buildResponse(at1030);

    expect(response.ok).toBe(true);
    expect(response.turnoverInsight).toMatchObject({
      status: "active",
      paceState: "normal",
      effectiveTime: "10:29",
      baseline: {
        method: "kline_scale_short_shape_v1",
        quality: "bootstrap",
        sampleDays: 0,
        shapeDays: 2,
        scaleDays: 13,
      },
    });
    expect(response.turnoverInsight?.baseline?.quality).not.toBe("active");
    expect(response.turnoverInsight?.paceRatio).toBeCloseTo(1, 10);
  });

  it("keeps the base response intact when the profile store and day-K both fail", async () => {
    const scopes: string[] = [];
    const application = createTurnoverApplication({
      provider: createInsightProvider({ days: intradayDays, failKlines: true }),
      repository: () =>
        createRepository({
          async listTurnoverProfiles() {
            throw new Error("index missing");
          },
        }),
      onError: (scope) => scopes.push(scope),
    });

    const response = await application.buildResponse(at1030);

    expect(response.ok).toBe(true);
    expect(response.markets).toHaveLength(3);
    expect(response.series.today).toHaveLength(60);
    expect(response.series.prev.length).toBeGreaterThan(0);
    expect(response.turnoverInsight).toMatchObject({
      status: "unavailable",
      reason: "insufficient_shape_days",
    });
    expect(scopes).toContain("turnoverInsight profiles unavailable");
    expect(scopes).toContain("turnoverInsight scale unavailable");
  });

  it("omits the insight without failing the response when the computation throws", async () => {
    insightControl.shouldThrow = true;
    const scopes: string[] = [];
    const application = createTurnoverApplication({
      provider: createInsightProvider({
        days: intradayDays,
        klineDates: HISTORY_DATES,
      }),
      repository: () => createRepository(),
      onError: (scope) => scopes.push(scope),
    });

    const response = await application.buildResponse(at1030);

    expect(response.ok).toBe(true);
    expect(response.markets).toHaveLength(3);
    expect(response.series.today).toHaveLength(60);
    expect(response.turnoverInsight).toBeUndefined();
    expect(scopes).toContain("turnoverInsight");
  });

  it("stays warming up before the earliest prediction time", async () => {
    const application = createTurnoverApplication({
      provider: createInsightProvider({
        days: [
          { day: "2026-07-31", lastT: "15:00" },
          { day: "2026-08-03", lastT: "09:39" },
        ],
        klineDates: HISTORY_DATES,
      }),
      repository: () => createRepository(),
    });

    // 2026-08-03 09:40 上海
    const response = await application.buildResponse(new Date("2026-08-03T01:40:00.000Z"));

    expect(response.turnoverInsight).toMatchObject({
      status: "warming_up",
      effectiveTime: "09:39",
    });
  });

  it("reports the actual full-day amount after the close", async () => {
    const application = createTurnoverApplication({
      provider: createInsightProvider({
        days: [
          { day: "2026-07-31", lastT: "15:00" },
          { day: "2026-08-03", lastT: "15:00" },
        ],
        klineDates: HISTORY_DATES,
      }),
      repository: () => createRepository(),
    });

    // 2026-08-03 15:30 上海
    const response = await application.buildResponse(new Date("2026-08-03T07:30:00.000Z"));

    expect(response.session).toBe("closed");
    expect(response.turnoverInsight).toMatchObject({
      status: "final",
      effectiveTime: "15:00",
      actualFullDayAmount: FULL_DAY_TOTAL,
    });
  });
});
