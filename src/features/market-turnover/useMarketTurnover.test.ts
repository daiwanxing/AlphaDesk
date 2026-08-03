import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketSession, MarketTurnoverResponse } from "./types";
import { useMarketTurnover } from "./useMarketTurnover";

const fetchMarketTurnover = vi.hoisted(() => vi.fn());
const readTurnoverCache = vi.hoisted(() => vi.fn(() => null));
const peekTurnoverMemoryCache = vi.hoisted(() => vi.fn(() => null));
const turnoverDataEqual = vi.hoisted(() => vi.fn(() => false));
const writeTurnoverCache = vi.hoisted(() => vi.fn());
const resolveMarketSession = vi.hoisted(() => vi.fn<() => MarketSession>(() => "closed"));
const cloudbaseApiBase = vi.hoisted(() => vi.fn(() => "https://example.test"));

vi.mock("./api", () => ({ fetchMarketTurnover }));
vi.mock("./cache", () => ({
  peekTurnoverMemoryCache,
  readTurnoverCache,
  turnoverDataEqual,
  writeTurnoverCache,
}));
vi.mock("./session", () => ({ resolveMarketSession }));
vi.mock("@/shared/config/cloudbase", () => ({ cloudbaseApiBase }));

const response: MarketTurnoverResponse = {
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
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  readTurnoverCache.mockReturnValue(null);
  peekTurnoverMemoryCache.mockReturnValue(null);
  turnoverDataEqual.mockReturnValue(false);
  resolveMarketSession.mockReturnValue("closed");
  cloudbaseApiBase.mockReturnValue("https://example.test");
});

describe("useMarketTurnover", () => {
  it("loads the turnover response and exposes the current local session", async () => {
    fetchMarketTurnover.mockResolvedValue(response);

    const { result } = renderHook(() => useMarketTurnover());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(response);
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBe("closed");
    expect(writeTurnoverCache).toHaveBeenCalledWith(response);
  });

  it("refreshes once when continuous trading transitions to closed", async () => {
    vi.useFakeTimers();
    resolveMarketSession.mockReturnValue("continuous");
    fetchMarketTurnover.mockResolvedValue(response);

    const { result } = renderHook(() => useMarketTurnover());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(fetchMarketTurnover).toHaveBeenCalledTimes(1);

    resolveMarketSession.mockReturnValue("closed");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(fetchMarketTurnover).toHaveBeenCalledTimes(2);
    expect(result.current.session).toBe("closed");
  });
});
