import { describe, expect, it } from "vitest";
import type { SectorFundFlowResponse } from "./sector-fund-flow";

const sample = {
  ok: true,
  asOf: "2026-08-04T14:56:00+08:00",
  session: "continuous",
  boardType: "industry",
  selection: "abs_top_8",
  sectors: [
    {
      code: "BK1201",
      name: "电子",
      netInflowYi: 334.9,
      points: [
        { t: "09:31", v: 2.55 },
        { t: "15:00", v: 334.9 },
      ],
    },
  ],
  disclaimer: "口径：东财板块资金流向·行业（m:90+s:4）主力净流入累计（亿元）· 按|净流入| Top 8",
} satisfies SectorFundFlowResponse;

describe("sector-fund-flow contract", () => {
  it("accepts a successful industry top-8 payload", () => {
    expect(sample.ok).toBe(true);
    expect(sample.boardType).toBe("industry");
    expect(sample.selection).toBe("abs_top_8");
    expect(sample.sectors[0]?.code).toMatch(/^BK/);
  });
});
