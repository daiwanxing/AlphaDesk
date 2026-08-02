import { describe, expect, it } from "vitest";
import { alignSeriesToAxis, buildTradingMinuteLabels } from "./trading-axis";

/** Morning 09:30–11:30 (121) + afternoon 13:00–15:00 (121), inclusive 1-min steps. */
const TRADING_MINUTE_COUNT = 242;

describe("buildTradingMinuteLabels", () => {
  it("spans morning and afternoon sessions with 1-minute steps", () => {
    const labels = buildTradingMinuteLabels();
    expect(labels).toHaveLength(TRADING_MINUTE_COUNT);
    expect(labels[0]).toBe("09:30");
    expect(labels[120]).toBe("11:30");
    expect(labels[121]).toBe("13:00");
    expect(labels.at(-1)).toBe("15:00");
  });

  it("does not include lunch break minutes", () => {
    const labels = buildTradingMinuteLabels();
    expect(labels).not.toContain("12:00");
    expect(labels).not.toContain("12:30");
  });
});

describe("alignSeriesToAxis", () => {
  const axis = ["09:30", "09:31", "09:32", "11:30", "13:00", "13:01"];

  it("maps known minutes to values", () => {
    expect(
      alignSeriesToAxis(axis, [
        { t: "09:30", v: 1 },
        { t: "09:32", v: 3 },
        { t: "11:30", v: 10 },
        { t: "13:01", v: 12 },
      ]),
    ).toEqual([1, 1, 3, 10, 10, 12]);
  });

  it("bridges internal gaps but does not extend past last observed point", () => {
    expect(
      alignSeriesToAxis(axis, [
        { t: "09:30", v: 1 },
        { t: "11:30", v: 10 },
      ]),
    ).toEqual([1, 1, 1, 10, null, null]);
  });
});
