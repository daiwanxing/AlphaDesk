import { MAG7_TICKERS } from "./constants";

/** 近端 Nasdaq 抽样（云函数用；避免全年逐日打爆超时） */
export async function fetchNearTermMag7Upcoming(opts: {
  daysBack: number;
  daysForward: number;
}): Promise<
  Array<{
    ticker: string;
    companyName: string;
    scheduledDate: string;
  }>
> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let d = -opts.daysBack; d <= opts.daysForward; d++) {
    const x = new Date(today);
    x.setDate(today.getDate() + d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }

  const events: Array<{ ticker: string; companyName: string; scheduledDate: string }> = [];
  const seen = new Set<string>();

  // 串行+间隔，降低 Nasdaq 限流风险
  for (const date of dates) {
    try {
      const url = `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: { rows?: Array<{ symbol: string; name: string }> };
      };
      for (const row of json.data?.rows ?? []) {
        if (!MAG7_TICKERS.has(row.symbol)) continue;
        const key = `${row.symbol}-${date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
          ticker: row.symbol,
          companyName: row.name,
          scheduledDate: date,
        });
      }
    } catch {
      // 单日失败忽略
    }
  }

  return events;
}
