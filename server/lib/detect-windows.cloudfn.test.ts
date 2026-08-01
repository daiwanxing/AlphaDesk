import { describe, expect, it } from "vitest";
import {
  isInEarningsWindow,
  isInFomcSlotWindow,
  resolveDetectMode,
} from "../../cloudfunctions/detect-new-materials/detect-windows.ts";

/** 与 server/lib/detect-windows.test.ts 同用例，锁定云函数副本不漂移 */
describe("detect-windows (cloudfunctions copy)", () => {
  it("idle when no windows and daily not due", () => {
    expect(
      resolveDetectMode({
        today: "2026-06-15",
        activeWindows: [],
        lastDailyAt: "2026-06-15T01:00:00.000Z",
        now: "2026-06-15T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("idle");
  });

  it("dense when any active window", () => {
    expect(
      resolveDetectMode({
        today: "2026-01-29",
        activeWindows: [{ eventId: "x", slot: "earnings" }],
        lastDailyAt: "2026-01-29T00:00:00.000Z",
        now: "2026-01-29T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("dense");
  });

  it("daily when outside windows and interval elapsed", () => {
    expect(
      resolveDetectMode({
        today: "2026-06-15",
        activeWindows: [],
        lastDailyAt: "2026-06-14T00:00:00.000Z",
        now: "2026-06-15T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("daily");
  });

  it("earnings / fomc windows", () => {
    expect(isInEarningsWindow("2026-01-28", { scheduledDate: "2026-01-29" })).toBe(true);
    expect(isInFomcSlotWindow("2026-02-05", "2026-01-20", "minutes")).toBe(true);
    expect(isInFomcSlotWindow("2026-01-19", "2026-01-20", "statement")).toBe(true);
  });
});
