import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrends2 } from "./eastmoney";

function trendsLine(day: string): string {
  return `${day} 09:30,0,0,0,0,0,100,0`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTrends2", () => {
  it("prefers push2his multi-day coverage on the first successful host", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      const trends = url.includes("push2his")
        ? [trendsLine("2026-07-31"), trendsLine("2026-08-03")]
        : [trendsLine("2026-08-03")];
      return new Response(JSON.stringify({ rc: 0, data: { trends } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrends2("1.000001", 3)).resolves.toEqual([
      trendsLine("2026-07-31"),
      trendsLine("2026-08-03"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("push2his.eastmoney.com");
  });

  it("falls back to a single-day realtime host when history is unreachable", async () => {
    const today = trendsLine("2026-08-04");
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("push2his")) {
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ rc: 0, data: { trends: [today] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrends2("1.000001", 3)).resolves.toEqual([today]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("accepts a single current day for the live two-day request", async () => {
    const line = trendsLine("2026-08-03");
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rc: 0, data: { trends: [line] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrends2("1.000001", 2)).resolves.toEqual([line]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
