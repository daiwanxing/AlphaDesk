import { describe, expect, it } from "vitest";
import {
  isInEarningsWindow,
  isInFomcSlotWindow,
  resolveDetectMode,
} from "./detect-windows.ts";

describe("detect-windows", () => {
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

  it("daily when lastDailyAt is null", () => {
    expect(
      resolveDetectMode({
        today: "2026-06-15",
        activeWindows: [],
        lastDailyAt: null,
        now: "2026-06-15T12:00:00.000Z",
        dailyIntervalHours: 24,
      }),
    ).toBe("daily");
  });

  it("earnings window: day before scheduled through 3 days after actual", () => {
    expect(isInEarningsWindow("2026-01-28", { scheduledDate: "2026-01-29" })).toBe(true);
    expect(isInEarningsWindow("2026-02-02", { actualDate: "2026-01-30" })).toBe(true);
    expect(isInEarningsWindow("2026-02-05", { actualDate: "2026-01-30" })).toBe(false);
  });

  it("minutes window roughly day 14–28 after meeting", () => {
    expect(isInFomcSlotWindow("2026-02-05", "2026-01-20", "minutes")).toBe(true);
    expect(isInFomcSlotWindow("2026-01-21", "2026-01-20", "minutes")).toBe(false);
  });

  it("statement and sep share meeting± window", () => {
    expect(isInFomcSlotWindow("2026-01-19", "2026-01-20", "statement")).toBe(true);
    expect(isInFomcSlotWindow("2026-01-23", "2026-01-20", "sep")).toBe(true);
    expect(isInFomcSlotWindow("2026-01-25", "2026-01-20", "statement")).toBe(false);
  });
});
