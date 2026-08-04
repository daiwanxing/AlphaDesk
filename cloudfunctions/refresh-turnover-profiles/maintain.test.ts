import { describe, expect, it, vi } from "vitest";

import type { TurnoverDataProvider } from "../get-market-turnover/application/service";
import { TRADING_MINUTES } from "../get-market-turnover/domain/trading-minutes";
import type { TurnoverProfileDoc } from "../get-market-turnover/domain/turnover-profile";
import type { TurnoverRepository } from "../get-market-turnover/infrastructure/repository";
import { maintainTurnoverProfiles } from "./maintain";

const NOW = new Date("2026-08-03T07:10:00.000Z"); // 15:10 Asia/Shanghai

const FULL_DAY_AMOUNT: Record<string, number> = {
  "1.000001": 600_000_000_000,
  "0.399001": 700_000_000_000,
  "0.899050": 20_000_000_000,
};

/** trends2 行第 7 段是当分钟成交额，累计后终点即全天额。 */
function trendsLines(day: string, fullDayAmount: number, minuteCount = TRADING_MINUTES.length) {
  const perMinute = fullDayAmount / minuteCount;
  return TRADING_MINUTES.slice(0, minuteCount).map((t) => `${day} ${t},0,0,0,0,0,${perMinute},0`);
}

type ProviderOverrides = {
  days?: string[];
  minuteCountByDay?: Record<string, number>;
  trendsFailsFor?: string[];
  tencentDays?: string[];
};

function createProvider(overrides: ProviderOverrides = {}): TurnoverDataProvider {
  const days = overrides.days ?? ["2026-07-31", "2026-08-03"];
  const minuteCountByDay = overrides.minuteCountByDay ?? {};

  return {
    async fetchTrends2(secId) {
      if (overrides.trendsFailsFor?.includes(secId)) {
        throw new Error(`trends2 down for ${secId}`);
      }
      return days.flatMap((day) =>
        trendsLines(day, FULL_DAY_AMOUNT[secId]!, minuteCountByDay[day]),
      );
    },
    async fetchDailyKlines(secId) {
      return days.map((day) => ({
        tradeDate: day,
        amount: FULL_DAY_AMOUNT[secId]!,
      }));
    },
    async fetchTencentDayMinuteSeries(secId) {
      const tencentDays = overrides.tencentDays ?? days;
      return new Map(
        tencentDays.map((day) => [
          day,
          TRADING_MINUTES.map((t, index) => ({
            t,
            v: (FULL_DAY_AMOUNT[secId]! * (index + 1)) / TRADING_MINUTES.length,
          })),
        ]),
      );
    },
  };
}

function createRepository(seed: TurnoverProfileDoc[] = []): {
  repository: TurnoverRepository;
  saved: Map<string, TurnoverProfileDoc>;
  deletedBefore: string[];
} {
  const saved = new Map<string, TurnoverProfileDoc>(
    seed.map((profile) => [profile.tradeDate, profile]),
  );
  const deletedBefore: string[] = [];

  const repository: TurnoverRepository = {
    loadTurnoverMeta: vi.fn(),
    saveTurnoverMeta: vi.fn(),
    loadIntradayPrev: vi.fn(),
    saveIntradayPrev: vi.fn(),
    async loadTurnoverProfile(tradeDate) {
      return saved.get(tradeDate) ?? null;
    },
    async saveTurnoverProfile(profile) {
      saved.set(profile.tradeDate, profile);
    },
    async listTurnoverProfiles(limit) {
      return [...saved.values()]
        .sort((left, right) => right.tradeDate.localeCompare(left.tradeDate))
        .slice(0, limit);
    },
    async deleteTurnoverProfilesBefore(tradeDate) {
      deletedBefore.push(tradeDate);
      const stale = [...saved.keys()].filter((date) => date < tradeDate);
      for (const date of stale) saved.delete(date);
      return stale.length;
    },
  } as TurnoverRepository;

  return { repository, saved, deletedBefore };
}

function completeProfile(tradeDate: string): TurnoverProfileDoc {
  return {
    docType: "turnover_profile",
    tradeDate,
    unit: "yuan",
    timeZone: "Asia/Shanghai",
    markets: {} as TurnoverProfileDoc["markets"],
    total: { points: [], fullDayAmount: 0 },
    quality: {
      schemaVersion: 1,
      status: "complete",
      completeMarkets: ["sh", "sz", "bj"],
      validPointCount: TRADING_MINUTES.length,
      expectedPointCount: TRADING_MINUTES.length,
      source: "seed",
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("maintainTurnoverProfiles", () => {
  it("saves a complete profile for every fully covered trading day", async () => {
    const { repository, saved } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider(),
      repository,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("daily");
    expect(result.savedDates).toEqual(["2026-07-31", "2026-08-03"]);
    expect(saved.get("2026-08-03")?.quality.status).toBe("complete");
    expect(saved.get("2026-08-03")?.quality.completeMarkets).toEqual(["sh", "sz", "bj"]);
    expect(saved.get("2026-08-03")?.total.points).toHaveLength(TRADING_MINUTES.length);
  });

  it("skips days whose minute coverage is too short to be complete", async () => {
    const { repository, saved } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider({ minuteCountByDay: { "2026-07-31": 100 } }),
      repository,
      now: NOW,
    });

    expect(result.savedDates).toEqual(["2026-08-03"]);
    expect(result.skipped).toEqual([{ tradeDate: "2026-07-31", reason: "degraded" }]);
    expect(saved.has("2026-07-31")).toBe(false);
  });

  it("stores incomplete days for diagnostics when saveDegraded is on", async () => {
    const { repository, saved } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider({ minuteCountByDay: { "2026-07-31": 100 } }),
      repository,
      now: NOW,
      saveDegraded: true,
    });

    expect(result.degradedDates).toEqual(["2026-07-31"]);
    expect(saved.get("2026-07-31")?.quality.status).toBe("degraded");
  });

  it("is idempotent: an already-complete day is not rewritten", async () => {
    const seeded = completeProfile("2026-07-31");
    const { repository, saved } = createRepository([seeded]);

    const result = await maintainTurnoverProfiles({
      provider: createProvider(),
      repository,
      mode: "seed",
      now: NOW,
    });

    expect(result.mode).toBe("seed");
    expect(result.savedDates).toEqual(["2026-08-03"]);
    expect(result.skipped).toEqual([{ tradeDate: "2026-07-31", reason: "already_complete" }]);
    expect(saved.get("2026-07-31")).toBe(seeded);
  });

  it("ignores days after today so a mid-session run cannot poison the baseline", async () => {
    const { repository } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider({ days: ["2026-08-03", "2026-08-04"] }),
      repository,
      now: NOW,
    });

    expect(result.savedDates).toEqual(["2026-08-03"]);
  });

  it("falls back to Tencent minutes when eastmoney trends fail for hu/shen", async () => {
    const { repository, saved } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider({ trendsFailsFor: ["1.000001", "0.399001"] }),
      repository,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.savedDates).toEqual(["2026-07-31", "2026-08-03"]);
    expect(saved.get("2026-08-03")?.markets.sh.source).toBe("tencent_day_minute");
  });

  it("keeps the day degraded when only a scaled Beijing series is available", async () => {
    const { repository, saved } = createRepository();

    const result = await maintainTurnoverProfiles({
      provider: createProvider({ trendsFailsFor: ["0.899050"] }),
      repository,
      now: NOW,
      saveDegraded: true,
    });

    expect(result.degradedDates).toEqual(["2026-07-31", "2026-08-03"]);
    expect(saved.get("2026-08-03")?.markets.bj.source).toBe("scaled_from_hs");
    expect(saved.get("2026-08-03")?.quality.completeMarkets).toEqual(["sh", "sz"]);
  });

  it("prunes complete profiles older than the newest 60", async () => {
    const seedDates = Array.from({ length: 62 }, (_, index) =>
      new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
    );
    const { repository, deletedBefore, saved } = createRepository(seedDates.map(completeProfile));

    const result = await maintainTurnoverProfiles({
      provider: createProvider(),
      repository,
      now: NOW,
    });

    const expectedCutoff = [...seedDates, "2026-07-31", "2026-08-03"].sort((left, right) =>
      right.localeCompare(left),
    )[59]!;

    expect(deletedBefore).toEqual([expectedCutoff]);
    expect(result.pruned).toBe(4);
    expect(saved.size).toBe(60);
  });

  it("does not throw when the repository list fails", async () => {
    const { repository } = createRepository();
    repository.listTurnoverProfiles = async () => {
      throw new Error("index missing");
    };

    const result = await maintainTurnoverProfiles({
      provider: createProvider(),
      repository,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes("index missing"))).toBe(true);
    expect(result.savedDates).toEqual(["2026-07-31", "2026-08-03"]);
  });
});
