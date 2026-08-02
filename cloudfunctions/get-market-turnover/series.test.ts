import { describe, expect, it } from "vitest";
import {
  calcDelta,
  cumsumMinuteAmounts,
  mergeMarketCumulatives,
  parseTrendsLine,
  pickSeriesDates,
  valueAtOrBefore,
} from "./series";

describe("parseTrendsLine", () => {
  it("parses a trends2 CSV line into day, t, and per-minute amount", () => {
    const line = "2026-07-31 09:30,3833.54,3833.54,3833.54,3833.54,8324010,22322283008.00,3852.692";
    expect(parseTrendsLine(line)).toEqual({
      day: "2026-07-31",
      t: "09:30",
      amount: 22322283008,
    });
  });

  it("returns null for empty or malformed lines", () => {
    expect(parseTrendsLine("")).toBeNull();
    expect(parseTrendsLine("bad,data")).toBeNull();
  });
});

describe("cumsumMinuteAmounts", () => {
  it("accumulates per-minute amounts into cumulative turnover points", () => {
    const minutes = [
      { t: "09:30", amount: 100 },
      { t: "09:31", amount: 50 },
      { t: "09:32", amount: 25 },
    ];
    expect(cumsumMinuteAmounts(minutes)).toEqual([
      { t: "09:30", v: 100 },
      { t: "09:31", v: 150 },
      { t: "09:32", v: 175 },
    ]);
  });
});

describe("mergeMarketCumulatives", () => {
  it("sums aligned cumulative values across markets", () => {
    const sh = [
      { t: "09:30", v: 100 },
      { t: "09:31", v: 200 },
      { t: "09:32", v: 300 },
    ];
    const sz = [
      { t: "09:30", v: 10 },
      { t: "09:31", v: 20 },
      { t: "09:32", v: 30 },
    ];
    const bj = [
      { t: "09:30", v: 1 },
      { t: "09:31", v: 2 },
      { t: "09:32", v: 3 },
    ];
    expect(mergeMarketCumulatives([sh, sz, bj])).toEqual([
      { t: "09:30", v: 111 },
      { t: "09:31", v: 222 },
      { t: "09:32", v: 333 },
    ]);
  });

  it("only outputs timestamps present in every market", () => {
    const sh = [
      { t: "09:30", v: 100 },
      { t: "09:31", v: 200 },
    ];
    const sz = [
      { t: "09:30", v: 10 },
      { t: "09:32", v: 30 },
    ];
    const bj = [{ t: "09:30", v: 1 }];
    expect(mergeMarketCumulatives([sh, sz, bj])).toEqual([{ t: "09:30", v: 111 }]);
  });
});

describe("valueAtOrBefore", () => {
  const points = [
    { t: "09:30", v: 100 },
    { t: "09:31", v: 150 },
    { t: "10:00", v: 500 },
  ];

  it("returns the exact value when t matches", () => {
    expect(valueAtOrBefore(points, "09:31")).toBe(150);
  });

  it("returns the latest point at or before t when exact match is missing", () => {
    expect(valueAtOrBefore(points, "10:01")).toBe(500);
    expect(valueAtOrBefore(points, "09:45")).toBe(150);
  });

  it("returns undefined when no point is at or before t", () => {
    expect(valueAtOrBefore(points, "09:29")).toBeUndefined();
  });
});

describe("pickSeriesDates", () => {
  const days = ["2026-07-30", "2026-07-31"];

  it("pickSeriesDates weekend uses latest two days", () => {
    expect(pickSeriesDates("weekend", "2026-08-02", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
  });

  it("maps pre_open like weekend", () => {
    expect(pickSeriesDates("pre_open", "2026-08-04", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
  });

  it("uses today as tradeDate during trading sessions when available", () => {
    expect(pickSeriesDates("continuous", "2026-07-31", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
    expect(pickSeriesDates("lunch", "2026-07-31", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
    expect(pickSeriesDates("closed", "2026-07-31", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
  });

  it("falls back to latest available day when today is missing during trading sessions", () => {
    expect(pickSeriesDates("continuous", "2026-08-02", days)).toEqual({
      tradeDate: "2026-07-31",
      prevTradeDate: "2026-07-30",
    });
  });
});

describe("calcDelta", () => {
  it("computes delta and deltaPct against baseline", () => {
    expect(calcDelta(120, 100)).toEqual({ delta: 20, deltaPct: 0.2 });
  });

  it("returns zero deltaPct when baseline is zero", () => {
    expect(calcDelta(100, 0)).toEqual({ delta: 100, deltaPct: 0 });
  });
});
