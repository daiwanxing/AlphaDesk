import { describe, expect, it } from "vitest";
import type { SectorFundFlowResponse } from "@contracts/sector-fund-flow";
import { sectorFundFlowEqual } from "../equal";

const base: SectorFundFlowResponse = {
  ok: true,
  asOf: "2026-08-04T14:56:00+08:00",
  session: "continuous",
  boardType: "industry",
  selection: "abs_top_8",
  sectors: [
    {
      code: "BK0448",
      name: "通信设备",
      netInflowYi: 222.62,
      points: [
        { t: "09:31", v: 1.2 },
        { t: "15:00", v: 222.62 },
      ],
    },
  ],
  disclaimer: "x",
};

describe("sectorFundFlowEqual", () => {
  it("ignores asOf when frame content matches", () => {
    expect(sectorFundFlowEqual(base, { ...base, asOf: "other" })).toBe(true);
  });

  it("detects last-point changes", () => {
    expect(
      sectorFundFlowEqual(base, {
        ...base,
        sectors: [
          {
            ...base.sectors[0]!,
            points: [
              { t: "09:31", v: 1.2 },
              { t: "15:00", v: 223 },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects corrected points inside an otherwise unchanged frame", () => {
    expect(
      sectorFundFlowEqual(base, {
        ...base,
        sectors: [
          {
            ...base.sectors[0]!,
            points: [
              { t: "09:31", v: 1.3 },
              { t: "15:00", v: 222.62 },
            ],
          },
        ],
      }),
    ).toBe(false);
  });
});
