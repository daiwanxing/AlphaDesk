import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIndustryClist, parseIndustryClistBody } from "./eastmoney";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseIndustryClistBody", () => {
  it("parses industry rows from clist diff", () => {
    const rows = parseIndustryClistBody({
      rc: 0,
      data: {
        diff: [
          { f12: "BK1201", f14: "电子", f62: 33490100224 },
          { f12: "BK0448", f14: "通信设备", f62: -1e9 },
        ],
      },
    });
    expect(rows).toEqual([
      { code: "BK1201", name: "电子", netInflowYuan: 33490100224 },
      { code: "BK0448", name: "通信设备", netInflowYuan: -1e9 },
    ]);
  });

  it("treats non-numeric f62 (pre-open) as empty, not invalid", () => {
    const rows = parseIndustryClistBody({
      rc: 0,
      data: {
        diff: [
          { f12: "BK0448", f14: "通信设备", f62: "-" as unknown as number },
          { f12: "BK0478", f14: "半导体", f62: "-" as unknown as number },
        ],
      },
    });
    expect(rows).toEqual([]);
  });
});

describe("fetchIndustryClist", () => {
  it("fetches only the top-N inflow and outflow edges", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      const isDesc = url.includes("po=1");
      return new Response(
        JSON.stringify({
          rc: 0,
          data: {
            diff: [
              {
                f12: isDesc ? "BK1" : "BK2",
                f14: isDesc ? "流入" : "流出",
                f62: isDesc ? 10 : -20,
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchIndustryClist()).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input] of fetchMock.mock.calls) {
      expect(String(input)).toContain("pz=8");
    }
  });
});
