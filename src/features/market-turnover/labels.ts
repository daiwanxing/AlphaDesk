import type { CompareMode, MarketSession } from "@contracts/market-turnover";

export const TURNOVER_LABELS = {
  primary: "今日实时成交额",
  secondary: "上一日总成交额",
  /** 分时图昨线图例（略短于 KPI secondary）。 */
  chartPrev: "上一日成交额",
  delta: "较上一日此时",
} as const;

export const SESSION_META: Record<MarketSession, { label: string; tagClass: string }> = {
  continuous: { label: "开盘中", tagClass: "tag tag--success" },
  lunch: { label: "午间休盘", tagClass: "tag tag--warn" },
  closed: { label: "已收盘", tagClass: "tag" },
  weekend: { label: "周末休市", tagClass: "tag" },
  pre_open: { label: "未开盘", tagClass: "tag tag--info" },
};

/** 盘中同时刻差 →「较上一日此时」；收盘后全日差 →「较上一日」。 */
export function deltaLabel(compareMode: CompareMode): string {
  return compareMode === "vs_prev_same_time" ? "较上一日此时" : "较上一日";
}
