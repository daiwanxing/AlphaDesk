import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTencentDayMinuteSeries } from "./tencent";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tencent provider", () => {
  it("parses multi-day cumulative minute data by trading date", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      expect(String(input)).toContain("sh000001");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              sh000001: {
                data: [
                  {
                    date: "20260803",
                    data: ["0930 1 2 300", "0931 1 2 500"],
                  },
                ],
              },
            },
          }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTencentDayMinuteSeries("1.000001")).resolves.toEqual(
      new Map([
        [
          "2026-08-03",
          [
            { t: "09:30", v: 300 },
            { t: "09:31", v: 500 },
          ],
        ],
      ]),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sh000001");
  });

  it("rejects malformed day-minute payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 0, data: {} }), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(fetchTencentDayMinuteSeries("1.000001")).rejects.toThrow(
      "Tencent day-minute empty or invalid",
    );
  });
});
