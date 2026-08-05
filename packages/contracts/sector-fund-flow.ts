import type { MarketSession } from "./market-turnover.js";

/** 分钟点：t = HH:mm，v = 累计主力净流入（亿元） */
export type SectorFundFlowPoint = {
  t: string;
  v: number;
};

export type SectorFundFlowSeries = {
  code: string;
  name: string;
  /** 当前累计主力净流入（亿元） */
  netInflowYi: number;
  points: SectorFundFlowPoint[];
};

export type SectorFundFlowSelection = "abs_top_8";

export type SectorFundFlowBoardType = "industry";

export type SectorFundFlowResponse = {
  ok: boolean;
  asOf: string;
  session: MarketSession;
  boardType: SectorFundFlowBoardType;
  selection: SectorFundFlowSelection;
  sectors: SectorFundFlowSeries[];
  disclaimer: string;
  error?: string;
};
