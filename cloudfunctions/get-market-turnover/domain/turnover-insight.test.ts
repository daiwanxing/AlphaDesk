import { describe, expect, it } from "vitest";

import {
  computeTurnoverInsight,
  median,
  paceStateFromRatio,
  percentileLinear,
  resolveEffectiveMinute,
  type ComputeInsightInput,
  type InsightDaySeries,
} from "./turnover-insight";

const NOW = new Date("2026-08-04T02:30:00.000Z");
const AS_OF = "2026-08-04T10:30:00+08:00";

function baseInput(overrides: Partial<ComputeInsightInput> = {}): ComputeInsightInput {
  return {
    session: "continuous",
    asOf: AS_OF,
    wallClockHHmm: "10:30",
    todayPoints: [{ t: "10:29", v: 445 }],
    completeProfiles: [],
    shapeDays: [],
    scaleFullDayAmounts: [],
    now: NOW,
    ...overrides,
  };
}

/** 单点 profile：只在 `t` 有累计值，配一个全天额。 */
function daySeries(
  tradeDate: string,
  t: string,
  v: number,
  fullDayAmount: number,
): InsightDaySeries {
  return { tradeDate, points: [{ t, v }], fullDayAmount };
}

/** 10 天 complete profile：同刻 400..490，全天额恒为 1000。 */
function profiles10(): InsightDaySeries[] {
  return Array.from({ length: 10 }, (_, i) =>
    daySeries(`2026-07-${String(i + 10).padStart(2, "0")}`, "10:29", 400 + i * 10, 1000),
  );
}

describe("median", () => {
  it("returns the middle value for odd counts", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for even counts", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns NaN for an empty sample", () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("percentileLinear", () => {
  it("interpolates linearly at position p * (n - 1)", () => {
    const sorted = [0.4, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47, 0.48, 0.49];
    // p25 → 位置 2.25 → 0.42 + 0.25 * 0.01
    expect(percentileLinear(sorted, 0.25)).toBeCloseTo(0.4225, 10);
    // p75 → 位置 6.75 → 0.46 + 0.75 * 0.01
    expect(percentileLinear(sorted, 0.75)).toBeCloseTo(0.4675, 10);
  });

  it("hits exact samples at the ends and on integer positions", () => {
    expect(percentileLinear([0.4, 0.5, 0.6], 0)).toBe(0.4);
    expect(percentileLinear([0.4, 0.5, 0.6], 1)).toBe(0.6);
    expect(percentileLinear([0.4, 0.5, 0.6], 0.5)).toBe(0.5);
    expect(percentileLinear([0.4, 0.5, 0.6], 0.25)).toBeCloseTo(0.45, 10);
    expect(percentileLinear([0.4, 0.5, 0.6], 0.75)).toBeCloseTo(0.55, 10);
  });
});

describe("paceStateFromRatio", () => {
  it("maps ratios to the five fixed buckets at their boundaries", () => {
    expect(paceStateFromRatio(1.5)).toBe("strongly_expanding");
    expect(paceStateFromRatio(1.1)).toBe("strongly_expanding");
    expect(paceStateFromRatio(1.0999)).toBe("expanding");
    expect(paceStateFromRatio(1.03)).toBe("expanding");
    expect(paceStateFromRatio(1.0299)).toBe("normal");
    expect(paceStateFromRatio(1)).toBe("normal");
    expect(paceStateFromRatio(0.97)).toBe("normal");
    expect(paceStateFromRatio(0.9699)).toBe("contracting");
    expect(paceStateFromRatio(0.9)).toBe("contracting");
    expect(paceStateFromRatio(0.8999)).toBe("strongly_contracting");
    expect(paceStateFromRatio(0.5)).toBe("strongly_contracting");
  });
});

describe("resolveEffectiveMinute", () => {
  it("uses the last completed minute during continuous trading", () => {
    expect(
      resolveEffectiveMinute({
        session: "continuous",
        wallClockHHmm: "10:30",
        lastPointT: "10:30",
      }),
    ).toBe("10:29");
  });

  it("never goes past the last available point", () => {
    expect(
      resolveEffectiveMinute({
        session: "continuous",
        wallClockHHmm: "10:30",
        lastPointT: "10:20",
      }),
    ).toBe("10:20");
  });

  it("caps the lunch break at 11:30", () => {
    expect(
      resolveEffectiveMinute({ session: "lunch", wallClockHHmm: "12:10", lastPointT: "11:31" }),
    ).toBe("11:30");
    expect(
      resolveEffectiveMinute({ session: "lunch", wallClockHHmm: "12:10", lastPointT: "11:28" }),
    ).toBe("11:28");
  });

  it("caps the closed session at 15:00", () => {
    expect(
      resolveEffectiveMinute({ session: "closed", wallClockHHmm: "15:20", lastPointT: "15:01" }),
    ).toBe("15:00");
  });

  it("has no effective minute before the open", () => {
    expect(
      resolveEffectiveMinute({
        session: "pre_open",
        wallClockHHmm: "09:10",
        lastPointT: undefined,
      }),
    ).toBeUndefined();
  });
});

describe("computeTurnoverInsight — lifecycle", () => {
  it("warms up before 09:45 even when samples are sufficient", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        wallClockHHmm: "09:40",
        todayPoints: [{ t: "09:39", v: 100 }],
        completeProfiles: profiles10(),
      }),
    );

    expect(insight.status).toBe("warming_up");
    expect(insight.projectedFullDayAmount).toBeUndefined();
    expect(insight.paceState).toBeUndefined();
    expect(insight.asOf).toBe(AS_OF);
  });

  it("warms up before the market opens", () => {
    const insight = computeTurnoverInsight(
      baseInput({ session: "pre_open", wallClockHHmm: "09:10", todayPoints: [] }),
    );

    expect(insight.status).toBe("warming_up");
  });

  it("reports the actual full-day amount once closed", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        session: "closed",
        wallClockHHmm: "15:20",
        todayPoints: [{ t: "15:00", v: 980 }],
        todayFullDayAmount: 1000,
        completeProfiles: profiles10(),
      }),
    );

    expect(insight.status).toBe("final");
    expect(insight.actualFullDayAmount).toBe(1000);
    expect(insight.projectedFullDayAmount).toBeUndefined();
    expect(insight.projectedRange).toBeUndefined();
    expect(insight.effectiveTime).toBe("15:00");
  });

  it("does not go final when the last point is earlier than 14:55", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        session: "closed",
        wallClockHHmm: "15:20",
        todayPoints: [{ t: "14:40", v: 900 }],
        todayFullDayAmount: 1000,
        completeProfiles: [],
      }),
    );

    expect(insight.status).not.toBe("final");
  });
});

describe("computeTurnoverInsight — profile mode", () => {
  it("uses the same-minute median of complete profiles", () => {
    const insight = computeTurnoverInsight(baseInput({ completeProfiles: profiles10() }));

    // median(C_d) = (440 + 450) / 2 = 445, today = 445 → 正常
    expect(insight.status).toBe("active");
    expect(insight.paceRatio).toBeCloseTo(1, 10);
    expect(insight.paceState).toBe("normal");
    expect(insight.effectiveTime).toBe("10:29");
    expect(insight.baseline).toMatchObject({
      windowDays: 20,
      sampleDays: 10,
      method: "median_intraday_progress_v1",
      quality: "active",
      firstTradeDate: "2026-07-10",
      lastTradeDate: "2026-07-19",
    });
  });

  it("projects the full day from the median progress with a P25/P75 range", () => {
    const insight = computeTurnoverInsight(baseInput({ completeProfiles: profiles10() }));

    // median(r) = 0.445 → 445 / 0.445 = 1000
    expect(insight.projectedFullDayAmount).toBeCloseTo(1000, 6);
    expect(insight.projectedRange?.low).toBeCloseTo(445 / 0.4675, 6);
    expect(insight.projectedRange?.high).toBeCloseTo(445 / 0.4225, 6);
    expect(insight.projectedRange!.low).toBeLessThan(insight.projectedRange!.high);
  });

  it("marks 20 or more same-minute samples as mature", () => {
    const profiles = Array.from({ length: 20 }, (_, i) =>
      daySeries(`2026-07-${String(i + 1).padStart(2, "0")}`, "10:29", 445, 1000),
    );

    const insight = computeTurnoverInsight(baseInput({ completeProfiles: profiles }));

    expect(insight.baseline?.quality).toBe("mature");
    expect(insight.baseline?.sampleDays).toBe(20);
  });

  it("prefers profile over bootstrap once the minute has 10 samples", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        completeProfiles: profiles10(),
        shapeDays: [
          daySeries("2026-07-20", "10:29", 100, 1000),
          daySeries("2026-07-21", "10:29", 200, 1000),
        ],
        scaleFullDayAmounts: Array.from({ length: 10 }, () => 9000),
      }),
    );

    expect(insight.status).toBe("active");
    expect(insight.baseline?.method).toBe("median_intraday_progress_v1");
    expect(insight.baseline?.quality).toBe("active");
    expect(insight.paceRatio).toBeCloseTo(1, 10);
  });

  it("ignores minutes missing from a profile when counting samples", () => {
    const profiles = [...profiles10(), daySeries("2026-07-20", "13:00", 800, 1000)];

    const insight = computeTurnoverInsight(baseInput({ completeProfiles: profiles }));

    expect(insight.baseline?.sampleDays).toBe(10);
  });
});

describe("computeTurnoverInsight — bootstrap mode", () => {
  function bootstrapInput(overrides: Partial<ComputeInsightInput> = {}): ComputeInsightInput {
    return baseInput({
      todayPoints: [{ t: "10:29", v: 500 }],
      shapeDays: [
        daySeries("2026-07-29", "10:29", 400, 1000),
        daySeries("2026-07-30", "10:29", 500, 1000),
        daySeries("2026-07-31", "10:29", 600, 1000),
      ],
      scaleFullDayAmounts: Array.from({ length: 10 }, () => 1000),
      ...overrides,
    });
  }

  it("uses median(F) * median(r) as the typical same-minute level", () => {
    const insight = computeTurnoverInsight(bootstrapInput());

    // median(F) = 1000, median(r) = 0.5 → typical = 500, today = 500 → 正常
    expect(insight.status).toBe("active");
    expect(insight.baseline?.quality).toBe("bootstrap");
    expect(insight.baseline?.method).toBe("kline_scale_short_shape_v1");
    expect(insight.paceRatio).toBeCloseTo(1, 10);
    expect(insight.paceState).toBe("normal");
    expect(insight.baseline?.shapeDays).toBe(3);
    expect(insight.baseline?.scaleDays).toBe(10);
  });

  it("projects from the short-window shape median", () => {
    const insight = computeTurnoverInsight(bootstrapInput());

    expect(insight.projectedFullDayAmount).toBeCloseTo(1000, 6);
    expect(insight.projectedRange?.low).toBeCloseTo(500 / 0.55, 6);
    expect(insight.projectedRange?.high).toBeCloseTo(500 / 0.45, 6);
  });

  it("classifies expansion and contraction against the typical level", () => {
    expect(
      computeTurnoverInsight(bootstrapInput({ todayPoints: [{ t: "10:29", v: 600 }] })).paceState,
    ).toBe("strongly_expanding");
    expect(
      computeTurnoverInsight(bootstrapInput({ todayPoints: [{ t: "10:29", v: 400 }] })).paceState,
    ).toBe("strongly_contracting");
    expect(
      computeTurnoverInsight(bootstrapInput({ todayPoints: [{ t: "10:29", v: 525 }] })).paceState,
    ).toBe("expanding");
    expect(
      computeTurnoverInsight(bootstrapInput({ todayPoints: [{ t: "10:29", v: 470 }] })).paceState,
    ).toBe("contracting");
  });

  it("reports insufficient shape days below 2 valid shape samples", () => {
    const insight = computeTurnoverInsight(
      bootstrapInput({ shapeDays: [daySeries("2026-07-31", "10:29", 500, 1000)] }),
    );

    expect(insight.status).toBe("unavailable");
    expect(insight.reason).toBe("insufficient_shape_days");
    expect(insight.baseline).toBeUndefined();
  });

  it("reports insufficient scale days below 10 valid daily bars", () => {
    const insight = computeTurnoverInsight(
      bootstrapInput({ scaleFullDayAmounts: Array.from({ length: 9 }, () => 1000) }),
    );

    expect(insight.status).toBe("unavailable");
    expect(insight.reason).toBe("insufficient_scale_days");
  });

  it("skips shape days without a usable full-day amount", () => {
    const insight = computeTurnoverInsight(
      bootstrapInput({
        shapeDays: [
          daySeries("2026-07-29", "10:29", 400, 0),
          daySeries("2026-07-30", "10:29", 500, 1000),
          daySeries("2026-07-31", "10:29", 600, 1000),
        ],
      }),
    );

    expect(insight.baseline?.shapeDays).toBe(2);
  });
});

describe("computeTurnoverInsight — invalid data", () => {
  it("rejects a zero cumulative amount for today", () => {
    const insight = computeTurnoverInsight(
      baseInput({ todayPoints: [{ t: "10:29", v: 0 }], completeProfiles: profiles10() }),
    );

    expect(insight.status).toBe("unavailable");
    expect(insight.reason).toBe("invalid_current_data");
  });

  it("rejects a non-finite cumulative amount for today", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        todayPoints: [{ t: "10:29", v: Number.NaN }],
        completeProfiles: profiles10(),
      }),
    );

    expect(insight.reason).toBe("invalid_current_data");
  });

  it("rejects a missing minute for today", () => {
    const insight = computeTurnoverInsight(
      baseInput({ todayPoints: [{ t: "10:35", v: 500 }], completeProfiles: profiles10() }),
    );

    expect(insight.status).toBe("unavailable");
    expect(insight.reason).toBe("invalid_current_data");
  });

  it("rejects a non-positive typical same-minute level", () => {
    const insight = computeTurnoverInsight(
      baseInput({
        completeProfiles: Array.from({ length: 10 }, (_, i) =>
          daySeries(`2026-07-${String(i + 10).padStart(2, "0")}`, "10:29", 0, 1000),
        ),
        shapeDays: [],
        scaleFullDayAmounts: [],
      }),
    );

    expect(insight.status).toBe("unavailable");
  });

  it("is unavailable when neither mode has enough samples", () => {
    const insight = computeTurnoverInsight(baseInput());

    expect(insight.status).toBe("unavailable");
    expect(insight.reason).toBe("insufficient_shape_days");
  });
});
