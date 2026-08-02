export type MarketSession = "pre_open" | "continuous" | "lunch" | "closed" | "weekend";

export type MarketId = "sh" | "sz" | "bj";

export type CompareMode = "vs_prev_same_time" | "vs_prev_full_day";

export type TurnoverPoint = { t: string; v: number };

export type MarketTurnoverMarket = {
  id: MarketId;
  label: string;
  source: string;
  amount: number;
  prevFullDayAmount: number;
  delta: number;
  deltaPct: number;
};

export type MarketTurnoverTotal = {
  amount: number;
  prevFullDayAmount: number;
  prevSameTimeAmount: number;
  delta: number;
  deltaPct: number;
};

export type MarketTurnoverResponse = {
  ok: true;
  asOf: string;
  session: MarketSession;
  compareMode: CompareMode;
  disclaimer: string;
  markets: MarketTurnoverMarket[];
  total: MarketTurnoverTotal;
  series: {
    tradeDate: string;
    prevTradeDate: string;
    today: TurnoverPoint[];
    prev: TurnoverPoint[];
  };
  /** 周末/休市快照对应的交易日（YYYY-MM-DD） */
  snapshotTradeDate?: string;
};
