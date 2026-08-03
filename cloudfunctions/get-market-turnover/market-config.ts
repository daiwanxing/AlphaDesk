import type { MarketId } from "@contracts/market-turnover" with {
  "resolution-mode": "import",
};

export type MarketDef = {
  secId: string;
  id: MarketId;
  label: string;
  source: string;
};

export const MARKETS: MarketDef[] = [
  { secId: "1.000001", id: "sh", label: "沪市", source: "上证指数" },
  { secId: "0.399001", id: "sz", label: "深市", source: "深证成指" },
  { secId: "0.899050", id: "bj", label: "京市", source: "北证50" },
];
