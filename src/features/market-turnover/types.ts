export type MarketSession = "pre_open" | "continuous" | "lunch" | "closed" | "weekend";

export type MarketId = "sh" | "sz" | "bj";

export type CompareMode = "vs_prev_full_day";

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
  /** 周末/休市快照对应的交易日（YYYY-MM-DD） */
  snapshotTradeDate?: string;
};
