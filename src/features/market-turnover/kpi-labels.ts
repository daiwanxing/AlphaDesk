import type { MarketSession } from "./types";

export type KpiLabels = {
  primary: string;
  secondary: string;
  delta: string;
};

const INTRADAY_LABELS: KpiLabels = {
  primary: "总成交额",
  secondary: "昨日总成交额",
  delta: "较昨日",
};

const SNAPSHOT_LABELS: KpiLabels = {
  primary: "上交易日成交额",
  secondary: "再上一日成交额",
  delta: "较再上一日",
};

export function kpiLabels(session: MarketSession): KpiLabels {
  if (session === "weekend" || session === "pre_open") {
    return SNAPSHOT_LABELS;
  }
  return INTRADAY_LABELS;
}
