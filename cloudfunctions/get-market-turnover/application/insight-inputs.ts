import type { InsightDaySeries } from "../domain/turnover-insight";
import type { TurnoverProfileDoc } from "../domain/turnover-profile";
import type { CumulativeMinutePoint } from "../infrastructure/providers/types";
import type { TurnoverRepository } from "../infrastructure/repository";
import { MARKETS } from "../market-config";
import {
  mergeMarketCumulatives,
  parseTrendsByDay,
  scaleSeriesToEndpoint,
  type TurnoverPoint,
} from "../series";
import type { TurnoverDataProvider } from "./service";

/** 目标展示窗口；profile 保留更长历史以便补缺（规格 §3.5）。 */
const WINDOW_DAYS = 20;
const PROFILE_LIST_LIMIT = 60;
/** 与 domain 的 PROFILE_MIN_SAMPLES 对齐：够了就不必再为 bootstrap 拉数。 */
const PROFILE_MODE_MIN_SAMPLES = 10;
const SHAPE_MIN_DAYS = 2;
const SCALE_KLINE_LIMIT = 25;
const SHAPE_TRENDS_DAYS = 3;

export type InsightInputs = {
  completeProfiles: InsightDaySeries[];
  shapeDays: InsightDaySeries[];
  scaleFullDayAmounts: number[];
};

export type AssembleInsightInputsArgs = {
  /** 主序列交易日：形状与尺度样本必须严格早于它。 */
  tradeDate: string;
  provider: TurnoverDataProvider;
  repository: TurnoverRepository | null;
  onError?: (scope: string, message: string) => void;
};

const EMPTY: InsightInputs = {
  completeProfiles: [],
  shapeDays: [],
  scaleFullDayAmounts: [],
};

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function report(args: AssembleInsightInputsArgs, scope: string, error: unknown): void {
  args.onError?.(scope, error instanceof Error ? error.message : String(error));
}

function profileToDaySeries(doc: TurnoverProfileDoc): InsightDaySeries {
  return {
    tradeDate: doc.tradeDate,
    points: doc.total.points,
    fullDayAmount: doc.total.fullDayAmount,
  };
}

async function loadCompleteProfiles(args: AssembleInsightInputsArgs): Promise<InsightDaySeries[]> {
  if (!args.repository) return [];
  try {
    const docs = await args.repository.listTurnoverProfiles(PROFILE_LIST_LIMIT);
    return docs
      .filter((doc) => doc?.quality?.status === "complete" && doc.tradeDate < args.tradeDate)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      .slice(-WINDOW_DAYS)
      .map(profileToDaySeries);
  } catch (err) {
    report(args, "turnoverInsight profiles unavailable", err);
    return [];
  }
}

type KlineScale = {
  /** 三市对齐的全天合计，仅含 tradeDate 之前的日期 */
  totalByDate: Map<string, number>;
  bjByDate: Map<string, number>;
};

/** 三市日 K 按日期对齐求和；缺任一市场的日期直接跳过，避免少算一市。 */
async function loadKlineScale(args: AssembleInsightInputsArgs): Promise<KlineScale> {
  const barsByMarket = await Promise.all(
    MARKETS.map((market) => args.provider.fetchDailyKlines(market.secId, SCALE_KLINE_LIMIT)),
  );
  const amountByMarket = barsByMarket.map(
    (bars) => new Map(bars.map((bar) => [bar.tradeDate, bar.amount])),
  );

  const totalByDate = new Map<string, number>();
  for (const date of amountByMarket[0]!.keys()) {
    if (date >= args.tradeDate) continue;
    const amounts = amountByMarket.map((lookup) => lookup.get(date));
    if (!amounts.every(isPositiveFinite)) continue;
    totalByDate.set(
      date,
      amounts.reduce((sum, amount) => sum + amount, 0),
    );
  }

  const bjIndex = MARKETS.findIndex((market) => market.id === "bj");
  return { totalByDate, bjByDate: amountByMarket[bjIndex]! };
}

function scaleAmountsFrom(totalByDate: Map<string, number>): number[] {
  return [...totalByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-WINDOW_DAYS)
    .map(([, amount]) => amount);
}

/** 东财 trends2 近几日：三市都覆盖且日 K 能给出 F_s 的历史日才算有效形状日。 */
async function shapeDaysFromTrends(
  args: AssembleInsightInputsArgs,
  totalByDate: Map<string, number>,
): Promise<InsightDaySeries[]> {
  const trends = await Promise.all(
    MARKETS.map((market) => args.provider.fetchTrends2(market.secId, SHAPE_TRENDS_DAYS)),
  );
  const byMarket = trends.map(parseTrendsByDay);

  const days = [...byMarket[0]!.keys()]
    .filter((day) => day < args.tradeDate && byMarket.every((market) => market.has(day)))
    .sort((a, b) => a.localeCompare(b));

  const shapeDays: InsightDaySeries[] = [];
  for (const day of days) {
    const fullDayAmount = totalByDate.get(day);
    if (!isPositiveFinite(fullDayAmount)) continue;
    const points = mergeMarketCumulatives(byMarket.map((market) => market.get(day)!));
    if (points.length === 0) continue;
    shapeDays.push({ tradeDate: day, points, fullDayAmount });
  }
  return shapeDays;
}

/** 腾讯沪深多日分时兜底；北证无额字段，按日 K 终点比例叠加（不改变进度形状）。 */
async function shapeDaysFromTencent(
  args: AssembleInsightInputsArgs,
  scale: KlineScale,
): Promise<InsightDaySeries[]> {
  const [shByDay, szByDay] = await Promise.all([
    args.provider.fetchTencentDayMinuteSeries("1.000001"),
    args.provider.fetchTencentDayMinuteSeries("0.399001"),
  ]);

  const shapeDays: InsightDaySeries[] = [];
  for (const day of [...shByDay.keys()].sort((a, b) => a.localeCompare(b))) {
    if (day >= args.tradeDate) continue;
    const fullDayAmount = scale.totalByDate.get(day);
    if (!isPositiveFinite(fullDayAmount)) continue;

    const sh: CumulativeMinutePoint[] = shByDay.get(day) ?? [];
    const sz: CumulativeMinutePoint[] = szByDay.get(day) ?? [];
    if (sh.length === 0 || sz.length === 0) continue;

    const hs = mergeMarketCumulatives([sh, sz]);
    if (hs.length === 0) continue;

    const bjAmount = scale.bjByDate.get(day);
    const points: TurnoverPoint[] = isPositiveFinite(bjAmount)
      ? mergeMarketCumulatives([hs, scaleSeriesToEndpoint(hs, bjAmount)])
      : hs;
    shapeDays.push({ tradeDate: day, points, fullDayAmount });
  }
  return shapeDays;
}

function mergeShapeDays(
  preferred: InsightDaySeries[],
  extra: InsightDaySeries[],
): InsightDaySeries[] {
  const known = new Set(preferred.map((day) => day.tradeDate));
  return [...preferred, ...extra.filter((day) => !known.has(day.tradeDate))];
}

/**
 * 组装 `computeTurnoverInsight` 的历史样本。
 * profile 样本足够时直接返回，不再为 bootstrap 额外拉第三方数据。
 */
export async function assembleInsightInputs(
  args: AssembleInsightInputsArgs,
): Promise<InsightInputs> {
  const completeProfiles = await loadCompleteProfiles(args);
  if (completeProfiles.length >= PROFILE_MODE_MIN_SAMPLES) {
    return {
      completeProfiles,
      shapeDays: completeProfiles,
      scaleFullDayAmounts: [],
    };
  }

  let scale: KlineScale;
  try {
    scale = await loadKlineScale(args);
  } catch (err) {
    report(args, "turnoverInsight scale unavailable", err);
    return { ...EMPTY, completeProfiles, shapeDays: completeProfiles };
  }

  let shapeDays = completeProfiles;
  if (shapeDays.length < SHAPE_MIN_DAYS) {
    try {
      shapeDays = mergeShapeDays(shapeDays, await shapeDaysFromTrends(args, scale.totalByDate));
    } catch (err) {
      report(args, "turnoverInsight trends shape unavailable", err);
    }
  }
  if (shapeDays.length < SHAPE_MIN_DAYS) {
    try {
      shapeDays = mergeShapeDays(shapeDays, await shapeDaysFromTencent(args, scale));
    } catch (err) {
      report(args, "turnoverInsight tencent shape unavailable", err);
    }
  }

  return {
    completeProfiles,
    shapeDays,
    scaleFullDayAmounts: scaleAmountsFrom(scale.totalByDate),
  };
}
