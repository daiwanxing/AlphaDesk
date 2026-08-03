import { fetchDailyKlines, fetchTrends2 } from "../eastmoney";
import { fetchTencentDayMinuteSeries } from "../infrastructure/providers/tencent";
import type { CumulativeMinutePoint, KlineBar } from "../infrastructure/providers/types";
import type {
  IntradayPrevDoc,
  PrevEntry,
  TurnoverMeta,
  TurnoverRepository,
} from "../infrastructure/repository";
import {
  calcDelta,
  cumsumMinuteAmounts,
  mergeMarketCumulatives,
  parseTrendsLine,
  pickSeriesDates,
  scaleSeriesToEndpoint,
  valueAtOrBefore,
  type MinuteAmount,
  type TurnoverPoint,
} from "../series";
import { resolveMarketSession } from "../session";
import { MARKETS } from "../market-config";
import {
  compareModeFor,
  disclaimerFor,
  isSnapshotSession,
  klineOnlyDisclaimerFor,
} from "../domain/turnover-policy";
import type {
  MarketSession,
  MarketTurnoverMarket,
  MarketTurnoverResponse,
} from "@contracts/market-turnover" with { "resolution-mode": "import" };

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 一个完整交易日约 241 个分钟点；留出上游偶发缺点的余量 */
const FULL_DAY_MIN_POINTS = 235;
const FULL_DAY_MIN_LAST_TIME = "14:55";

export type TurnoverDataProvider = {
  fetchTrends2(secId: string, ndays: 2 | 3): Promise<string[]>;
  fetchDailyKlines(secId: string, limit?: number): Promise<KlineBar[]>;
  fetchTencentDayMinuteSeries(secId: string): Promise<Map<string, CumulativeMinutePoint[]>>;
};

export type TurnoverApplicationDependencies = {
  provider?: TurnoverDataProvider;
  repository: () => TurnoverRepository | null;
  onError?: (scope: string, message: string) => void;
};

type MarketDaySeries = Map<string, TurnoverPoint[]>;

function defaultProvider(): TurnoverDataProvider {
  return {
    fetchTrends2,
    fetchDailyKlines,
    fetchTencentDayMinuteSeries,
  };
}

function reportError(
  onError: TurnoverApplicationDependencies["onError"],
  scope: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  onError?.(scope, message);
}

function shanghaiYmd(now: Date): string {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shanghaiAsOf(now: Date): string {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  const s = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}:${s}+08:00`;
}

/** 休市快照：asOf 取主序列交易日最后时刻，避免周末显示「正在更新」。 */
function asOfForSeries(
  session: MarketSession,
  tradeDate: string,
  lastT: string,
  now: Date,
): string {
  if (isSnapshotSession(session) || session === "closed") {
    return `${tradeDate}T${lastT}:00+08:00`;
  }
  return shanghaiAsOf(now);
}

function prevTradingDayYmd(fromYmd: string): string {
  let cursor = new Date(`${fromYmd}T12:00:00+08:00`);
  cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  while (true) {
    const shifted = new Date(cursor.getTime() + SHANGHAI_OFFSET_MS);
    const dow = shifted.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return shanghaiYmd(cursor);
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
}

/** Latest kline bar strictly before `beforeYmd` (never includes today). */
function pickLatestBarBefore(bars: KlineBar[], beforeYmd: string, secId: string): KlineBar {
  let best: KlineBar | null = null;
  for (const bar of bars) {
    if (bar.tradeDate >= beforeYmd) continue;
    if (!best || bar.tradeDate > best.tradeDate) best = bar;
  }
  if (!best) {
    throw new Error(
      `No kline bar before ${beforeYmd} for ${secId} (cannot use today as prev full day)`,
    );
  }
  return best;
}

/** Prev full-day bar: prefer expectedPrevDate, else latest bar with tradeDate < todayYmd. */
function pickPrevDayBar(
  bars: KlineBar[],
  todayYmd: string,
  expectedPrevDate: string,
  secId: string,
): KlineBar {
  const exact = bars.find((b) => b.tradeDate === expectedPrevDate);
  if (exact && exact.tradeDate < todayYmd) return exact;
  return pickLatestBarBefore(bars, todayYmd, secId);
}

function metaResolvedToday(meta: TurnoverMeta, now: Date): boolean {
  if (!meta.updatedAt) return false;
  return shanghaiYmd(new Date(meta.updatedAt)) === shanghaiYmd(now);
}

function isPrevCacheHit(
  cached: PrevEntry | undefined,
  todayYmd: string,
  expectedPrevDate: string,
  metaFreshToday: boolean,
): boolean {
  if (!cached || cached.tradeDate >= todayYmd) return false;
  if (cached.tradeDate === expectedPrevDate) return true;
  // Holiday: weekday-only expectedPrevDate may overshoot; trust today's earlier resolution
  if (metaFreshToday && cached.tradeDate < expectedPrevDate) return true;
  return false;
}

function lastPoint(points: TurnoverPoint[]): TurnoverPoint | undefined {
  return points[points.length - 1];
}

function isFullDaySeries(points: TurnoverPoint[]): boolean {
  const last = lastPoint(points);
  return !!last && points.length >= FULL_DAY_MIN_POINTS && last.t >= FULL_DAY_MIN_LAST_TIME;
}

/** trends2 原始行 → 按交易日分组的分钟累计序列 */
function parseMarketTrends(lines: string[]): MarketDaySeries {
  const minutesByDay = new Map<string, MinuteAmount[]>();

  for (const line of lines) {
    const parsed = parseTrendsLine(line);
    if (!parsed) continue;
    const bucket = minutesByDay.get(parsed.day);
    if (bucket) {
      bucket.push({ t: parsed.t, amount: parsed.amount });
    } else {
      minutesByDay.set(parsed.day, [{ t: parsed.t, amount: parsed.amount }]);
    }
  }

  const seriesByDay: MarketDaySeries = new Map();
  for (const [day, minutes] of minutesByDay) {
    minutes.sort((a, b) => a.t.localeCompare(b.t));
    seriesByDay.set(day, cumsumMinuteAmounts(minutes));
  }
  return seriesByDay;
}

/**
 * 只取三市都有数据的交易日：某市缺该日时合计会少算一市，宁可当天不可用也不给错数。
 */
function tradingDaysCoveredByAllMarkets(perMarket: MarketDaySeries[]): string[] {
  const [first, ...rest] = perMarket;
  if (!first) return [];
  return [...first.keys()]
    .filter((day) => rest.every((market) => market.has(day)))
    .sort((a, b) => a.localeCompare(b));
}

function mergedSeriesFor(perMarket: MarketDaySeries[], day: string): TurnoverPoint[] {
  const perMarketPoints = perMarket.map((market) => market.get(day));
  if (perMarketPoints.some((points) => !points?.length)) return [];
  return mergeMarketCumulatives(perMarketPoints as TurnoverPoint[][]);
}

/**
 * 东财 trends / 文档缓存都没有对比日分时时：腾讯沪深多日分时 + 北证日 K 终点按进度叠加。
 */
function buildSeriesFromTencent(
  shByDay: Map<string, CumulativeMinutePoint[]>,
  szByDay: Map<string, CumulativeMinutePoint[]>,
  tradeDate: string,
  bjEndpoint: number,
): TurnoverPoint[] {
  const sh = shByDay.get(tradeDate) ?? [];
  const sz = szByDay.get(tradeDate) ?? [];
  if (sh.length === 0 || sz.length === 0) return [];

  const hs = mergeMarketCumulatives([sh, sz]);
  if (!isFullDaySeries(hs)) return [];
  if (bjEndpoint <= 0) return hs;

  const bj = scaleSeriesToEndpoint(hs, bjEndpoint);
  return mergeMarketCumulatives([hs, bj]);
}

async function resolvePrevAmounts(
  now: Date,
  meta: TurnoverMeta,
  repository: TurnoverRepository | null,
  provider: TurnoverDataProvider,
  onError: TurnoverApplicationDependencies["onError"],
): Promise<Record<string, PrevEntry>> {
  const todayYmd = shanghaiYmd(now);
  const expectedPrevDate = prevTradingDayYmd(todayYmd);
  const metaFreshToday = metaResolvedToday(meta, now);
  const prevBySecId = { ...meta.prevBySecId };
  const pending: string[] = [];

  for (const market of MARKETS) {
    const cached = prevBySecId[market.secId];
    if (isPrevCacheHit(cached, todayYmd, expectedPrevDate, metaFreshToday)) {
      continue;
    }
    pending.push(market.secId);
  }

  if (pending.length === 0) return prevBySecId;

  const fetched = await Promise.all(
    pending.map(async (secId) => {
      const bars = await provider.fetchDailyKlines(secId, 10);
      const bar = pickPrevDayBar(bars, todayYmd, expectedPrevDate, secId);
      const cached = prevBySecId[secId];
      if (cached && cached.tradeDate === bar.tradeDate && cached.amount === bar.amount) {
        return { secId, bar: cached, changed: false };
      }
      return { secId, bar, changed: true };
    }),
  );

  let anyChanged = false;
  for (const { secId, bar, changed } of fetched) {
    if (changed) {
      prevBySecId[secId] = { tradeDate: bar.tradeDate, amount: bar.amount };
      anyChanged = true;
    }
  }

  if (anyChanged && repository) {
    try {
      await repository.saveTurnoverMeta(prevBySecId);
    } catch (err) {
      reportError(onError, "cache write failed", err);
    }
  }

  return prevBySecId;
}

async function loadKlineSnapshot(
  secId: string,
  todayYmd: string,
  provider: TurnoverDataProvider,
): Promise<{
  amount: number;
  prev: number;
  tradeDate: string;
  prevTradeDate: string;
  bars: KlineBar[];
}> {
  const bars = await provider.fetchDailyKlines(secId, 10);
  const snapshot = pickLatestBarBefore(bars, todayYmd, secId);
  const prevBar = pickLatestBarBefore(bars, snapshot.tradeDate, secId);
  return {
    amount: snapshot.amount,
    prev: prevBar.amount,
    tradeDate: snapshot.tradeDate,
    prevTradeDate: prevBar.tradeDate,
    bars,
  };
}

/**
 * 休市快照兜底：trends2 历史覆盖不足时，用日 K 和腾讯分时补出可用的快照曲线。
 */
async function buildKlineSnapshotResponse(
  now: Date,
  session: MarketSession,
  provider: TurnoverDataProvider,
  onError: TurnoverApplicationDependencies["onError"],
): Promise<MarketTurnoverResponse> {
  const todayYmd = shanghaiYmd(now);
  const snapshots = await Promise.all(
    MARKETS.map(async (market) => ({
      market,
      snap: await loadKlineSnapshot(market.secId, todayYmd, provider),
    })),
  );

  const markets: MarketTurnoverMarket[] = snapshots.map(({ market, snap }) => ({
    id: market.id,
    label: market.label,
    source: market.source,
    amount: snap.amount,
    prevFullDayAmount: snap.prev,
    ...calcDelta(snap.amount, snap.prev),
  }));

  const totalAmount = markets.reduce((sum, m) => sum + m.amount, 0);
  const totalPrevFullDay = markets.reduce((sum, m) => sum + m.prevFullDayAmount, 0);
  const first = snapshots[0]!.snap;
  const snapshotDates = [first.tradeDate, first.prevTradeDate];
  const bjSnapshot = snapshots.find(({ market }) => market.id === "bj")!.snap;

  const endpointsByDate = new Map<string, number>();
  for (const date of snapshotDates) {
    const bjBar = bjSnapshot.bars.find((bar) => bar.tradeDate === date);
    if (bjBar) endpointsByDate.set(date, bjBar.amount);
  }

  let todaySeries: TurnoverPoint[] = [];
  let prevSeries: TurnoverPoint[] = [];
  try {
    const [shByDay, szByDay] = await Promise.all([
      provider.fetchTencentDayMinuteSeries("1.000001"),
      provider.fetchTencentDayMinuteSeries("0.399001"),
    ]);
    todaySeries = buildSeriesFromTencent(
      shByDay,
      szByDay,
      snapshotDates[0]!,
      endpointsByDate.get(snapshotDates[0]!) ?? 0,
    );
    prevSeries = buildSeriesFromTencent(
      shByDay,
      szByDay,
      snapshotDates[1]!,
      endpointsByDate.get(snapshotDates[1]!) ?? 0,
    );
  } catch (err) {
    reportError(onError, "snapshot series fallback failed", err);
  }

  const hasSnapshotSeries = todaySeries.length > 0 && prevSeries.length > 0;
  if (!hasSnapshotSeries) {
    todaySeries = [];
    prevSeries = [];
  }
  const compareMode = compareModeFor(hasSnapshotSeries);
  const prevSameTimeAmount = hasSnapshotSeries
    ? (valueAtOrBefore(prevSeries, lastPoint(todaySeries)?.t ?? "15:00") ?? totalPrevFullDay)
    : totalPrevFullDay;
  const totalDelta = calcDelta(
    totalAmount,
    compareMode === "vs_prev_same_time" ? prevSameTimeAmount : totalPrevFullDay,
  );

  return {
    ok: true,
    asOf: asOfForSeries(session, first.tradeDate, "15:00", now),
    session,
    compareMode,
    disclaimer: hasSnapshotSeries ? disclaimerFor(compareMode) : klineOnlyDisclaimerFor(),
    markets,
    total: {
      amount: totalAmount,
      prevFullDayAmount: totalPrevFullDay,
      prevSameTimeAmount,
      delta: totalDelta.delta,
      deltaPct: totalDelta.deltaPct,
    },
    series: {
      tradeDate: first.tradeDate,
      prevTradeDate: first.prevTradeDate,
      today: todaySeries,
      prev: prevSeries,
    },
    snapshotTradeDate: first.tradeDate,
  };
}

/** 对比日全天成交额（日 K 口径）：主日为今天时走 meta 缓存，否则按主日往前取一根 */
async function resolvePrevFullDayByKline(
  tradeDate: string,
  now: Date,
  meta: TurnoverMeta,
  repository: TurnoverRepository | null,
  provider: TurnoverDataProvider,
  onError: TurnoverApplicationDependencies["onError"],
): Promise<Record<string, PrevEntry>> {
  if (tradeDate === shanghaiYmd(now)) {
    return resolvePrevAmounts(now, meta, repository, provider, onError);
  }

  const entries = await Promise.all(
    MARKETS.map(async (market) => {
      const bars = await provider.fetchDailyKlines(market.secId, 10);
      const bar = pickLatestBarBefore(bars, tradeDate, market.secId);
      return [market.secId, { tradeDate: bar.tradeDate, amount: bar.amount }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function createTurnoverApplication(dependencies: TurnoverApplicationDependencies): {
  buildResponse(now: Date): Promise<MarketTurnoverResponse>;
} {
  const provider = dependencies.provider ?? defaultProvider();

  return {
    async buildResponse(now) {
      const session = resolveMarketSession(now);
      const snapshotMode = isSnapshotSession(session);
      const todayYmd = shanghaiYmd(now);

      let repository: TurnoverRepository | null = null;
      let meta: TurnoverMeta = { _id: "turnover", prevBySecId: {}, updatedAt: "" };
      let cachedPrev: IntradayPrevDoc | null = null;

      try {
        repository = dependencies.repository();
        if (repository) {
          const loaded = await Promise.all([
            repository.loadTurnoverMeta(),
            repository.loadIntradayPrev(),
          ]);
          meta = loaded[0];
          cachedPrev = loaded[1];
        }
      } catch (err) {
        reportError(dependencies.onError, "cache read failed", err);
      }

      const trendsDays = snapshotMode ? 3 : 2;
      const trendResults = await Promise.allSettled(
        MARKETS.map((market) => provider.fetchTrends2(market.secId, trendsDays)),
      );
      const trendErrors: string[] = [];
      const trendsByMarket = trendResults.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        trendErrors.push(`${MARKETS[index]!.secId}: ${message}`);
        dependencies.onError?.(`trends2 failed for ${MARKETS[index]!.secId}`, message);
        return [];
      });
      const seriesByMarket = trendsByMarket.map(parseMarketTrends);

      let availableDays = tradingDaysCoveredByAllMarkets(seriesByMarket);
      if (snapshotMode) {
        // 盘前上游可能已带出当日空/竞价点，快照语义只允许历史交易日
        availableDays = availableDays.filter((day) => day < todayYmd);
      }
      const minimumDays = snapshotMode ? 2 : 1;
      if (availableDays.length < minimumDays) {
        if (snapshotMode) {
          return buildKlineSnapshotResponse(now, session, provider, dependencies.onError);
        }
        const details = trendErrors.length > 0 ? `: ${trendErrors.join("; ")}` : "";
        throw new Error(`trends2 returned no trading day covered by all markets${details}`);
      }

      const dates =
        availableDays.length >= 2
          ? pickSeriesDates(session, todayYmd, availableDays)
          : { tradeDate: availableDays[0]!, prevTradeDate: "" };

      const todaySeries = mergedSeriesFor(seriesByMarket, dates.tradeDate);
      const lastToday = lastPoint(todaySeries);
      if (!lastToday) {
        throw new Error(`No aligned minute points across markets for ${dates.tradeDate}`);
      }

      let prevTradeDate = dates.prevTradeDate;
      const trendsPrev = prevTradeDate ? mergedSeriesFor(seriesByMarket, prevTradeDate) : [];
      // 截断的对比日曲线会让同时刻对比偏低，只有整日序列才可信
      const trendsPrevIsFullDay = isFullDaySeries(trendsPrev);

      let prevSeries: TurnoverPoint[] = trendsPrevIsFullDay ? trendsPrev : [];
      let prevFullDayBySecId: Record<string, number>;
      let prevSeriesFromCache = false;

      if (trendsPrevIsFullDay) {
        prevFullDayBySecId = Object.fromEntries(
          MARKETS.map((market, index) => {
            const points = seriesByMarket[index]!.get(prevTradeDate) ?? [];
            return [market.secId, lastPoint(points)?.v ?? 0];
          }),
        );
      } else {
        const prevByKline = await resolvePrevFullDayByKline(
          dates.tradeDate,
          now,
          meta,
          repository,
          provider,
          dependencies.onError,
        );
        const prevEntries = MARKETS.map((market) => {
          const entry = prevByKline[market.secId];
          if (!entry) {
            throw new Error(`Missing prev-day amount for ${market.secId}`);
          }
          return { secId: market.secId, entry };
        });
        prevFullDayBySecId = Object.fromEntries(
          prevEntries.map(({ secId, entry }) => [secId, entry.amount]),
        );

        if (!prevTradeDate) {
          prevTradeDate = prevEntries[0]!.entry.tradeDate;
        }
        if (cachedPrev && cachedPrev.prevTradeDate === prevTradeDate) {
          prevSeries = cachedPrev.points;
          prevSeriesFromCache = true;
        }
        if (prevSeries.length === 0) {
          try {
            const bjSecId = MARKETS.find((m) => m.id === "bj")!.secId;
            const [shByDay, szByDay] = await Promise.all([
              provider.fetchTencentDayMinuteSeries("1.000001"),
              provider.fetchTencentDayMinuteSeries("0.399001"),
            ]);
            prevSeries = buildSeriesFromTencent(
              shByDay,
              szByDay,
              prevTradeDate,
              prevFullDayBySecId[bjSecId] ?? 0,
            );
          } catch (err) {
            reportError(dependencies.onError, "tencent prev fallback failed", err);
          }
        }
      }

      const markets: MarketTurnoverMarket[] = MARKETS.map((market, index) => {
        const dayPoints = seriesByMarket[index]!.get(dates.tradeDate) ?? [];
        const amount = lastPoint(dayPoints)?.v;
        if (amount === undefined) {
          throw new Error(`Missing trends amount for ${market.secId} on ${dates.tradeDate}`);
        }
        const prevFullDayAmount = prevFullDayBySecId[market.secId] ?? 0;
        const { delta, deltaPct } = calcDelta(amount, prevFullDayAmount);
        return {
          id: market.id,
          label: market.label,
          source: market.source,
          amount,
          prevFullDayAmount,
          delta,
          deltaPct,
        };
      });

      const compareMode = compareModeFor(prevSeries.length > 0);
      const totalAmount = lastToday.v;
      const totalPrevFullDay = markets.reduce((sum, m) => sum + m.prevFullDayAmount, 0);
      const prevSameTimeAmount =
        compareMode === "vs_prev_same_time"
          ? (valueAtOrBefore(prevSeries, lastToday.t) ?? totalPrevFullDay)
          : totalPrevFullDay;
      const totalDelta = calcDelta(
        totalAmount,
        compareMode === "vs_prev_same_time" ? prevSameTimeAmount : totalPrevFullDay,
      );

      // 缓存槽只有一个：优先存最新的整日序列，但不覆盖本次正被当作对比曲线用的那一天
      const cacheCandidate = (() => {
        if (isFullDaySeries(todaySeries) && !prevSeriesFromCache) {
          return { tradeDate: dates.tradeDate, points: todaySeries };
        }
        if (trendsPrevIsFullDay) {
          return { tradeDate: prevTradeDate, points: prevSeries };
        }
        return null;
      })();

      if (repository && cacheCandidate && isCacheWriteWorthwhile(cachedPrev, cacheCandidate)) {
        try {
          await repository.saveIntradayPrev(cacheCandidate.tradeDate, cacheCandidate.points);
        } catch (err) {
          reportError(dependencies.onError, "intraday cache write failed", err);
        }
      }

      const response: MarketTurnoverResponse = {
        ok: true,
        asOf: asOfForSeries(session, dates.tradeDate, lastToday.t, now),
        session,
        compareMode,
        disclaimer: disclaimerFor(compareMode),
        markets,
        total: {
          amount: totalAmount,
          prevFullDayAmount: totalPrevFullDay,
          prevSameTimeAmount,
          delta: totalDelta.delta,
          deltaPct: totalDelta.deltaPct,
        },
        series: {
          tradeDate: dates.tradeDate,
          prevTradeDate,
          today: todaySeries,
          prev: prevSeries,
        },
      };

      if (snapshotMode) {
        response.snapshotTradeDate = dates.tradeDate;
      }

      return response;
    },
  };
}

function isCacheWriteWorthwhile(
  cached: IntradayPrevDoc | null,
  candidate: { tradeDate: string; points: TurnoverPoint[] },
): boolean {
  if (!cached) return true;
  if (candidate.tradeDate > cached.prevTradeDate) return true;
  return (
    candidate.tradeDate === cached.prevTradeDate && candidate.points.length !== cached.points.length
  );
}
