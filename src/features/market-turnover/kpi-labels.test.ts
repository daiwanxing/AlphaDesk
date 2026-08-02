import { describe, expect, it } from "vitest";
import { kpiLabels } from "./kpi-labels";
import type { MarketSession } from "./types";

const INTRADAY_SESSIONS: MarketSession[] = ["continuous", "lunch", "closed"];
const SNAPSHOT_SESSIONS: MarketSession[] = ["weekend", "pre_open"];

describe("kpiLabels", () => {
  it.each(INTRADAY_SESSIONS)("uses intraday copy for %s", (session) => {
    expect(kpiLabels(session)).toEqual({
      primary: "总成交额",
      secondary: "昨日总成交额",
      delta: "较昨日",
    });
  });

  it.each(SNAPSHOT_SESSIONS)("uses snapshot copy for %s", (session) => {
    expect(kpiLabels(session)).toEqual({
      primary: "上交易日成交额",
      secondary: "再上一日成交额",
      delta: "较再上一日",
    });
  });

  it.each(SNAPSHOT_SESSIONS)("never uses 今日 for %s", (session) => {
    const labels = kpiLabels(session);
    expect(Object.values(labels).join("")).not.toContain("今日");
  });
});
