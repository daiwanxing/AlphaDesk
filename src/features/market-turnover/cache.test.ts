import { afterEach, describe, expect, it } from "vitest";
import {
  clearTurnoverCacheForTests,
  peekTurnoverMemoryCache,
  readTurnoverCache,
  turnoverDataEqual,
  writeTurnoverCache,
} from "./cache";
import type { MarketTurnoverResponse } from "./types";

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
  total: { amount: 1, prevFullDayAmount: 1, delta: 0, deltaPct: 0 },
  snapshotTradeDate: "2026-08-01",
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

  it("compares asOf and amounts for probe skip", () => {
    expect(turnoverDataEqual(sample, { ...sample, markets: [...sample.markets] })).toBe(true);
    expect(turnoverDataEqual(sample, { ...sample, asOf: "other" })).toBe(false);
    expect(
      turnoverDataEqual(sample, {
        ...sample,
        total: { ...sample.total, amount: 2 },
      }),
    ).toBe(false);
    expect(turnoverDataEqual(null, sample)).toBe(false);
  });
});
