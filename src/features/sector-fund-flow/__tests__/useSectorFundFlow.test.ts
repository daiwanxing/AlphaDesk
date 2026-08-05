import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketSession } from "@contracts/market-turnover";
import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow";
import { useSectorFundFlow } from "../useSectorFundFlow";

const fetchSectorFundFlow = vi.hoisted(() => vi.fn());
const cloudbaseApiBase = vi.hoisted(() => vi.fn(() => "https://example.test"));

vi.mock("@/services/sector-fund-flow", () => ({ fetchSectorFundFlow }));
vi.mock("@/shared/config/cloudbase", () => ({ cloudbaseApiBase }));

const response: SectorFundFlowResponse = {
  ok: true,
  asOf: "2026-08-04T06:00:00Z",
  session: "continuous",
  boardType: "industry",
  selection: "abs_top_8",
  sectors: [
    {
      code: "BK1",
      name: "通信设备",
      netInflowYi: 10,
      points: [{ t: "09:31", v: 10 }],
    },
  ],
  disclaimer: "test",
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  cloudbaseApiBase.mockReturnValue("https://example.test");
});

describe("useSectorFundFlow", () => {
  it("loads once outside continuous trading", async () => {
    fetchSectorFundFlow.mockResolvedValue(response);

    const { result } = renderHook(() => useSectorFundFlow("closed"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sectors).toEqual(response.sectors);
    expect(fetchSectorFundFlow).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when continuous trading closes", async () => {
    vi.useFakeTimers();
    fetchSectorFundFlow.mockResolvedValue(response);

    const { rerender } = renderHook(
      ({ session }: { session: MarketSession }) => useSectorFundFlow(session),
      { initialProps: { session: "continuous" } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSectorFundFlow).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ session: "closed" });
      await Promise.resolve();
    });
    expect(fetchSectorFundFlow).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchSectorFundFlow).toHaveBeenCalledTimes(2);
  });

  it("keeps the last successful frame when a poll returns ok:false", async () => {
    vi.useFakeTimers();
    fetchSectorFundFlow
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ ...response, ok: false, sectors: [], error: "clist down" });

    const { result } = renderHook(() => useSectorFundFlow("continuous"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.sectors).toEqual(response.sectors);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(result.current.sectors).toEqual(response.sectors);
    expect(result.current.error).toBe("clist down");
  });
});
