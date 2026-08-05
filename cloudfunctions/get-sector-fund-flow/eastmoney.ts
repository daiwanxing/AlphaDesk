import { TOP_N } from "./constants";

const REQUEST_TIMEOUT_MS = 8_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const EASTMONEY_HEADERS = {
  "User-Agent": BROWSER_UA,
  // 与 data.eastmoney.com/bkzj 行业资金流同口径
  Referer: "https://data.eastmoney.com/bkzj/",
};

const FLOW_UT = "b2884a393a59ad64002292a3e90d46a5";

const CLIST_HOSTS = ["https://push2delay.eastmoney.com", "https://push2.eastmoney.com"] as const;

const FFLOW_HOSTS = [
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://push2his.eastmoney.com",
] as const;

export type IndustryBoardRow = {
  code: string;
  name: string;
  /** 主力净流入（元） */
  netInflowYuan: number;
};

type ClistDiff = {
  f12?: string;
  f14?: string;
  f62?: number;
};

type ClistBody = {
  rc?: number;
  data?: { diff?: ClistDiff[] | Record<string, ClistDiff> };
};

type FflowBody = {
  rc?: number;
  data?: { klines?: string[] };
};

function hostOf(url: string): string {
  return new URL(url).host;
}

async function fetchJson<T>(url: string, provider = "Eastmoney"): Promise<T> {
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

function buildClistUrl(host: string, page: number, order: 0 | 1): string {
  return (
    `${host}/api/qt/clist/get?pn=${page}&pz=${TOP_N}&po=${order}&np=1&fltt=2&invt=2` +
    // 东财「板块资金流向·行业」用 m:90+s:4（标准行业）；m:90+t:2 会混入电子/通信等层级聚合板
    `&fid=f62&fs=${encodeURIComponent("m:90+s:4")}` +
    `&fields=f12,f14,f62&ut=${FLOW_UT}`
  );
}

function buildFflowUrl(host: string, code: string): string {
  return (
    `${host}/api/qt/stock/fflow/kline/get?secid=${encodeURIComponent(`90.${code}`)}` +
    `&klt=1&lmt=300` +
    `&fields1=f1,f2,f3,f7` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65` +
    `&ut=${FLOW_UT}`
  );
}

function normalizeDiff(diff: ClistBody["data"]): ClistDiff[] {
  const raw = diff?.diff;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
}

export function parseIndustryClistBody(body: ClistBody): IndustryBoardRow[] {
  if (body.rc !== 0) {
    throw new Error("clist response invalid");
  }

  const rows: IndustryBoardRow[] = [];
  for (const item of normalizeDiff(body.data)) {
    const code = item.f12?.trim();
    const name = item.f14?.trim();
    const net = item.f62;
    // 盘前东财常把当日主力净流入 f62 置为 "-"，跳过即可，勿当上游故障
    if (!code || !name || !Number.isFinite(net)) continue;
    rows.push({ code, name, netInflowYuan: net as number });
  }

  return rows;
}

export async function fetchIndustryClist(): Promise<IndustryBoardRow[]> {
  const errors: string[] = [];

  for (const host of CLIST_HOSTS) {
    try {
      // po=1 大流入端、po=0 大流出端各一页，合并后再按 |净流入| 截断 Top N
      const [descBody, ascBody] = await Promise.all([
        fetchJson<ClistBody>(buildClistUrl(host, 1, 1)),
        fetchJson<ClistBody>(buildClistUrl(host, 1, 0)),
      ]);
      const byCode = new Map<string, IndustryBoardRow>();
      for (const row of [...parseIndustryClistBody(descBody), ...parseIndustryClistBody(ascBody)]) {
        byCode.set(row.code, row);
      }
      // 合法响应但无有限 f62（典型盘前）→ 空列表，由上层当空态而非失败
      return [...byCode.values()];
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(`Eastmoney clist all hosts failed: ${errors.join("; ")}`);
}

export function parseFflowKlineBody(body: FflowBody, code: string): string[] {
  if (body.rc !== 0 || !body.data?.klines?.length) {
    throw new Error(`fflow empty or invalid for ${code}`);
  }
  return body.data.klines;
}

export async function fetchBoardFflowKline(code: string): Promise<string[]> {
  const errors: string[] = [];

  for (const host of FFLOW_HOSTS) {
    try {
      const body = await fetchJson<FflowBody>(buildFflowUrl(host, code));
      return parseFflowKlineBody(body, code);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(`Eastmoney fflow all hosts failed for ${code}: ${errors.join("; ")}`);
}
