import http from "node:http";
import { URL } from "node:url";
import cloudbase from "@cloudbase/node-sdk";
import { fetchDailyKlines, fetchRealtimeAmounts, MARKETS, type KlineBar } from "./eastmoney";
import { resolveMarketSession, type MarketSession } from "./session";

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || "trader-d4gl4d7a1cb6baebb";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

type PrevEntry = { tradeDate: string; amount: number };

type TurnoverMeta = {
  _id: "turnover";
  prevBySecId: Record<string, PrevEntry>;
  updatedAt: string;
};

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
  delta: number;
  deltaPct: number;
};

type MarketTurnoverResponse = {
  ok: true;
  asOf: string;
  session: MarketSession;
  compareMode: "vs_prev_full_day";
  disclaimer: string;
  markets: MarketTurnoverMarket[];
  total: MarketTurnoverTotal;
  snapshotTradeDate?: string;
};

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  // 不设任何 CORS 头，避免与 CloudBase 网关反射 Origin 拼成 "origin,*"
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

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

function calcDelta(amount: number, prevFullDayAmount: number) {
  const delta = amount - prevFullDayAmount;
  const deltaPct = prevFullDayAmount > 0 ? delta / prevFullDayAmount : 0;
  return { delta, deltaPct };
}

function isKlineSnapshotMode(session: MarketSession): boolean {
  return session === "weekend" || session === "pre_open";
}

function disclaimerFor(session: MarketSession): string {
  if (session === "weekend") {
    return "周末休市 · 展示上一交易日全天成交额";
  }
  if (session === "pre_open") {
    return "盘前 · 展示上一交易日全天成交额";
  }
  return "盘中对比昨收全天 · 非同时刻";
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
): Promise<{ amount: number; prev: number; snapshotTradeDate: string }> {
  const bars = await fetchDailyKlines(secId, 10);
  const snapshot = pickLatestBarBefore(bars, todayYmd, secId);
  const prevBar = pickLatestBarBefore(bars, snapshot.tradeDate, secId);
  return {
    amount: snapshot.amount,
    prev: prevBar.amount,
    snapshotTradeDate: snapshot.tradeDate,
  };
}

async function buildResponse(now: Date): Promise<MarketTurnoverResponse> {
  const session = resolveMarketSession(now);
  const snapshotMode = isKlineSnapshotMode(session);

  let db: ReturnType<typeof dbOf> | null = null;
  let meta: TurnoverMeta = { _id: "turnover", prevBySecId: {}, updatedAt: "" };

  try {
    db = dbOf();
    meta = await loadTurnoverMeta(db);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[get-market-turnover] cache read failed:", message);
  }

  let snapshotTradeDate: string | undefined;
  const markets: MarketTurnoverMarket[] = [];

  if (snapshotMode) {
    const todayYmd = shanghaiYmd(now);
    const snapshots = await Promise.all(
      MARKETS.map(async (market) => {
        const snap = await loadKlineSnapshot(market.secId, todayYmd);
        return { market, snap };
      }),
    );

    for (const { market, snap } of snapshots) {
      snapshotTradeDate = snap.snapshotTradeDate;
      const { delta, deltaPct } = calcDelta(snap.amount, snap.prev);
      markets.push({
        id: market.id,
        label: market.label,
        source: market.source,
        amount: snap.amount,
        prevFullDayAmount: snap.prev,
        delta,
        deltaPct,
      });
    }
  } else {
    const realtime = await fetchRealtimeAmounts();
    const prevBySecId = await resolvePrevAmounts(now, meta, db);

    for (const market of MARKETS) {
      const amount = realtime[market.secId];
      if (amount === undefined) {
        throw new Error(`Missing realtime amount for ${market.secId}`);
      }
      const prevEntry = prevBySecId[market.secId];
      if (!prevEntry) {
        throw new Error(`Missing prev-day amount for ${market.secId}`);
      }
      const { delta, deltaPct } = calcDelta(amount, prevEntry.amount);
      markets.push({
        id: market.id,
        label: market.label,
        source: market.source,
        amount,
        prevFullDayAmount: prevEntry.amount,
        delta,
        deltaPct,
      });
    }
  }

  const totalAmount = markets.reduce((sum, m) => sum + m.amount, 0);
  const totalPrev = markets.reduce((sum, m) => sum + m.prevFullDayAmount, 0);
  const totalDelta = calcDelta(totalAmount, totalPrev);

  const response: MarketTurnoverResponse = {
    ok: true,
    asOf: shanghaiAsOf(now),
    session,
    compareMode: "vs_prev_full_day",
    disclaimer: disclaimerFor(session),
    markets,
    total: {
      amount: totalAmount,
      prevFullDayAmount: totalPrev,
      delta: totalDelta.delta,
      deltaPct: totalDelta.deltaPct,
    },
  };

  if (snapshotTradeDate) {
    response.snapshotTradeDate = snapshotTradeDate;
  }

  return response;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (req.method === "GET" && (path === "/" || path === "/get-market-turnover")) {
    try {
      const body = await buildResponse(new Date());
      sendJson(res, 200, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[get-market-turnover]", message);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

server.listen(9000);
