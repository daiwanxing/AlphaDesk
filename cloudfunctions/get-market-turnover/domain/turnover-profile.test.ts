import { describe, expect, it } from "vitest";

import { EXPECTED_TRADING_MINUTE_COUNT, TRADING_MINUTES } from "./trading-minutes";
import {
  assessProfileQuality,
  buildTurnoverProfile,
  type BuildTurnoverProfileInput,
  type ProfileMarketInput,
} from "./turnover-profile";

const GENERATED_AT = "2026-08-04T07:10:00.000Z";

/** 覆盖全部 242 分钟的等速累计序列，终点恰好等于全天额。 */
function fullDaySeries(fullDayAmount: number): { t: string; v: number }[] {
  const total = TRADING_MINUTES.length;
  return TRADING_MINUTES.map((t, index) => ({
    t,
    v: (fullDayAmount * (index + 1)) / total,
  }));
}

function dropIndexes(
  points: { t: string; v: number }[],
  predicate: (index: number) => boolean,
): { t: string; v: number }[] {
  return points.filter((_, index) => !predicate(index));
}

function market(overrides: Partial<ProfileMarketInput> = {}): ProfileMarketInput {
  return {
    points: fullDaySeries(1000),
    fullDayAmount: 1000,
    source: "eastmoney",
    ...overrides,
  };
}

function profileInput(
  overrides: Partial<BuildTurnoverProfileInput> = {},
): BuildTurnoverProfileInput {
  return {
    tradeDate: "2026-08-04",
    generatedAt: GENERATED_AT,
    markets: {
      sh: market({ points: fullDaySeries(3000), fullDayAmount: 3000 }),
      sz: market({ points: fullDaySeries(2000), fullDayAmount: 2000 }),
      bj: market({ points: fullDaySeries(100), fullDayAmount: 100 }),
    },
    ...overrides,
  };
}

describe("TRADING_MINUTES", () => {
  it("covers the 242 A-share trading minutes", () => {
    expect(EXPECTED_TRADING_MINUTE_COUNT).toBe(242);
    expect(TRADING_MINUTES).toHaveLength(242);
  });

  it("spans 09:30–11:30 and 13:00–15:00 inclusive, like the frontend axis", () => {
    expect(TRADING_MINUTES[0]).toBe("09:30");
    expect(TRADING_MINUTES[120]).toBe("11:30");
    expect(TRADING_MINUTES[121]).toBe("13:00");
    expect(TRADING_MINUTES[241]).toBe("15:00");
  });

  it("excludes the lunch break and stays strictly ascending", () => {
    expect(TRADING_MINUTES).not.toContain("11:31");
    expect(TRADING_MINUTES).not.toContain("12:30");
    expect(TRADING_MINUTES).not.toContain("12:59");

    for (let i = 1; i < TRADING_MINUTES.length; i += 1) {
      expect(TRADING_MINUTES[i]! > TRADING_MINUTES[i - 1]!).toBe(true);
    }
  });
});

describe("assessProfileQuality", () => {
  it("accepts a full, monotonic day that matches its full-day amount", () => {
    const assessment = assessProfileQuality(market());

    expect(assessment.complete).toBe(true);
    expect(assessment.issues).toEqual([]);
    expect(assessment.validPointCount).toBe(242);
    expect(assessment.lastPoint).toBe("15:00");
  });

  it("rejects fewer than 230 valid points", () => {
    const points = dropIndexes(fullDaySeries(1000), (i) => i % 10 === 0 && i < 130);

    const assessment = assessProfileQuality(market({ points }));

    expect(assessment.validPointCount).toBe(229);
    expect(assessment.complete).toBe(false);
    expect(assessment.issues).toContain("insufficient_points");
  });

  it("tolerates a five-minute gap but rejects a six-minute one", () => {
    const gapOfFive = dropIndexes(fullDaySeries(1000), (i) => i >= 50 && i < 55);
    const gapOfSix = dropIndexes(fullDaySeries(1000), (i) => i >= 50 && i < 56);

    expect(assessProfileQuality(market({ points: gapOfFive })).complete).toBe(true);

    const assessment = assessProfileQuality(market({ points: gapOfSix }));
    expect(assessment.complete).toBe(false);
    expect(assessment.issues).toContain("gap_too_long");
  });

  it("measures gaps per session, so a morning tail plus an afternoon head is not one long gap", () => {
    // 11:28–11:30 与 13:00–13:02 各缺 3 分钟：跨时段拼起来是 6，按时段各算只有 3。
    const points = dropIndexes(fullDaySeries(1000), (i) => i >= 118 && i <= 123);

    const assessment = assessProfileQuality(market({ points }));

    expect(assessment.validPointCount).toBe(236);
    expect(assessment.complete).toBe(true);
  });

  it("rejects a cumulative series that goes backwards", () => {
    const points = fullDaySeries(1000);
    points[100] = { t: points[100]!.t, v: points[99]!.v - 1 };

    const assessment = assessProfileQuality(market({ points }));

    expect(assessment.complete).toBe(false);
    expect(assessment.issues).toContain("not_monotonic");
  });

  it("rejects a last valid point earlier than 14:55", () => {
    const points = fullDaySeries(1000).filter((point) => point.t <= "14:50");

    const assessment = assessProfileQuality(market({ points }));

    expect(assessment.lastPoint).toBe("14:50");
    expect(assessment.complete).toBe(false);
    expect(assessment.issues).toContain("last_point_too_early");
  });

  it("allows a 1% gap between the last point and the full-day amount but not 2%", () => {
    const atOnePercent = assessProfileQuality(
      market({ points: fullDaySeries(1010), fullDayAmount: 1000 }),
    );
    expect(atOnePercent.complete).toBe(true);

    const atTwoPercent = assessProfileQuality(
      market({ points: fullDaySeries(1020), fullDayAmount: 1000 }),
    );
    expect(atTwoPercent.complete).toBe(false);
    expect(atTwoPercent.issues).toContain("full_day_mismatch");
  });

  it("rejects a missing or non-positive full-day amount", () => {
    expect(assessProfileQuality(market({ fullDayAmount: 0 })).issues).toContain("invalid_full_day");
    expect(assessProfileQuality(market({ fullDayAmount: Number.NaN })).complete).toBe(false);
  });

  it("never marks a synthetic or scaled market as complete", () => {
    const assessment = assessProfileQuality(market({ synthetic: true, source: "tencent_scaled" }));

    expect(assessment.complete).toBe(false);
    expect(assessment.issues).toContain("synthetic_source");
    expect(assessment.validPointCount).toBe(242);
  });

  it("ignores points outside the trading axis and non-finite values", () => {
    const points = [
      { t: "09:25", v: 1 },
      { t: "12:00", v: 2 },
      { t: "09:30", v: Number.NaN },
      ...fullDaySeries(1000).slice(1),
    ];

    const assessment = assessProfileQuality(market({ points }));

    expect(assessment.validPointCount).toBe(241);
    expect(assessment.complete).toBe(true);
  });
});

describe("buildTurnoverProfile", () => {
  it("returns the §4.2 document shape", () => {
    const profile = buildTurnoverProfile(profileInput());

    expect(profile.docType).toBe("turnover_profile");
    expect(profile.tradeDate).toBe("2026-08-04");
    expect(profile.unit).toBe("yuan");
    expect(profile.timeZone).toBe("Asia/Shanghai");
    expect(profile.generatedAt).toBe(GENERATED_AT);
    expect(profile.markets.sh.fullDayAmount).toBe(3000);
    expect(profile.markets.sh.source).toBe("eastmoney");
    expect(profile.quality).toMatchObject({
      schemaVersion: 1,
      status: "complete",
      completeMarkets: ["sh", "sz", "bj"],
      lastPoint: "15:00",
      validPointCount: 242,
      expectedPointCount: 242,
    });
  });

  it("aggregates the total by aligned minute, skipping minutes any market misses", () => {
    const profile = buildTurnoverProfile(
      profileInput({
        markets: {
          sh: market({
            points: [
              { t: "09:30", v: 10 },
              { t: "09:31", v: 20 },
              { t: "09:32", v: 30 },
            ],
            fullDayAmount: 30,
          }),
          sz: market({
            points: [
              { t: "09:30", v: 5 },
              { t: "09:32", v: 15 },
            ],
            fullDayAmount: 15,
          }),
          bj: market({
            points: [
              { t: "09:30", v: 1 },
              { t: "09:31", v: 2 },
              { t: "09:32", v: 3 },
            ],
            fullDayAmount: 3,
          }),
        },
      }),
    );

    expect(profile.total.points).toEqual([
      { t: "09:30", v: 16 },
      { t: "09:32", v: 48 },
    ]);
    expect(profile.total.fullDayAmount).toBe(48);
    expect(profile.quality.validPointCount).toBe(2);
    expect(profile.quality.lastPoint).toBe("09:32");
    expect(profile.quality.status).toBe("degraded");
  });

  it("degrades the whole document when one market is incomplete", () => {
    const profile = buildTurnoverProfile(
      profileInput({
        markets: {
          sh: market({ points: fullDaySeries(3000), fullDayAmount: 3000 }),
          sz: market({ points: fullDaySeries(2000), fullDayAmount: 2000 }),
          bj: market({
            points: fullDaySeries(100).filter((point) => point.t <= "14:00"),
            fullDayAmount: 100,
          }),
        },
      }),
    );

    expect(profile.quality.status).toBe("degraded");
    expect(profile.quality.completeMarkets).toEqual(["sh", "sz"]);
  });

  it("degrades when a market is a scaled fallback, even with a perfect series", () => {
    const profile = buildTurnoverProfile(
      profileInput({
        markets: {
          sh: market({ points: fullDaySeries(3000), fullDayAmount: 3000 }),
          sz: market({ points: fullDaySeries(2000), fullDayAmount: 2000 }),
          bj: market({
            points: fullDaySeries(100),
            fullDayAmount: 100,
            source: "tencent_scaled",
            synthetic: true,
          }),
        },
      }),
    );

    expect(profile.quality.status).toBe("degraded");
    expect(profile.quality.completeMarkets).not.toContain("bj");
    expect(profile.quality.source).toBe("eastmoney+tencent_scaled");
  });
});
