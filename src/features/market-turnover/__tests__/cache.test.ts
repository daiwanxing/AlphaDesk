import { afterEach, describe, expect, it } from "vitest";
import {
  clearTurnoverCacheForTests,
  peekTurnoverMemoryCache,
  readTurnoverCache,
  turnoverDataEqual,
  writeTurnoverCache,
} from "../cache";
import type { MarketTurnoverResponse } from "@contracts/market-turnover";

const sample: MarketTurnoverResponse = {
  ok: true,
  asOf: "2026-08-01T15:00:00+08:00",
  session: "weekend",
  compareMode: "vs_prev_full_day",
  disclaimer: "盘中对比昨收全天 · 非同时刻",
  markets: [
    {
      id: "sh",
      label: "沪市",
      source: "东财",
      amount: 1,
      prevFullDayAmount: 1,
      delta: 0,
      deltaPct: 0,
    },
  ],
  total: {
    amount: 1,
    prevFullDayAmount: 1,
    prevSameTimeAmount: 0.9,
    delta: 0,
    deltaPct: 0,
  },
  series: {
    tradeDate: "2026-08-01",
    prevTradeDate: "2026-07-31",
    today: [
      { t: "09:30", v: 0.1 },
      { t: "15:00", v: 1 },
    ],
    prev: [
      { t: "09:30", v: 0.05 },
      { t: "15:00", v: 0.9 },
    ],
  },
  snapshotTradeDate: "2026-08-01",
};

const sampleInsight: NonNullable<MarketTurnoverResponse["turnoverInsight"]> = {
  status: "active",
  paceState: "expanding",
  effectiveTime: "14:30",
  paceRatio: 1.12,
  projectedRange: { low: 0.9, high: 1.1 },
  actualFullDayAmount: 1,
  reason: undefined,
  asOf: "2026-08-01T14:30:00+08:00",
  baseline: {
    windowDays: 20,
    sampleDays: 18,
    shapeDays: 15,
    scaleDays: 12,
    method: "kline_scale_short_shape_v1",
    quality: "active",
  },
};

const sampleWithInsight: MarketTurnoverResponse = {
  ...sample,
  turnoverInsight: sampleInsight,
};

afterEach(() => {
  clearTurnoverCacheForTests();
});

describe("turnover cache", () => {
  it("write warms memory; storage-only read does not", () => {
    localStorage.setItem("investor:market-turnover:v1", JSON.stringify(sample));
    expect(peekTurnoverMemoryCache()).toBeNull();
    expect(readTurnoverCache()).toEqual(sample);
    expect(peekTurnoverMemoryCache()).toBeNull();

    writeTurnoverCache(sample);
    expect(peekTurnoverMemoryCache()).toEqual(sample);
    expect(readTurnoverCache()).toEqual(sample);
  });

  it("ignores asOf for probe skip; compares amounts", () => {
    expect(turnoverDataEqual(sample, { ...sample, markets: [...sample.markets] })).toBe(true);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        series: {
          ...sample.series,
          today: [...sample.series.today],
          prev: [...sample.series.prev],
        },
      }),
    ).toBe(true);
    expect(turnoverDataEqual(sample, { ...sample, asOf: "other" })).toBe(true);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        total: { ...sample.total, amount: 2 },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        compareMode: "vs_prev_same_time",
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        total: { ...sample.total, prevSameTimeAmount: 0.8 },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        series: {
          ...sample.series,
          today: [...sample.series.today.slice(0, -1), { t: "15:00", v: 1.1 }],
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        series: {
          ...sample.series,
          prev: [...sample.series.prev.slice(0, -1), { t: "15:00", v: 0.85 }],
        },
      }),
    ).toBe(false);
    expect(turnoverDataEqual(null, sample)).toBe(false);
  });

  it("detects middle-point and semantic metadata changes", () => {
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        series: {
          ...sample.series,
          today: [
            { t: "09:30", v: 0.1 },
            { t: "12:00", v: 0.7 },
            { t: "15:00", v: 1 },
          ],
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        series: {
          ...sample.series,
          tradeDate: "2026-08-04",
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        disclaimer: "同时刻累计对比",
      }),
    ).toBe(false);
  });

  it("compares turnoverInsight for probe skip", () => {
    expect(turnoverDataEqual(sample, sample)).toBe(true);
    expect(turnoverDataEqual(sampleWithInsight, { ...sampleWithInsight })).toBe(true);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight },
      }),
    ).toBe(true);
    expect(turnoverDataEqual(sample, sampleWithInsight)).toBe(false);
    expect(turnoverDataEqual(sampleWithInsight, sample)).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, status: "warming_up" },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, paceState: "contracting" },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, effectiveTime: "15:00" },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, paceRatio: 1.05 },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: {
          ...sampleInsight,
          projectedRange: { low: 0.85, high: 1.1 },
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, actualFullDayAmount: 1.01 },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, asOf: "2026-08-01T14:31:00+08:00" },
      }),
    ).toBe(true);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: { ...sampleInsight, reason: "stale_profile" },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: {
          ...sampleInsight,
          baseline: { ...sampleInsight.baseline!, quality: "mature" },
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: {
          ...sampleInsight,
          baseline: { ...sampleInsight.baseline!, sampleDays: 17 },
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sampleWithInsight,
        turnoverInsight: {
          ...sampleInsight,
          projectedFullDayAmount: 1_300_000_000_000,
        },
      }),
    ).toBe(false);
    expect(
      turnoverDataEqual(sampleWithInsight, {
        ...sample,
        turnoverInsight: { ...sampleInsight, paceRatio: 1.2 },
      }),
    ).toBe(false);
  });
});
