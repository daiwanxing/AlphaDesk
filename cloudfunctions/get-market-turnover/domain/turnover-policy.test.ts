import { describe, expect, it } from "vitest";

import {
  compareModeFor,
  disclaimerFor,
  isSnapshotSession,
  klineOnlyDisclaimerFor,
} from "./turnover-policy";

describe("turnover domain policy", () => {
  it("treats only weekend and pre-open as historical snapshot sessions", () => {
    expect(isSnapshotSession("weekend")).toBe(true);
    expect(isSnapshotSession("pre_open")).toBe(true);
    expect(isSnapshotSession("continuous")).toBe(false);
    expect(isSnapshotSession("lunch")).toBe(false);
    expect(isSnapshotSession("closed")).toBe(false);
  });

  it("selects same-time comparison only when a comparison series exists", () => {
    expect(compareModeFor(true)).toBe("vs_prev_same_time");
    expect(compareModeFor(false)).toBe("vs_prev_full_day");
  });

  it("keeps full-day and kline-only disclaimers distinct", () => {
    expect(disclaimerFor("vs_prev_same_time")).toBe("同时刻累计对比");
    expect(disclaimerFor("vs_prev_full_day")).toBe("暂无对比日分时，KPI 按昨收全天对比");
    expect(klineOnlyDisclaimerFor()).toBe("分时暂不可用 · 仅展示全天成交额");
  });
});
