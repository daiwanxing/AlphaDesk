export type MinuteAmount = { t: string; amount: number };
export type TurnoverPoint = { t: string; v: number };

type MarketSession = "pre_open" | "continuous" | "lunch" | "closed" | "weekend";

export function parseTrendsLine(line: string): { day: string; t: string; amount: number } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(",");
  if (parts.length < 7) return null;

  const datetime = parts[0]?.trim();
  const amountRaw = parts[6]?.trim();
  if (!datetime || !amountRaw) return null;

  const [day, time] = datetime.split(" ");
  if (!day || !time) return null;

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return null;

  return { day, t: time, amount };
}

export function cumsumMinuteAmounts(minutes: MinuteAmount[]): TurnoverPoint[] {
  let running = 0;
  return minutes.map(({ t, amount }) => {
    running += amount;
    return { t, v: running };
  });
}

export function mergeMarketCumulatives(markets: TurnoverPoint[][]): TurnoverPoint[] {
  if (markets.length === 0) return [];

  const byMarket = markets.map((points) => new Map(points.map((p) => [p.t, p.v])));
  const commonTimes = [...byMarket[0]!.keys()].filter((t) =>
    byMarket.every((lookup) => lookup.has(t)),
  );

  return commonTimes.map((t) => ({
    t,
    v: byMarket.reduce((sum, lookup) => sum + lookup.get(t)!, 0),
  }));
}

export function valueAtOrBefore(points: TurnoverPoint[], t: string): number | undefined {
  let best: TurnoverPoint | undefined;
  for (const point of points) {
    if (point.t > t) break;
    best = point;
  }
  return best?.v;
}

export function pickSeriesDates(
  session: MarketSession,
  todayYmd: string,
  availableDaysSortedAsc: string[],
): { tradeDate: string; prevTradeDate: string } {
  if (availableDaysSortedAsc.length < 2) {
    throw new Error("pickSeriesDates requires at least two available days");
  }

  const latest = availableDaysSortedAsc[availableDaysSortedAsc.length - 1]!;
  const secondLatest = availableDaysSortedAsc[availableDaysSortedAsc.length - 2]!;

  if (session === "weekend" || session === "pre_open") {
    return { tradeDate: latest, prevTradeDate: secondLatest };
  }

  const tradeDate = availableDaysSortedAsc.includes(todayYmd) ? todayYmd : latest;
  const earlier = availableDaysSortedAsc.filter((day) => day < tradeDate);
  const prevTradeDate = earlier[earlier.length - 1];

  if (!prevTradeDate) {
    throw new Error(`No previous trade date before ${tradeDate}`);
  }

  return { tradeDate, prevTradeDate };
}

export function calcDelta(amount: number, baseline: number): { delta: number; deltaPct: number } {
  const delta = amount - baseline;
  const deltaPct = baseline > 0 ? delta / baseline : 0;
  return { delta, deltaPct };
}

/** 用 shape 的进度比例把序列缩放到指定终点（周末补北证分时用）。 */
export function scaleSeriesToEndpoint(shape: TurnoverPoint[], endpoint: number): TurnoverPoint[] {
  const last = shape[shape.length - 1]?.v;
  if (!last || last <= 0 || !Number.isFinite(endpoint) || endpoint < 0) return [];
  return shape.map((point) => ({ t: point.t, v: (point.v / last) * endpoint }));
}
