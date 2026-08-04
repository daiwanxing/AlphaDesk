import {
  EXPECTED_TRADING_MINUTE_COUNT,
  isTradingMinute,
  TRADING_MINUTES,
  TRADING_SESSION_MINUTES,
} from "./trading-minutes";

import type { MarketId, TurnoverPoint } from "@contracts/market-turnover" with {
  "resolution-mode": "import",
};

const MIN_VALID_POINTS = 230;
const MAX_SESSION_GAP = 5;
const MIN_LAST_POINT_HHMM = "14:55";
const MAX_FULL_DAY_DRIFT = 0.01;
const SCHEMA_VERSION = 1;

export const PROFILE_MARKET_IDS: readonly MarketId[] = ["sh", "sz", "bj"];

export type ProfileMarketInput = {
  points: TurnoverPoint[];
  fullDayAmount: number;
  source: string;
  /** 合成或按比例缩放的兜底序列：可存 `degraded` 供诊断，永远不算 `complete`。 */
  synthetic?: boolean;
};

export type ProfileQualityIssue =
  | "insufficient_points"
  | "gap_too_long"
  | "not_monotonic"
  | "last_point_too_early"
  | "invalid_full_day"
  | "full_day_mismatch"
  | "synthetic_source";

export type ProfileAssessment = {
  complete: boolean;
  validPointCount: number;
  lastPoint?: string;
  maxSessionGap: number;
  issues: ProfileQualityIssue[];
};

export type TurnoverProfileMarket = {
  points: TurnoverPoint[];
  fullDayAmount: number;
  source: string;
};

export type TurnoverProfileQuality = {
  schemaVersion: number;
  status: "complete" | "degraded";
  completeMarkets: MarketId[];
  lastPoint?: string;
  validPointCount: number;
  expectedPointCount: number;
  source: string;
};

export type TurnoverProfileDoc = {
  docType: "turnover_profile";
  tradeDate: string;
  unit: "yuan";
  timeZone: "Asia/Shanghai";
  markets: Record<MarketId, TurnoverProfileMarket>;
  total: { points: TurnoverPoint[]; fullDayAmount: number };
  quality: TurnoverProfileQuality;
  generatedAt: string;
};

export type BuildTurnoverProfileInput = {
  tradeDate: string;
  markets: Record<MarketId, ProfileMarketInput>;
  generatedAt: string;
};

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** 只保留落在交易轴上的有限非负点，按轴顺序去重排序。 */
function normalizePoints(points: TurnoverPoint[]): TurnoverPoint[] {
  const byMinute = new Map<string, number>();
  for (const point of points) {
    if (!isTradingMinute(point.t)) continue;
    if (!Number.isFinite(point.v) || point.v < 0) continue;
    byMinute.set(point.t, point.v);
  }

  return TRADING_MINUTES.filter((t) => byMinute.has(t)).map((t) => ({ t, v: byMinute.get(t)! }));
}

function maxSessionGap(present: Set<string>): number {
  let longest = 0;
  for (const session of TRADING_SESSION_MINUTES) {
    let run = 0;
    for (const t of session) {
      run = present.has(t) ? 0 : run + 1;
      if (run > longest) longest = run;
    }
  }
  return longest;
}

function isMonotonic(points: TurnoverPoint[]): boolean {
  return points.every((point, index) => index === 0 || point.v >= points[index - 1]!.v);
}

/** 按规格 §3.5 判定单个市场的分钟序列是否可作为 `complete` 样本。 */
export function assessProfileQuality(market: ProfileMarketInput): ProfileAssessment {
  const points = normalizePoints(market.points);
  const lastPoint = points[points.length - 1];
  const gap = maxSessionGap(new Set(points.map((point) => point.t)));
  const issues: ProfileQualityIssue[] = [];

  if (points.length < MIN_VALID_POINTS) issues.push("insufficient_points");
  if (gap > MAX_SESSION_GAP) issues.push("gap_too_long");
  if (!isMonotonic(points)) issues.push("not_monotonic");
  if (!lastPoint || lastPoint.t < MIN_LAST_POINT_HHMM) issues.push("last_point_too_early");

  if (!isPositiveFinite(market.fullDayAmount)) {
    issues.push("invalid_full_day");
  } else if (
    !lastPoint ||
    Math.abs(lastPoint.v - market.fullDayAmount) / market.fullDayAmount > MAX_FULL_DAY_DRIFT
  ) {
    issues.push("full_day_mismatch");
  }

  if (market.synthetic) issues.push("synthetic_source");

  return {
    complete: issues.length === 0,
    validPointCount: points.length,
    lastPoint: lastPoint?.t,
    maxSessionGap: gap,
    issues,
  };
}

/** 三市按分钟对齐求和；任一市场缺该分钟则该分钟不进 total。 */
function alignTotal(markets: Record<MarketId, TurnoverProfileMarket>): TurnoverPoint[] {
  const lookups = PROFILE_MARKET_IDS.map(
    (id) => new Map(markets[id].points.map((point) => [point.t, point.v])),
  );

  const total: TurnoverPoint[] = [];
  for (const t of TRADING_MINUTES) {
    if (!lookups.every((lookup) => lookup.has(t))) continue;
    total.push({ t, v: lookups.reduce((sum, lookup) => sum + lookup.get(t)!, 0) });
  }
  return total;
}

export function buildTurnoverProfile(input: BuildTurnoverProfileInput): TurnoverProfileDoc {
  const markets = {} as Record<MarketId, TurnoverProfileMarket>;
  const completeMarkets: MarketId[] = [];
  const sources: string[] = [];

  for (const id of PROFILE_MARKET_IDS) {
    const market = input.markets[id];
    markets[id] = {
      points: normalizePoints(market.points),
      fullDayAmount: market.fullDayAmount,
      source: market.source,
    };
    if (assessProfileQuality(market).complete) completeMarkets.push(id);
    if (!sources.includes(market.source)) sources.push(market.source);
  }

  const points = alignTotal(markets);
  const fullDayAmount = PROFILE_MARKET_IDS.reduce((sum, id) => {
    const amount = markets[id].fullDayAmount;
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return {
    docType: "turnover_profile",
    tradeDate: input.tradeDate,
    unit: "yuan",
    timeZone: "Asia/Shanghai",
    markets,
    total: { points, fullDayAmount },
    quality: {
      schemaVersion: SCHEMA_VERSION,
      status: completeMarkets.length === PROFILE_MARKET_IDS.length ? "complete" : "degraded",
      completeMarkets,
      lastPoint: points[points.length - 1]?.t,
      validPointCount: points.length,
      expectedPointCount: EXPECTED_TRADING_MINUTE_COUNT,
      source: sources.join("+"),
    },
    generatedAt: input.generatedAt,
  };
}
