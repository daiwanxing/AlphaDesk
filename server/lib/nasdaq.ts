import { MAG7_TICKERS } from "./constants.ts";

export type NasdaqEarningsRow = {
  symbol: string;
  name: string;
  fiscalQuarterEnding: string;
  time: string;
  epsForecast?: string;
  calendarDate: string;
};

type NasdaqCalendarResponse = {
  data?: {
    rows?: Array<{
      symbol: string;
      name: string;
      fiscalQuarterEnding: string;
      time: string;
      epsForecast?: string;
    }>;
  };
};

const NASDAQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

export async function fetchNasdaqEarningsForDate(date: string): Promise<NasdaqEarningsRow[]> {
  const url = `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;
  const res = await fetch(url, { headers: NASDAQ_HEADERS });
  if (!res.ok) return [];
  const json = (await res.json()) as NasdaqCalendarResponse;
  const rows = json.data?.rows ?? [];
  return rows.filter((r) => MAG7_TICKERS.has(r.symbol)).map((r) => ({ ...r, calendarDate: date }));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Near-term: daily for 90 days. Rest of future year: every 2 days.
 * Past years: skip (SEC covers disclosed).
 */
export function sampleDatesForYear(year: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (year < today.getFullYear()) return [];

  const start = year === today.getFullYear() ? new Date(today) : new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDate(cursor));
    const daysOut = Math.floor((cursor.getTime() - today.getTime()) / 86_400_000);
    cursor.setDate(cursor.getDate() + (daysOut <= 90 ? 1 : 2));
  }
  return dates;
}

async function mapPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 8,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

export async function fetchMag7UpcomingForYear(year: number) {
  const dates = sampleDatesForYear(year);
  if (dates.length === 0) return [];

  const batches = await mapPool(dates, (date) => fetchNasdaqEarningsForDate(date), 8);
  const seen = new Set<string>();
  const events: Array<{
    ticker: string;
    companyName: string;
    scheduledDate: string;
    fiscalQuarterEnding: string;
    time: string;
    epsForecast?: string;
    source: "Nasdaq Calendar";
  }> = [];

  for (const rows of batches) {
    for (const row of rows) {
      const key = `${row.symbol}-${row.fiscalQuarterEnding}-${row.calendarDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        ticker: row.symbol,
        companyName: row.name,
        scheduledDate: row.calendarDate,
        fiscalQuarterEnding: row.fiscalQuarterEnding,
        time: row.time,
        epsForecast: row.epsForecast,
        source: "Nasdaq Calendar",
      });
    }
  }
  return events;
}
