import { describe, expect, it } from "vitest";
import {
  buildSeries,
  mapPool,
  parseFflowLine,
  parseFflowPoints,
  selectAbsTopBoards,
  sortByNetInflowDesc,
} from "./select";

describe("selectAbsTopBoards", () => {
  it("picks boards by absolute net inflow", () => {
    const selected = selectAbsTopBoards(
      [
        { code: "A", name: "流入大", netInflowYuan: 100 },
        { code: "B", name: "流出大", netInflowYuan: -200 },
        { code: "C", name: "小", netInflowYuan: 50 },
      ],
      2,
    );
    expect(selected.map((row) => row.code)).toEqual(["B", "A"]);
  });
});

describe("parseFflowLine", () => {
  it("parses datetime and main net inflow to 亿元", () => {
    const point = parseFflowLine(
      "2026-08-04 14:56,33080029764.0,-16757783481.0,-16191276640.0,4035725421.0,29044304343.0",
    );
    expect(point).toEqual({ t: "14:56", v: 330.80029764 });
  });

  it("rejects malformed lines", () => {
    expect(parseFflowLine("bad")).toBeNull();
    expect(parseFflowLine("2026-08-04 14:56,abc")).toBeNull();
  });
});

describe("parseFflowPoints / buildSeries", () => {
  it("builds series from fixture lines", () => {
    const lines = [
      "2026-08-04 09:31,255327616.0,0,0,0,0",
      "2026-08-04 15:00,33490101103.0,0,0,0,0",
    ];
    expect(parseFflowPoints(lines)).toHaveLength(2);
    const series = buildSeries({ code: "BK1201", name: "电子", netInflowYuan: 1 }, lines);
    expect(series?.code).toBe("BK1201");
    expect(series?.netInflowYi).toBeCloseTo(334.90101103);
  });
});

describe("mapPool", () => {
  it("preserves order under limited concurrency", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => {
      await new Promise((r) => setTimeout(r, 5 * (5 - n)));
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40]);
  });
});

describe("sortByNetInflowDesc", () => {
  it("orders by signed net inflow", () => {
    const sorted = sortByNetInflowDesc([
      { code: "A", name: "a", netInflowYi: 10, points: [] },
      { code: "B", name: "b", netInflowYi: -5, points: [] },
      { code: "C", name: "c", netInflowYi: 20, points: [] },
    ]);
    expect(sorted.map((s) => s.code)).toEqual(["C", "A", "B"]);
  });
});
