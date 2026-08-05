import { MARKETS } from "./market-config";
import { fetchTencentDailyKlines } from "./infrastructure/providers/tencent";
import type { KlineBar } from "./infrastructure/providers/types";

const REQUEST_TIMEOUT_MS = 8_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const EASTMONEY_HEADERS = {
  "User-Agent": BROWSER_UA,
  Referer: "https://quote.eastmoney.com/",
};

const KLINE_UT = "fa5fd1943c7b386f172d7f694b622545";

const ULIST_HOSTS = ["https://push2delay.eastmoney.com", "https://push2.eastmoney.com"] as const;

const KLINE_HOSTS = ["https://push2his.eastmoney.com", "https://push2delay.eastmoney.com"] as const;

// push2 / push2delay 即使 ndays=3 也常只回当日；多日真源是 push2his。
// SCF 出网对 push2/push2his 偶发 fetch failed，delay 相对可达，故 his 优先、delay 兜底。
const TRENDS2_HOSTS = [
  "https://push2his.eastmoney.com",
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
] as const;

type UlistDiff = {
  f6?: number;
  f12?: string;
  f13?: number;
};

type UlistBody = {
  rc?: number;
  data?: { diff?: UlistDiff[] };
};

type KlineBody = {
  rc?: number;
  data?: { klines?: string[] };
};

type Trends2Body = {
  rc?: number;
  data?: { trends?: string[] };
};

function hostOf(url: string): string {
  return new URL(url).host;
}

async function fetchJson<T>(url: string, provider = "Quote"): Promise<T> {
  const host = hostOf(url);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: EASTMONEY_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`${provider} fetch failed host=${host}: ${cause}`);
  }

  if (!res.ok) {
    throw new Error(`${provider} HTTP host=${host} status=${res.status}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`${provider} JSON parse failed host=${host}: ${cause}`);
  }
}

function buildUlistUrl(host: string): string {
  const secids = MARKETS.map((m) => m.secId).join(",");
  return `${host}/api/qt/ulist.np/get?fltt=2&secids=${secids}` + "&fields=f12,f13,f14,f6";
}

function buildKlineUrl(host: string, secId: string, limit: number): string {
  return (
    `${host}/api/qt/stock/kline/get?secid=${encodeURIComponent(secId)}` +
    `&klt=101&fqt=1&lmt=${limit}&end=20500000` +
    "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
    `&ut=${KLINE_UT}`
  );
}

function buildTrends2Url(host: string, secId: string, ndays: 2 | 3): string {
  return (
    `${host}/api/qt/stock/trends2/get?secid=${encodeURIComponent(secId)}` +
    "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
    "&fields2=f51,f52,f53,f54,f55,f56,f57,f58" +
    `&iscr=0&ndays=${ndays}&ut=${KLINE_UT}`
  );
}

function secIdFromDiff(item: UlistDiff): string | null {
  if (!item.f12 || item.f13 === undefined) return null;
  return `${item.f13}.${item.f12}`;
}

function parseUlistBody(body: UlistBody): Record<string, number> {
  if (body.rc !== 0 || !body.data?.diff) {
    throw new Error("ulist response invalid");
  }

  const out: Record<string, number> = {};
  for (const item of body.data.diff) {
    const secId = secIdFromDiff(item);
    if (!secId || item.f6 === undefined) continue;
    out[secId] = item.f6;
  }

  if (Object.keys(out).length === 0) {
    throw new Error("ulist returned no amounts");
  }
  return out;
}

export async function fetchRealtimeAmounts(): Promise<Record<string, number>> {
  const errors: string[] = [];

  for (const host of ULIST_HOSTS) {
    const url = buildUlistUrl(host);
    try {
      const body = await fetchJson<UlistBody>(url, "Eastmoney");
      return parseUlistBody(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }
  }

  throw new Error(`Eastmoney ulist all hosts failed: ${errors.join("; ")}`);
}

function parseKlineBar(line: string): KlineBar | null {
  const parts = line.split(",");
  if (parts.length < 7) return null;
  const tradeDate = parts[0];
  const amount = Number(parts[6]);
  if (!tradeDate || !Number.isFinite(amount)) return null;
  return { tradeDate, amount };
}

function sortBarsAsc(bars: KlineBar[]): KlineBar[] {
  return bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

function parseKlineBody(body: KlineBody, secId: string): KlineBar[] {
  if (body.rc !== 0 || !body.data?.klines?.length) {
    throw new Error(`kline empty or invalid for ${secId}`);
  }

  const bars: KlineBar[] = [];
  for (const line of body.data.klines) {
    const bar = parseKlineBar(line);
    if (bar) bars.push(bar);
  }

  if (bars.length === 0) {
    throw new Error(`kline parsed empty for ${secId}`);
  }
  return sortBarsAsc(bars);
}

function parseTrends2Body(body: Trends2Body, secId: string, minimumDays: 1 | 2): string[] {
  if (body.rc !== 0 || !body.data?.trends?.length) {
    throw new Error(`trends2 empty or invalid for ${secId}`);
  }

  const validLines = body.data.trends.filter((line) => {
    const parts = line.split(",");
    const datetime = parts[0]?.trim() ?? "";
    const amount = Number(parts[6]);
    return (
      parts.length >= 7 &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(datetime) &&
      Number.isFinite(amount)
    );
  });
  const days = new Set(validLines.map((line) => line.slice(0, 10)));
  if (days.size < minimumDays) {
    throw new Error(`trends2 insufficient trading days for ${secId}: ${days.size}`);
  }
  return validLines;
}

export async function fetchTrends2(secId: string, ndays: 2 | 3): Promise<string[]> {
  const errors: string[] = [];
  // 请求 ndays=3 时仍接受 ≥1 日：实时 host 常只给当日；多日靠 his，his 不通时至少能写今日 profile。
  const minimumDays = 1;
  let bestPartial: string[] | null = null;

  for (const host of TRENDS2_HOSTS) {
    const url = buildTrends2Url(host, secId, ndays);
    try {
      const body = await fetchJson<Trends2Body>(url, "Eastmoney");
      const lines = parseTrends2Body(body, secId, minimumDays);
      const days = new Set(lines.map((line) => line.slice(0, 10)));
      if (ndays === 3 && days.size < 2) {
        if (!bestPartial || lines.length > bestPartial.length) bestPartial = lines;
        errors.push(`trends2 only ${days.size} day(s) from ${hostOf(url)}`);
        continue;
      }
      return lines;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }
  }

  if (bestPartial) return bestPartial;

  throw new Error(`Eastmoney trends2 all hosts failed for ${secId}: ${errors.join("; ")}`);
}

export async function fetchDailyKlines(secId: string, limit = 10): Promise<KlineBar[]> {
  const errors: string[] = [];

  for (const host of KLINE_HOSTS) {
    const url = buildKlineUrl(host, secId, limit);
    try {
      const body = await fetchJson<KlineBody>(url, "Eastmoney");
      return parseKlineBody(body, secId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }
  }

  try {
    return await fetchTencentDailyKlines(secId, limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
  }

  throw new Error(`Daily kline all sources failed for ${secId}: ${errors.join("; ")}`);
}
