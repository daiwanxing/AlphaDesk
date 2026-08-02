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

const SECID_TO_TX_SYMBOL: Record<string, string> = {
  "1.000001": "sh000001",
  "0.399001": "sz399001",
  "0.899050": "bj899050",
};

const TENCENT_KLINE_BASE = "https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get";

export type MarketDef = {
  secId: string;
  id: "sh" | "sz" | "bj";
  label: string;
  source: string;
};

export const MARKETS: MarketDef[] = [
  { secId: "1.000001", id: "sh", label: "沪市", source: "上证指数" },
  { secId: "0.399001", id: "sz", label: "深市", source: "深证成指" },
  { secId: "0.899050", id: "bj", label: "京市", source: "北证50" },
];

export type KlineBar = {
  tradeDate: string;
  amount: number;
};

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

type TencentKlineBody = {
  code?: number;
  data?: Record<string, { day?: unknown[][] }>;
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

function sortBarsAsc(bars: KlineBar[]): KlineBar[] {
  return bars.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
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

async function fetchTencentDailyKlines(secId: string, limit: number): Promise<KlineBar[]> {
  const txSymbol = txSymbolFor(secId);
  const url = buildTencentKlineUrl(secId, limit);
  const body = await fetchJson<TencentKlineBody>(url, "Tencent");
  return parseTencentKlineBody(body, secId, txSymbol);
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
