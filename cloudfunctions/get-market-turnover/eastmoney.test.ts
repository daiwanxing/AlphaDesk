import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrends2 } from "./eastmoney";

function trendsLine(day: string): string {
  return `${day} 09:30,0,0,0,0,0,100,0`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTrends2", () => {
  it("skips non-empty single-day responses and uses a host with historical coverage", async () => {
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("push2his.eastmoney.com");
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
