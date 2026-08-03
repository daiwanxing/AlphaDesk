import cloudbase from "@cloudbase/node-sdk";
import {
  fetchDailyKlines,
  fetchTencentDayMinuteSeries,
  fetchTrends2,
  type CumulativeMinutePoint,
  type KlineBar,
} from "./eastmoney";
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
} from "./series";
import { resolveMarketSession, type MarketSession } from "./session";
import { createTurnoverServer } from "./http";
import { MARKETS } from "./market-config";
import {
  compareModeFor,
  disclaimerFor,
  isSnapshotSession,
  klineOnlyDisclaimerFor,
  type CompareMode,
} from "./domain/turnover-policy";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 一个完整交易日约 241 个分钟点；留出上游偶发缺点的余量 */
const FULL_DAY_MIN_POINTS = 235;
const FULL_DAY_MIN_LAST_TIME = "14:55";

type PrevEntry = { tradeDate: string; amount: number };

type TurnoverMeta = {
  _id: "turnover";
  prevBySecId: Record<string, PrevEntry>;
  updatedAt: string;
};

type IntradayPrevDoc = {
  _id: "turnover_intraday_prev";
  prevTradeDate: string;
  points: TurnoverPoint[];
  updatedAt: string;
};

/** 单市：交易日 → 该日分钟累计序列 */
type MarketDaySeries = Map<string, TurnoverPoint[]>;

type MarketTurnoverMarket = {
  id: "sh" | "sz" | "bj";
  label: string;
  source: string;
  amount: number;
  prevFullDayAmount: number;
  delta: number;
  deltaPct: number;
};

type MarketTurnoverTotal = {
  amount: number;
  prevFullDayAmount: number;
  prevSameTimeAmount: number;
  delta: number;
  deltaPct: number;
};

type MarketTurnoverSeries = {
  tradeDate: string;
  prevTradeDate: string;
  today: TurnoverPoint[];
  prev: TurnoverPoint[];
};

type MarketTurnoverResponse = {
  ok: true;
  asOf: string;
  session: MarketSession;
  compareMode: CompareMode;
  disclaimer: string;
  markets: MarketTurnoverMarket[];
  total: MarketTurnoverTotal;
  series: MarketTurnoverSeries;
  snapshotTradeDate?: string;
};

function nowIso(): string {
  return new Date().toISOString();
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

function dbOf() {
  return cloudbase.init({ env: ENV_ID }).database();
}

async function loadTurnoverMeta(db: ReturnType<typeof dbOf>): Promise<TurnoverMeta> {
  const res = await db.collection("pipeline_meta").doc("turnover").get();
  const rows = (res.data ?? []) as TurnoverMeta[];
  return rows[0] ?? { _id: "turnover", prevBySecId: {}, updatedAt: "" };
}

async function saveTurnoverMeta(
  db: ReturnType<typeof dbOf>,
  prevBySecId: Record<string, PrevEntry>,
): Promise<void> {
  await db.collection("pipeline_meta").doc("turnover").set({
    _id: "turnover",
    prevBySecId,
    updatedAt: nowIso(),
  });
}

async function loadIntradayPrev(db: ReturnType<typeof dbOf>): Promise<IntradayPrevDoc | null> {
  const res = await db.collection("pipeline_meta").doc("turnover_intraday_prev").get();
  const rows = (res.data ?? []) as IntradayPrevDoc[];
  const doc = rows[0];
  if (!doc?.prevTradeDate || !Array.isArray(doc.points) || doc.points.length === 0) {
    return null;
  }
  return doc;
}

/** 不回写更旧的交易日，也不重复回写同一份 */
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

async function saveIntradayPrev(
  db: ReturnType<typeof dbOf>,
  prevTradeDate: string,
  points: TurnoverPoint[],
): Promise<void> {
  await db.collection("pipeline_meta").doc("turnover_intraday_prev").set({
    _id: "turnover_intraday_prev",
    prevTradeDate,
    points,
    updatedAt: nowIso(),
  });
}

async function resolvePrevAmounts(
  now: Date,
  meta: TurnoverMeta,
  db: ReturnType<typeof dbOf> | null,
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
      const bars = await fetchDailyKlines(secId, 10);
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

  if (anyChanged && db) {
    try {
      await saveTurnoverMeta(db, prevBySecId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-market-turnover] cache write failed:", message);
    }
  }

  return prevBySecId;
}

async function loadKlineSnapshot(
  secId: string,
  todayYmd: string,
): Promise<{
  amount: number;
  prev: number;
  tradeDate: string;
  prevTradeDate: string;
  bars: KlineBar[];
}> {
  const bars = await fetchDailyKlines(secId, 10);
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
): Promise<MarketTurnoverResponse> {
  const todayYmd = shanghaiYmd(now);
  const snapshots = await Promise.all(
    MARKETS.map(async (market) => ({
      market,
      snap: await loadKlineSnapshot(market.secId, todayYmd),
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
      fetchTencentDayMinuteSeries("1.000001"),
      fetchTencentDayMinuteSeries("0.399001"),
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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[get-market-turnover] snapshot series fallback failed:", message);
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
  db: ReturnType<typeof dbOf> | null,
): Promise<Record<string, PrevEntry>> {
  if (tradeDate === shanghaiYmd(now)) {
    return resolvePrevAmounts(now, meta, db);
  }

  const entries = await Promise.all(
    MARKETS.map(async (market) => {
      const bars = await fetchDailyKlines(market.secId, 10);
      const bar = pickLatestBarBefore(bars, tradeDate, market.secId);
      return [market.secId, { tradeDate: bar.tradeDate, amount: bar.amount }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function buildResponse(now: Date): Promise<MarketTurnoverResponse> {
  const session = resolveMarketSession(now);
  const snapshotMode = isSnapshotSession(session);
  const todayYmd = shanghaiYmd(now);

  let db: ReturnType<typeof dbOf> | null = null;
  let meta: TurnoverMeta = { _id: "turnover", prevBySecId: {}, updatedAt: "" };
  let cachedPrev: IntradayPrevDoc | null = null;

  try {
    db = dbOf();
    const loaded = await Promise.all([loadTurnoverMeta(db), loadIntradayPrev(db)]);
    meta = loaded[0];
    cachedPrev = loaded[1];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[get-market-turnover] cache read failed:", message);
  }

  const trendsDays = snapshotMode ? 3 : 2;
  const trendResults = await Promise.allSettled(
    MARKETS.map((market) => fetchTrends2(market.secId, trendsDays)),
  );
  const trendErrors: string[] = [];
  const trendsByMarket = trendResults.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    trendErrors.push(`${MARKETS[index]!.secId}: ${message}`);
    console.error(`[get-market-turnover] trends2 failed for ${MARKETS[index]!.secId}:`, message);
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
    if (snapshotMode) return buildKlineSnapshotResponse(now, session);
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
    const prevByKline = await resolvePrevFullDayByKline(dates.tradeDate, now, meta, db);
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
          fetchTencentDayMinuteSeries("1.000001"),
          fetchTencentDayMinuteSeries("0.399001"),
        ]);
        prevSeries = buildSeriesFromTencent(
          shByDay,
          szByDay,
          prevTradeDate,
          prevFullDayBySecId[bjSecId] ?? 0,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[get-market-turnover] tencent prev fallback failed:", message);
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

  if (db && cacheCandidate && isCacheWriteWorthwhile(cachedPrev, cacheCandidate)) {
    try {
      await saveIntradayPrev(db, cacheCandidate.tradeDate, cacheCandidate.points);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-market-turnover] intraday cache write failed:", message);
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
}

const server = createTurnoverServer((now) => buildResponse(now));
server.listen(9000);
