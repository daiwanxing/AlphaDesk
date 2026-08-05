import { describe, expect, it } from "vitest";
import { createSectorFundFlowApplication } from "./service";
import type { IndustryBoardRow } from "../eastmoney";

function linesFor(yuanEnd: number): string[] {
  return [`2026-08-04 09:31,${yuanEnd / 10},0,0,0,0`, `2026-08-04 15:00,${yuanEnd},0,0,0,0`];
}

describe("createSectorFundFlowApplication", () => {
  it("returns top abs boards with fflow series", async () => {
    const boards: IndustryBoardRow[] = [
      { code: "BK1", name: "大流入", netInflowYuan: 3e10 },
      { code: "BK2", name: "大流出", netInflowYuan: -2e10 },
      { code: "BK3", name: "小", netInflowYuan: 1e9 },
    ];

    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => boards,
        fetchBoardFflowKline: async (code) => {
          if (code === "BK1") return linesFor(3e10);
          if (code === "BK2") return linesFor(-2e10);
          return linesFor(1e9);
        },
      },
    });

    const res = await app.buildResponse(new Date("2026-08-04T06:00:00Z"));
    expect(res.ok).toBe(true);
    expect(res.sectors).toHaveLength(3);
    expect(res.sectors.map((s) => s.code)).toEqual(["BK1", "BK3", "BK2"]);
    expect(res.selection).toBe("abs_top_8");
  });

  it("drops boards whose fflow fails and fails when all drop in continuous", async () => {
    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => [
          { code: "BK1", name: "a", netInflowYuan: 1e10 },
          { code: "BK2", name: "b", netInflowYuan: -9e9 },
        ],
        fetchBoardFflowKline: async (code) => {
          if (code === "BK1") return linesFor(1e10);
          throw new Error("fflow down");
        },
      },
    });

    const partial = await app.buildResponse(new Date("2026-08-04T06:00:00Z"));
    expect(partial.ok).toBe(true);
    expect(partial.sectors).toHaveLength(1);

    const allFail = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => [{ code: "BK1", name: "a", netInflowYuan: 1 }],
        fetchBoardFflowKline: async () => {
          throw new Error("fflow down");
        },
      },
    });
    const failed = await allFail.buildResponse(new Date("2026-08-04T06:00:00Z"));
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatch(/暂时不可用/);
    expect(failed.sectors).toEqual([]);
  });

  it("returns ok empty when clist has no numeric day flow (pre-open)", async () => {
    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => [],
        fetchBoardFflowKline: async () => {
          throw new Error("should not fetch fflow");
        },
      },
    });
    // 01:00Z = 09:00 Asia/Shanghai → pre_open
    const res = await app.buildResponse(new Date("2026-08-05T01:00:00Z"));
    expect(res.ok).toBe(true);
    expect(res.session).toBe("pre_open");
    expect(res.sectors).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  it("returns ok:false with user-facing error when clist fails", async () => {
    let calls = 0;
    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => {
          calls += 1;
          throw new Error("clist down");
        },
        fetchBoardFflowKline: async () => [],
      },
    });
    const now = new Date("2026-08-04T06:00:00Z");
    const first = await app.buildResponse(now);
    const second = await app.buildResponse(now);
    expect(first.ok).toBe(false);
    expect(first.error).toMatch(/暂时不可用/);
    expect(first.error).not.toMatch(/clist down/);
    expect(second.ok).toBe(false);
    expect(calls).toBe(2);
  });

  it("reuses a successful response within the short TTL", async () => {
    let calls = 0;
    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => {
          calls += 1;
          return [{ code: "BK1", name: "a", netInflowYuan: 1e10 }];
        },
        fetchBoardFflowKline: async () => linesFor(1e10),
      },
    });
    const now = new Date("2026-08-04T06:00:00Z");

    const first = await app.buildResponse(now);
    const second = await app.buildResponse(new Date(now.getTime() + 5_000));

    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("coalesces concurrent requests for the same session", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = createSectorFundFlowApplication({
      provider: {
        fetchIndustryClist: async () => {
          calls += 1;
          await gate;
          return [{ code: "BK1", name: "a", netInflowYuan: 1e10 }];
        },
        fetchBoardFflowKline: async () => linesFor(1e10),
      },
    });
    const now = new Date("2026-08-04T06:00:00Z");

    const first = app.buildResponse(now);
    const second = app.buildResponse(now);
    release();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(calls).toBe(1);
  });
});
