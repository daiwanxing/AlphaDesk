import type { MarketSession } from "../session";

import type { CompareMode as CompareModeContract } from "@contracts/market-turnover" with {
  "resolution-mode": "import",
};

export type CompareMode = CompareModeContract;

export function isSnapshotSession(session: MarketSession): boolean {
  return session === "weekend" || session === "pre_open";
}

export function compareModeFor(hasComparisonSeries: boolean): CompareMode {
  return hasComparisonSeries ? "vs_prev_same_time" : "vs_prev_full_day";
}

export function disclaimerFor(compareMode: CompareMode): string {
  return compareMode === "vs_prev_full_day"
    ? "暂无对比日分时，KPI 按昨收全天对比"
    : "同时刻累计对比";
}

export function klineOnlyDisclaimerFor(): string {
  return "分时暂不可用 · 仅展示全天成交额";
}
