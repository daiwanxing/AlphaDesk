import { describe, expect, it } from "vitest";
import type { TurnoverInsight } from "@contracts/market-turnover";

import {
  PACE_RAIL_MEDIAN_LEFT_PCT,
  insightPanelCopy,
  paceRailLeftPercent,
} from "../insight-labels";

const baseInsight = {
  effectiveTime: "2026-08-04T10:30:00+08:00",
  asOf: "2026-08-04T10:30:00+08:00",
} satisfies Pick<TurnoverInsight, "effectiveTime" | "asOf">;

describe("insightPanelCopy", () => {
  it("maps active profile insight to scheme-B fields", () => {
    const copy = insightPanelCopy({
      ...baseInsight,
      status: "active",
      paceState: "contracting",
      paceRatio: 0.86,
      baseline: {
        windowDays: 20,
        sampleDays: 18,
        method: "median_intraday_progress_v1",
        quality: "active",
      },
    });

    expect(copy).toEqual({
      status: "active",
      paceLabel: "温和缩量",
      paceTone: "low",
      paceRatioText: "86%",
      paceRatio: 0.86,
      isBootstrap: false,
      foot: "尺度 20 日K · n=18",
    });
  });

  it("maps active bootstrap insight with sample caveat", () => {
    const copy = insightPanelCopy({
      ...baseInsight,
      status: "active",
      paceState: "contracting",
      paceRatio: 0.86,
      baseline: {
        windowDays: 20,
        sampleDays: 3,
        shapeDays: 3,
        scaleDays: 20,
        method: "kline_scale_short_shape_v1",
        quality: "bootstrap",
      },
    });

    expect(copy).toEqual({
      status: "active",
      paceLabel: "温和缩量",
      paceTone: "low",
      paceRatioText: "86%",
      paceRatio: 0.86,
      isBootstrap: true,
      foot: "形状 3 日 · 尺度 20 日K · 样本较少",
    });
  });

  it("maps strongly contracting tone", () => {
    const copy = insightPanelCopy({
      ...baseInsight,
      status: "active",
      paceState: "strongly_contracting",
      paceRatio: 0.68,
      baseline: {
        windowDays: 20,
        sampleDays: 18,
        method: "median_intraday_progress_v1",
        quality: "mature",
      },
    });
    expect(copy.status).toBe("active");
    if (copy.status !== "active") return;
    expect(copy.paceTone).toBe("vlow");
    expect(copy.paceLabel).toBe("明显缩量");
  });

  it("maps all pace states to Chinese labels and tones", () => {
    const states = [
      ["strongly_contracting", "明显缩量", "vlow"],
      ["contracting", "温和缩量", "low"],
      ["normal", "正常", "mid"],
      ["expanding", "温和放量", "high"],
      ["strongly_expanding", "明显放量", "vhigh"],
    ] as const;

    for (const [paceState, label, tone] of states) {
      const copy = insightPanelCopy({
        ...baseInsight,
        status: "active",
        paceState,
        paceRatio: 1,
        baseline: {
          windowDays: 20,
          sampleDays: 20,
          method: "median_intraday_progress_v1",
          quality: "mature",
        },
      });
      if (copy.status !== "active") throw new Error("expected active");
      expect(copy.paceLabel).toBe(label);
      expect(copy.paceTone).toBe(tone);
    }
  });

  it("returns pre_open warming_up copy", () => {
    expect(
      insightPanelCopy(
        {
          effectiveTime: "2026-08-04T08:10:00+08:00",
          asOf: "2026-08-04T08:10:00+08:00",
          status: "warming_up",
        },
        "pre_open",
      ),
    ).toEqual({
      status: "warming_up",
      headline: "09:45 后可用",
      detail: "开盘后对比近期典型节奏",
      timeLabel: "截至 08:10",
    });
  });

  it("returns early continuous warming_up copy", () => {
    expect(
      insightPanelCopy(
        {
          effectiveTime: "2026-08-04T09:40:00+08:00",
          asOf: "2026-08-04T09:40:00+08:00",
          status: "warming_up",
        },
        "continuous",
      ),
    ).toEqual({
      status: "warming_up",
      headline: "开盘初期",
      detail: "09:45 后再给出放缩量与全天区间",
      timeLabel: "截至 09:40",
    });
  });

  it("returns unavailable copy with human reason text", () => {
    const copy = insightPanelCopy({
      ...baseInsight,
      status: "unavailable",
      reason: "insufficient_shape_days",
    });

    expect(copy).toEqual({
      status: "unavailable",
      title: "预测暂不可用",
      reasonText: "形状样本不足（少于 2 个交易日）",
      timeLabel: "截至 10:30",
    });
  });

  it("maps all unavailable reasons", () => {
    const reasons = [
      "insufficient_shape_days",
      "insufficient_scale_days",
      "insufficient_samples",
      "invalid_profile",
      "invalid_current_data",
      "stale_profile",
      "profile_missing",
    ] as const;

    for (const reason of reasons) {
      const copy = insightPanelCopy({
        ...baseInsight,
        status: "unavailable",
        reason,
      });
      expect(copy.status).toBe("unavailable");
      if (copy.status !== "unavailable") continue;
      expect(copy.reasonText.length).toBeGreaterThan(0);
    }
  });

  it("returns final copy", () => {
    expect(
      insightPanelCopy({
        ...baseInsight,
        status: "final",
        actualFullDayAmount: 2_560_000_000_000,
      }),
    ).toEqual({
      status: "final",
      statusWord: "收盘",
      caption: "全天实际成交额 · 无轨 · 无五档染色",
      foot: "截至 10:30 · 实际单点",
    });
  });
});

describe("pace rail geometry", () => {
  it("places 100% at two-thirds of a 0–150 rail", () => {
    expect(PACE_RAIL_MEDIAN_LEFT_PCT).toBeCloseTo((100 / 150) * 100);
    expect(paceRailLeftPercent(1)).toBeCloseTo((100 / 150) * 100);
    expect(paceRailLeftPercent(0.86)).toBeCloseTo((86 / 150) * 100);
    expect(paceRailLeftPercent(1.5)).toBe(100);
  });
});
