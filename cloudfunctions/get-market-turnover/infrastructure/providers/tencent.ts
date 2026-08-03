import type { CumulativeMinutePoint, KlineBar } from "./types";

const REQUEST_TIMEOUT_MS = 8_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TENCENT_HEADERS = {
  "User-Agent": BROWSER_UA,
  Referer: "https://quote.eastmoney.com/",
};
const SECID_TO_TX_SYMBOL: Record<string, string> = {
  "1.000001": "sh000001",
  "0.399001": "sz399001",
  "0.899050": "bj899050",
};
const TENCENT_KLINE_BASE = "https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get";
const TENCENT_DAY_MINUTE_BASE = "https://web.ifzq.gtimg.cn/appstock/app/day/query";

type TencentDayMinuteBody = {
  code?: number;
  data?: Record<string, { data?: Array<{ date?: string; data?: string[] }> }>;
};

type TencentKlineBody = {
  code?: number;
  data?: Record<string, { day?: unknown[][] }>;
};

function hostOf(url: string): string {
  return new URL(url).host;
}

async function fetchJson<T>(url: string): Promise<T> {
  const host = hostOf(url);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: TENCENT_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Tencent fetch failed host=${host}: ${cause}`);
  }

  if (!res.ok) {
    throw new Error(`Tencent HTTP host=${host} status=${res.status}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Tencent JSON parse failed host=${host}: ${cause}`);
  }
}

function txSymbolFor(secId: string): string {
  const txSymbol = SECID_TO_TX_SYMBOL[secId];
  if (!txSymbol) {
    throw new Error(`No Tencent symbol mapping for ${secId}`);
  }
  return txSymbol;
}

function buildTencentKlineUrl(secId: string, limit: number): string {
  const txSymbol = txSymbolFor(secId);
  const param = `${txSymbol},day,,,${limit},qfq`;
  return `${TENCENT_KLINE_BASE}?param=${encodeURIComponent(param)}`;
}

function buildTencentDayMinuteUrl(secId: string): string {
  return `${TENCENT_DAY_MINUTE_BASE}?code=${encodeURIComponent(txSymbolFor(secId))}`;
}

function compactYmdToIso(compact: string): string | null {
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** "0930 3833.54 8324010 22322283058.30" — 第 4 段为累计成交额（元）。 */
function parseTencentCumulativeMinuteLine(line: string): CumulativeMinutePoint | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const hhmm = parts[0]!;
  const amount = Number(parts[3]);
  if (!/^\d{4}$/.test(hhmm) || !Number.isFinite(amount)) return null;
  return { t: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, v: amount };
}

function sortBarsAsc(bars: KlineBar[]): KlineBar[] {
  return bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

function parseTencentKlineRow(row: unknown[]): KlineBar | null {
  if (!Array.isArray(row) || row.length < 9) return null;
  const tradeDate = String(row[0]);
  const amountWan = Number(row[8]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate) || !Number.isFinite(amountWan)) {
    return null;
  }
  return { tradeDate, amount: amountWan * 10_000 };
}

function parseTencentKlineBody(
  body: TencentKlineBody,
  secId: string,
  txSymbol: string,
): KlineBar[] {
  if (body.code !== 0 || !body.data?.[txSymbol]?.day?.length) {
    throw new Error(`Tencent kline empty or invalid for ${secId}`);
  }

  const bars: KlineBar[] = [];
  for (const row of body.data[txSymbol].day!) {
    const bar = parseTencentKlineRow(row);
    if (bar) bars.push(bar);
  }

  if (bars.length === 0) {
    throw new Error(`Tencent kline parsed empty for ${secId}`);
  }
  return sortBarsAsc(bars);
}

export async function fetchTencentDailyKlines(secId: string, limit: number): Promise<KlineBar[]> {
  const txSymbol = txSymbolFor(secId);
  const body = await fetchJson<TencentKlineBody>(buildTencentKlineUrl(secId, limit));
  return parseTencentKlineBody(body, secId, txSymbol);
}

/**
 * 腾讯多日分时（沪/深累计额）。东财 trends2 周末常只吐最近一日时，用来补对比日曲线。
 * 北证无额字段，调用方用日 K 终点按进度比例叠加上去。
 */
export async function fetchTencentDayMinuteSeries(
  secId: string,
): Promise<Map<string, CumulativeMinutePoint[]>> {
  const txSymbol = txSymbolFor(secId);
  const body = await fetchJson<TencentDayMinuteBody>(buildTencentDayMinuteUrl(secId));
  const days = body.data?.[txSymbol]?.data;
  if (body.code !== 0 || !days?.length) {
    throw new Error(`Tencent day-minute empty or invalid for ${secId}`);
  }

  const out = new Map<string, CumulativeMinutePoint[]>();
  for (const day of days) {
    const ymd = day.date ? compactYmdToIso(day.date) : null;
    if (!ymd || !day.data?.length) continue;
    const points: CumulativeMinutePoint[] = [];
    for (const line of day.data) {
      const point = parseTencentCumulativeMinuteLine(line);
      if (point) points.push(point);
    }
    if (points.length > 0) out.set(ymd, points);
  }

  if (out.size === 0) {
    throw new Error(`Tencent day-minute parsed empty for ${secId}`);
  }
  return out;
}
