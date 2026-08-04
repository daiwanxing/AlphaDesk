import { valueAtOrBefore } from "../series";

import type { MarketSession } from "../session";

import type {
  TurnoverInsight,
  TurnoverInsightBaseline,
  TurnoverInsightReason,
  TurnoverPaceState,
} from "@contracts/market-turnover" with { "resolution-mode": "import" };

const WINDOW_DAYS = 20;
const PROFILE_MIN_SAMPLES = 10;
const SHAPE_MIN_DAYS = 2;
const SCALE_MIN_DAYS = 10;
const EARLIEST_PREDICT_HHMM = "09:45";
const LUNCH_LAST_HHMM = "11:30";
const CLOSE_HHMM = "15:00";
const FINAL_MIN_LAST_HHMM = "14:55";

export type InsightDaySeries = {
  tradeDate: string;
  points: { t: string; v: number }[];
  fullDayAmount: number;
};

export type ComputeInsightInput = {
  session: MarketSession;
  asOf: string;
  wallClockHHmm: string;
  todayPoints: { t: string; v: number }[];
  todayFullDayAmount?: number;
  completeProfiles: InsightDaySeries[];
  shapeDays: InsightDaySeries[];
  scaleFullDayAmounts: number[];
  now: Date;
};

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 升序样本按位置 `p * (n - 1)` 线性插值。 */
export function percentileLinear(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  const pos = p * (sortedAsc.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedAsc[lower]!;
  return sortedAsc[lower]! + (pos - lower) * (sortedAsc[upper]! - sortedAsc[lower]!);
}

export function paceStateFromRatio(ratio: number): TurnoverPaceState {
  if (ratio >= 1.1) return "strongly_expanding";
  if (ratio >= 1.03) return "expanding";
  if (ratio >= 0.97) return "normal";
  if (ratio >= 0.9) return "contracting";
  return "strongly_contracting";
}

function minusOneMinute(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = h! * 60 + m! - 1;
  if (total < 0) return "00:00";
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 已完成的最后一分钟：受时段上限与今日最后有效点共同约束。 */
export function resolveEffectiveMinute(input: {
  session: MarketSession;
  wallClockHHmm: string;
  lastPointT: string | undefined;
}): string | undefined {
  const { session, wallClockHHmm, lastPointT } = input;
  if (session === "pre_open") return undefined;

  const cap =
    session === "lunch"
      ? LUNCH_LAST_HHMM
      : session === "closed" || session === "weekend"
        ? CLOSE_HHMM
        : minusOneMinute(wallClockHHmm);

  if (!lastPointT) return cap;
  return lastPointT < cap ? lastPointT : cap;
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

type Projection = {
  projectedFullDayAmount: number;
  projectedRange?: { low: number; high: number };
};

/** 由进度形状样本推出全天预测与 P25/P75 区间。 */
function project(current: number, progressRatios: number[]): Projection | undefined {
  const baselineProgress = median(progressRatios);
  if (!isPositiveFinite(baselineProgress)) return undefined;

  const sorted = [...progressRatios].sort((a, b) => a - b);
  const p25 = percentileLinear(sorted, 0.25);
  const p75 = percentileLinear(sorted, 0.75);
  const projection: Projection = { projectedFullDayAmount: current / baselineProgress };

  if (isPositiveFinite(p25) && isPositiveFinite(p75)) {
    projection.projectedRange = { low: current / p75, high: current / p25 };
  }
  return projection;
}

function unavailable(
  reason: TurnoverInsightReason,
  effectiveTime: string,
  asOf: string,
): TurnoverInsight {
  return { status: "unavailable", reason, effectiveTime, asOf };
}

type MinuteSample = { tradeDate: string; cumulative: number; progress?: number };

function sampleAtMinute(day: InsightDaySeries, minute: string): MinuteSample | undefined {
  const cumulative = valueAtOrBefore(day.points, minute);
  if (!isPositiveFinite(cumulative)) return undefined;
  const progress = isPositiveFinite(day.fullDayAmount) ? cumulative / day.fullDayAmount : undefined;
  return { tradeDate: day.tradeDate, cumulative, progress };
}

export function computeTurnoverInsight(input: ComputeInsightInput): TurnoverInsight {
  const { session, asOf, wallClockHHmm, todayPoints, todayFullDayAmount } = input;

  const lastPointT = todayPoints[todayPoints.length - 1]?.t;
  const effectiveTime = resolveEffectiveMinute({ session, wallClockHHmm, lastPointT });

  if (
    session === "closed" &&
    isPositiveFinite(todayFullDayAmount) &&
    lastPointT &&
    lastPointT >= FINAL_MIN_LAST_HHMM
  ) {
    return {
      status: "final",
      effectiveTime: effectiveTime ?? lastPointT,
      actualFullDayAmount: todayFullDayAmount,
      asOf,
    };
  }

  if (!effectiveTime || (session === "continuous" && wallClockHHmm < EARLIEST_PREDICT_HHMM)) {
    return { status: "warming_up", effectiveTime: effectiveTime ?? wallClockHHmm, asOf };
  }

  const current = valueAtOrBefore(todayPoints, effectiveTime);
  if (!isPositiveFinite(current)) {
    return unavailable("invalid_current_data", effectiveTime, asOf);
  }

  const profileSamples = input.completeProfiles
    .map((day) => sampleAtMinute(day, effectiveTime))
    .filter((sample): sample is MinuteSample => sample !== undefined);

  if (profileSamples.length >= PROFILE_MIN_SAMPLES) {
    return fromProfile(input, effectiveTime, current, profileSamples);
  }

  return fromBootstrap(input, effectiveTime, current, profileSamples.length);
}

function buildInsight(args: {
  asOf: string;
  effectiveTime: string;
  current: number;
  typical: number;
  progressRatios: number[];
  baseline: TurnoverInsightBaseline;
}): TurnoverInsight {
  const { asOf, effectiveTime, current, typical, progressRatios, baseline } = args;
  const paceRatio = current / typical;
  if (!Number.isFinite(paceRatio)) {
    return unavailable("invalid_current_data", effectiveTime, asOf);
  }

  return {
    status: "active",
    paceState: paceStateFromRatio(paceRatio),
    effectiveTime,
    paceRatio,
    ...project(current, progressRatios),
    baseline,
    asOf,
  };
}

function fromProfile(
  input: ComputeInsightInput,
  effectiveTime: string,
  current: number,
  samples: MinuteSample[],
): TurnoverInsight {
  const typical = median(samples.map((sample) => sample.cumulative));
  if (!isPositiveFinite(typical)) {
    return unavailable("invalid_current_data", effectiveTime, input.asOf);
  }

  const tradeDates = samples.map((sample) => sample.tradeDate).sort();

  return buildInsight({
    asOf: input.asOf,
    effectiveTime,
    current,
    typical,
    progressRatios: samples
      .map((sample) => sample.progress)
      .filter((progress): progress is number => isPositiveFinite(progress)),
    baseline: {
      windowDays: WINDOW_DAYS,
      sampleDays: samples.length,
      firstTradeDate: tradeDates[0],
      lastTradeDate: tradeDates[tradeDates.length - 1],
      method: "median_intraday_progress_v1",
      quality: samples.length >= WINDOW_DAYS ? "mature" : "active",
    },
  });
}

function fromBootstrap(
  input: ComputeInsightInput,
  effectiveTime: string,
  current: number,
  profileSampleDays: number,
): TurnoverInsight {
  const shapeSamples = input.shapeDays
    .map((day) => sampleAtMinute(day, effectiveTime))
    .map((sample) => sample?.progress)
    .filter((progress): progress is number => isPositiveFinite(progress));

  if (shapeSamples.length < SHAPE_MIN_DAYS) {
    return unavailable("insufficient_shape_days", effectiveTime, input.asOf);
  }

  const scaleSamples = input.scaleFullDayAmounts.filter(isPositiveFinite);
  if (scaleSamples.length < SCALE_MIN_DAYS) {
    return unavailable("insufficient_scale_days", effectiveTime, input.asOf);
  }

  const baselineProgress = median(shapeSamples);
  const typical = median(scaleSamples) * baselineProgress;
  if (!isPositiveFinite(typical)) {
    return unavailable("invalid_current_data", effectiveTime, input.asOf);
  }

  return buildInsight({
    asOf: input.asOf,
    effectiveTime,
    current,
    typical,
    progressRatios: shapeSamples,
    baseline: {
      windowDays: WINDOW_DAYS,
      sampleDays: profileSampleDays,
      shapeDays: shapeSamples.length,
      scaleDays: scaleSamples.length,
      method: "kline_scale_short_shape_v1",
      quality: "bootstrap",
    },
  });
}
