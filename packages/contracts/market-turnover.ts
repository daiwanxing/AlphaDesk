export type MarketSession = "pre_open" | "continuous" | "lunch" | "closed" | "weekend";

export type MarketId = "sh" | "sz" | "bj";

export type CompareMode = "vs_prev_same_time" | "vs_prev_full_day";

export type TurnoverPoint = {
  t: string;
  v: number;
};

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

export type MarketTurnoverSeries = {
  tradeDate: string;
  prevTradeDate: string;
  today: TurnoverPoint[];
  prev: TurnoverPoint[];
};

export type TurnoverInsightStatus = "warming_up" | "active" | "unavailable" | "final";

export type TurnoverPaceState =
  | "strongly_contracting"
  | "contracting"
  | "normal"
  | "expanding"
  | "strongly_expanding";

export type TurnoverInsightReason =
  | "insufficient_shape_days"
  | "insufficient_scale_days"
  | "insufficient_samples"
  | "invalid_profile"
  | "invalid_current_data"
  | "stale_profile"
  | "profile_missing";

export type TurnoverBaselineMethod = "kline_scale_short_shape_v1" | "median_intraday_progress_v1";

export type TurnoverBaselineQuality = "bootstrap" | "active" | "mature";

export type TurnoverInsightBaseline = {
  windowDays: number;
  sampleDays: number;
  shapeDays?: number;
  scaleDays?: number;
  firstTradeDate?: string;
  lastTradeDate?: string;
  method: TurnoverBaselineMethod;
  quality: TurnoverBaselineQuality;
};

export type TurnoverInsight = {
  status: TurnoverInsightStatus;
  paceState?: TurnoverPaceState;
  reason?: TurnoverInsightReason;
  effectiveTime: string;
  paceRatio?: number;
  projectedFullDayAmount?: number;
  projectedRange?: { low: number; high: number };
  actualFullDayAmount?: number;
  baseline?: TurnoverInsightBaseline;
  asOf: string;
};

export type MarketTurnoverResponse = {
  ok: true;
  asOf: string;
  session: MarketSession;
  compareMode: CompareMode;
  disclaimer: string;
  markets: MarketTurnoverMarket[];
  total: MarketTurnoverTotal;
  series: MarketTurnoverSeries;
  /** 周末/休市快照对应的交易日（YYYY-MM-DD） */
  snapshotTradeDate?: string;
  turnoverInsight?: TurnoverInsight;
};
